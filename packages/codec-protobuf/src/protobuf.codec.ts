/**
 * ProtobufCodec — first-class protobuf `Codec` with per-topic message-type
 * dispatch via an ordered bindings array.
 *
 * Each binding pairs a matcher (`string` exact / `RegExp` / predicate) with
 * a fully-qualified protobuf type name. The codec uses the dispatch `key`
 * (set by the adapter to the **concrete** topic, per task 034 R1) to pick
 * which `protobuf.Type` to encode/decode. First match wins.
 *
 * Throws `CodecError` when no entry matches the key. No silent fallback.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import * as protobuf from "protobufjs";
import type { Codec, WireFormat } from "testurio";
import { CodecError } from "testurio";

/**
 * A matcher decides whether a given runtime key resolves to a binding entry.
 *
 * - `string` — exact equality (`key === match`).
 * - `RegExp` — `match.test(key)`. Use anchored regex (`^…$`) for strict
 *   single-segment matching; unanchored is allowed.
 * - `(key) => boolean` — predicate. Use this to compose with the adapter
 *   matcher utilities exposed by task 039 (`matchAmqpTopic` from
 *   `@testurio/adapter-rabbitmq`, `matchGlobChannel` from
 *   `@testurio/adapter-redis`, `matchRegex` from `@testurio/adapter-kafka`),
 *   or for any custom runtime condition.
 *
 * The predicate is invoked with the concrete topic key per the R1 invariant —
 * never a subscription pattern. Predicates that throw are treated as
 * "no match" and the scan continues; the last thrown error is captured on
 * `CodecError.cause` if no later entry matches (R7).
 */
export type ProtobufBindingMatch = string | RegExp | ((key: string) => boolean);

export interface ProtobufBindingEntry {
	/**
	 * Matcher tested against the runtime dispatch key. See ProtobufBindingMatch.
	 */
	match: ProtobufBindingMatch;

	/**
	 * Fully-qualified protobuf type name used for both encode and decode of
	 * messages whose key matches this entry. Resolved via `Root.lookupType`
	 * at codec construction time — typos throw early.
	 *
	 * @example "pkg.OrderEvent"
	 */
	type: string;
}

export interface ProtobufCodecOptions {
	/**
	 * `.proto` source(s) for the codec. One of:
	 *
	 * - `string` — path to a single `.proto` file. Relative `import` directives
	 *   are resolved next to it by protobufjs's default `Root.resolvePath`.
	 *   Well-known types (`google/protobuf/*`) are resolved from protobufjs's
	 *   bundled `common` definitions automatically.
	 *
	 * - `string[]` — load several files into one root in a single call.
	 *   Use this when your bindings span multiple top-level `.proto` files.
	 *
	 * R4 (v2.1): the previous `protobuf.Root` escape hatch is dropped —
	 * `instanceof protobuf.Root` is fragile across duplicate protobufjs
	 * installs. `protoc -I include/path` semantics are covered by
	 * `includePaths` below.
	 */
	proto: string | string[];

	/**
	 * Search paths for `import` directives in the loaded `.proto` files —
	 * mirror of `protoc -I include/path`. Paths are searched in order; the
	 * first existing file wins. Default `Root.resolvePath` (next-to-origin
	 * + protobufjs's bundled well-known types) is still consulted if none
	 * match.
	 *
	 * @example
	 *   includePaths: [path.resolve(__dirname, "schemas")]
	 *   // events/orders.proto can now `import "shared/types.proto";`
	 *   // resolved against schemas/shared/types.proto
	 */
	includePaths?: ReadonlyArray<string>;

	/**
	 * Ordered binding entries. The codec evaluates entries in declaration
	 * order on every encode and decode; the first entry whose `match` returns
	 * true for the runtime key wins. Entries with overlapping matchers are
	 * legal — order disambiguates.
	 */
	bindings: ReadonlyArray<ProtobufBindingEntry>;

	/**
	 * protobufjs `toObject` options applied on every decode.
	 * Defaults (A9): `{ defaults: true, longs: String, enums: String }`.
	 * `bytes` is intentionally NOT defaulted — protobufjs's native default
	 * (`bytes → Uint8Array`) kicks in, which is what binary-envelope use
	 * cases want. Override to get base64 strings or `Array`s.
	 */
	decodeOptions?: protobuf.IConversionOptions;
}

interface ResolvedEntry {
	readonly source: ProtobufBindingEntry;
	readonly type: protobuf.Type;
}

/**
 * Protobuf codec with ordered, mixed-matcher bindings.
 *
 * A single codec instance handles every topic the Publisher/Subscriber emits
 * or receives. Exact, RegExp, and predicate matchers can mix freely in the
 * same bindings array.
 */
export class ProtobufCodec implements Codec<Uint8Array> {
	readonly name = "protobuf";
	readonly wireFormat: WireFormat = "binary";

