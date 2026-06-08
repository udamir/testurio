/**
 * `defineBindings<TopicMap, Registry>()` — typed helper that pins
 * `ProtobufCodec` bindings to the topic-payload contract at TS compile time.
 *
 * Pure type-level pass-through: runtime returns the entries array verbatim;
 * the value of the helper is the constraint on its input.
 *
 * - Every entry's `type` must be a key of `Registry` (catches FQN typos).
 * - For **string-match** entries, `Registry[entry.type]` must be assignable
 *   to `TopicMap[entry.match]` (catches topic ↔ wire-type mismatches).
 * - For **RegExp / predicate** entries, only the `type ∈ keyof Registry`
 *   constraint applies (no way to statically resolve which topic a RegExp
 *   matches).
 */

import type { ProtobufBindingEntry } from "./protobuf.codec";

/**
 * Maps protobuf fully-qualified type names to TS types.
 * User maintains this alongside their `.proto` files. A codegen tool may
 * auto-generate this in a follow-up task.
 */
export type ProtobufTypeRegistry = Record<string, unknown>;

/**
 * Resolve the set of Registry keys whose value type is assignable to T.
 */
type TypeNameFor<T, Registry extends ProtobufTypeRegistry> = {
	[N in keyof Registry & string]: Registry[N] extends T ? N : never;
}[keyof Registry & string];

/**
 * Entry with type-level constraints tying `match` ↔ `type` via Registry.
 */
export type TypedBindingEntry<TopicMap, Registry extends ProtobufTypeRegistry> =
	| {
			[K in keyof TopicMap & string]: {
				match: K;
				type: TypeNameFor<TopicMap[K], Registry>;
			};
	  }[keyof TopicMap & string]
	| { match: RegExp; type: keyof Registry & string }
	| { match: (key: string) => boolean; type: keyof Registry & string };

/**
 * Type-level pass-through. Runtime returns the entries array verbatim.
 *
 * @example
 *   type Registry = {
 *     "pkg.OrderEvent": OrderEvent;
 *     "pkg.UserEvent": UserEvent;
 *   };
 *   interface MyTopics {
 *     "orders.v1": OrderEvent;
 *     "users.v1": UserEvent;
 *   }
 *
 *   const bindings = defineBindings<MyTopics, Registry>()([
 *     { match: "orders.v1", type: "pkg.OrderEvent" }, // ✅
 *     { match: "users.v1",  type: "pkg.OrderEvent" }, // ❌ TS error
 *     { match: /^audit\./,  type: "pkg.OrderEvent" }, // ✅ (RegExp — type checked only)
 *   ]);
 *
 *   new ProtobufCodec({ proto: "./events.proto", bindings });
 */
export function defineBindings<TopicMap, Registry extends ProtobufTypeRegistry>() {
	return <const Entries extends ReadonlyArray<TypedBindingEntry<TopicMap, Registry>>>(
		entries: Entries
	): ReadonlyArray<ProtobufBindingEntry> => entries as unknown as ReadonlyArray<ProtobufBindingEntry>;
}
