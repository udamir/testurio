/**
 * Deep Equal
 *
 * Loose + strict structural equality covering primitives, NaN, Date,
 * RegExp, Map, Set, typed arrays, arrays, plain objects, and circular
 * references via a parallel WeakMap. No support for asymmetric matchers
 * — that's a unit-testing concern outside testurio's scope.
 *
 * - strict: true  — toStrictEqual semantics. Same prototype required, no
 *                   undefined-vs-missing leniency, same key count required.
 * - strict: false — toEqual semantics. Lenient on undefined props
 *                   (`{ a: 1 }` equals `{ a: 1, b: undefined }`).
 */

export interface DeepEqualOpts {
	strict: boolean;
}

export function isDeepEqual(a: unknown, b: unknown, opts: DeepEqualOpts): boolean {
	return walk(a, b, opts, new WeakMap<object, WeakSet<object>>());
}

function walk(a: unknown, b: unknown, opts: DeepEqualOpts, seen: WeakMap<object, WeakSet<object>>): boolean {
	if (a === b) return true;
	if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false; // BigInt + function: strict equality already failed

	// Circular guard
	const aSeen = seen.get(a as object) ?? new WeakSet<object>();
	if (aSeen.has(b as object)) return true;
	aSeen.add(b as object);
	seen.set(a as object, aSeen);

	// Prototype check (strict only)
	if (opts.strict && Object.getPrototypeOf(a as object) !== Object.getPrototypeOf(b as object)) return false;

	// Special object types
	if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
	if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
	if (a instanceof Map && b instanceof Map) return equalMap(a, b, opts, seen);
	if (a instanceof Set && b instanceof Set) return equalSet(a, b, opts, seen);
	if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) return equalTypedArray(a, b);

	// Array vs non-array is never equal, regardless of mode.
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!walk(a[i], b[i], opts, seen)) return false;
		}
		return true;
	}

	// Plain object
	const aKeys = Object.keys(a as object);
	const bKeys = Object.keys(b as object);
	if (opts.strict && aKeys.length !== bKeys.length) return false;

	const allKeys = opts.strict ? aKeys : Array.from(new Set([...aKeys, ...bKeys]));
	for (const k of allKeys) {
		if (!walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], opts, seen)) {
			return false;
		}
	}
	return true;
}

function equalMap(
	a: Map<unknown, unknown>,
	b: Map<unknown, unknown>,
	opts: DeepEqualOpts,
	seen: WeakMap<object, WeakSet<object>>
): boolean {
	if (a.size !== b.size) return false;
	for (const [k, av] of a.entries()) {
		if (!b.has(k)) return false;
		if (!walk(av, b.get(k), opts, seen)) return false;
	}
	return true;
}

function equalSet(
	a: Set<unknown>,
	b: Set<unknown>,
	opts: DeepEqualOpts,
	seen: WeakMap<object, WeakSet<object>>
): boolean {
	if (a.size !== b.size) return false;
	// Set membership: each a-value must have a structural match somewhere in b.
	const bArr = Array.from(b.values());
	const used = new Set<number>();
	for (const av of a.values()) {
		let found = false;
		for (let i = 0; i < bArr.length; i++) {
			if (used.has(i)) continue;
			if (walk(av, bArr[i], opts, seen)) {
				used.add(i);
				found = true;
				break;
			}
		}
		if (!found) return false;
	}
	return true;
}

function equalTypedArray(a: ArrayBufferView, b: ArrayBufferView): boolean {
	if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
	if (a.byteLength !== b.byteLength) return false;
	const av = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
	const bv = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
	for (let i = 0; i < av.length; i++) {
		if (av[i] !== bv[i]) return false;
	}
	return true;
}