	private readonly root: protobuf.Root;
	private readonly entries: ReadonlyArray<ResolvedEntry>;
	private readonly decodeOptions: protobuf.IConversionOptions;

	constructor(options: ProtobufCodecOptions) {
		this.root = new protobuf.Root();
		if (options.includePaths && options.includePaths.length > 0) {
			const defaultResolve = this.root.resolvePath.bind(this.root);
			const includePaths = options.includePaths;
			this.root.resolvePath = (origin: string, target: string) => {
				for (const base of includePaths) {
					const candidate = path.resolve(base, target);
					if (existsSync(candidate)) return candidate;
				}
				return defaultResolve(origin, target);
			};
		}
		this.root.loadSync(options.proto);

		// Resolve every type up front — typos throw at construction, not runtime.
		this.entries = options.bindings.map((entry) => ({
			source: entry,
			type: this.root.lookupType(entry.type),
		}));

		// A9: `bytes` omitted so protobufjs's native `bytes → Uint8Array` kicks in.
		this.decodeOptions = options.decodeOptions ?? {
			defaults: true,
			longs: String,
			enums: String,
		};
	}

	encode<D>(data: D, key?: string): Uint8Array {
		const type = this.resolveType(key, "encode", data);

		try {
			const message = type.fromObject(data as object);
			const err = type.verify(message);
			if (err) {
				throw CodecError.encodeError(this.name, new Error(`protobuf verify failed for ${type.fullName}: ${err}`), data);
			}
			return type.encode(message).finish();
		} catch (error) {
			if (error instanceof CodecError) throw error;
			throw CodecError.encodeError(this.name, error instanceof Error ? error : new Error(String(error)), data);
		}
	}

	decode<D>(wire: string | Uint8Array, key?: string): D {
		const type = this.resolveType(key, "decode", wire);

		const bytes = typeof wire === "string" ? new TextEncoder().encode(wire) : wire;
		try {
			const message = type.decode(bytes);
			return type.toObject(message, this.decodeOptions) as D;
		} catch (error) {
			if (error instanceof CodecError) throw error;
			throw CodecError.decodeError(
				this.name,
				error instanceof Error ? error : new Error(String(error)),
				this.truncateSubject(bytes)
			);
		}
	}

	// -- private helpers ----------------------------------------------------

	/**
	 * First-match-wins resolution over the entries array.
	 *
	 * R7: predicates that throw are treated as "no match" and the scan
	 * continues, BUT the last thrown error is captured in `predicateThrow`
	 * so the no-match `CodecError` can surface it via `.cause`.
	 */
	private matchEntry(key: string): {
		hit?: ResolvedEntry;
		predicateThrow?: Error;
	} {
		let predicateThrow: Error | undefined;
		for (const entry of this.entries) {
			const m = entry.source.match;
			try {
				if (typeof m === "string") {
					if (m === key) return { hit: entry };
				} else if (m instanceof RegExp) {
					if (m.test(key)) return { hit: entry };
				} else {
					if (m(key)) return { hit: entry };
				}
			} catch (err) {
				predicateThrow = err instanceof Error ? err : new Error(String(err));
			}
		}
		return { predicateThrow };
	}

	private resolveType(key: string | undefined, direction: "encode" | "decode", subject: unknown): protobuf.Type {
		if (key !== undefined) {
			const { hit, predicateThrow } = this.matchEntry(key);
			if (hit) return hit.type;
			return this.throwNoMatch(direction, subject, key, predicateThrow);
		}

		return this.throwNoMatch(direction, subject, undefined);
	}

	private throwNoMatch(
		direction: "encode" | "decode",
		subject: unknown,
		key: string | undefined,
		cause?: Error
	): never {
		const summary = this.entries.map((e) => `${describeMatch(e.source.match)} → ${e.type.fullName}`).join(", ");
		const reason =
			key === undefined
				? `${direction} called without a dispatch key — ProtobufCodec requires a key matching one of: [${summary}]`
				: `No binding entry matched key='${key}' — ProtobufCodec entries: [${summary}]`;
		const wrapped = new Error(reason);
		if (cause) wrapped.cause = cause;
		const truncated = this.truncateSubject(subject);
		throw direction === "encode"
			? CodecError.encodeError(this.name, wrapped, truncated)
			: CodecError.decodeError(this.name, wrapped, truncated);
	}

	/**
	 * M-5: when subject is Uint8Array, log byteLength + first-16-byte hex
	 * preview instead of the raw bytes. Prevents large-payload log spam.
	 */
	private truncateSubject(subject: unknown): unknown {
		if (subject instanceof Uint8Array) {
			const hex = Array.from(subject.slice(0, 16))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			return `<Uint8Array len=${subject.byteLength} 0x${hex}${subject.byteLength > 16 ? "…" : ""}>`;
		}
		return subject;
	}
}

function describeMatch(m: ProtobufBindingMatch): string {
	if (typeof m === "string") return JSON.stringify(m);
	if (m instanceof RegExp) return m.toString();
	return "<predicate>";
}
