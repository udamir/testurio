/**
 * deep-equal unit tests
 *
 * Covers loose + strict structural equality for primitives, NaN, Date,
 * RegExp, Map, Set, typed arrays, arrays, plain objects, and circular
 * references.
 */

import { describe, expect, it } from "vitest";

import { isDeepEqual } from "../../packages/core/src/components/base/expect/deep-equal";

const LOOSE = { strict: false } as const;
const STRICT = { strict: true } as const;

describe("isDeepEqual — primitives", () => {
	it("compares numbers, strings, booleans, null", () => {
		expect(isDeepEqual(1, 1, LOOSE)).toBe(true);
		expect(isDeepEqual(1, 2, LOOSE)).toBe(false);
		expect(isDeepEqual("a", "a", LOOSE)).toBe(true);
		expect(isDeepEqual("a", "b", LOOSE)).toBe(false);
		expect(isDeepEqual(true, true, LOOSE)).toBe(true);
		expect(isDeepEqual(null, null, LOOSE)).toBe(true);
		expect(isDeepEqual(null, undefined, LOOSE)).toBe(false);
	});

	it("treats NaN as equal to NaN", () => {
		expect(isDeepEqual(Number.NaN, Number.NaN, LOOSE)).toBe(true);
		expect(isDeepEqual(Number.NaN, Number.NaN, STRICT)).toBe(true);
	});

	it("returns false for mixed types", () => {
		expect(isDeepEqual(1, "1", LOOSE)).toBe(false);
		expect(isDeepEqual({}, [], LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — loose vs strict on undefined props", () => {
	it("loose: { a: 1 } equals { a: 1, b: undefined }", () => {
		expect(isDeepEqual({ a: 1 }, { a: 1, b: undefined }, LOOSE)).toBe(true);
	});

	it("strict: { a: 1 } differs from { a: 1, b: undefined } (key count)", () => {
		expect(isDeepEqual({ a: 1 }, { a: 1, b: undefined }, STRICT)).toBe(false);
	});
});

describe("isDeepEqual — Date", () => {
	it("compares by getTime", () => {
		const a = new Date("2026-01-01T00:00:00.000Z");
		const b = new Date("2026-01-01T00:00:00.000Z");
		const c = new Date("2027-01-01T00:00:00.000Z");
		expect(isDeepEqual(a, b, LOOSE)).toBe(true);
		expect(isDeepEqual(a, c, LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — RegExp", () => {
	it("compares source + flags", () => {
		expect(isDeepEqual(/abc/g, /abc/g, LOOSE)).toBe(true);
		expect(isDeepEqual(/abc/g, /abc/i, LOOSE)).toBe(false);
		expect(isDeepEqual(/abc/, /abd/, LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — Map", () => {
	it("equal Maps", () => {
		const a = new Map([
			["a", 1],
			["b", 2],
		]);
		const b = new Map([
			["b", 2],
			["a", 1],
		]);
		expect(isDeepEqual(a, b, LOOSE)).toBe(true);
	});

	it("different values fail", () => {
		const a = new Map([["a", 1]]);
		const b = new Map([["a", 2]]);
		expect(isDeepEqual(a, b, LOOSE)).toBe(false);
	});

	it("different sizes fail", () => {
		const a = new Map([["a", 1]]);
		const b = new Map([
			["a", 1],
			["b", 2],
		]);
		expect(isDeepEqual(a, b, LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — Set", () => {
	it("equal Sets", () => {
		expect(isDeepEqual(new Set([1, 2, 3]), new Set([3, 2, 1]), LOOSE)).toBe(true);
	});

	it("different members fail", () => {
		expect(isDeepEqual(new Set([1, 2]), new Set([1, 3]), LOOSE)).toBe(false);
	});

	it("structural members (objects)", () => {
		expect(isDeepEqual(new Set([{ a: 1 }]), new Set([{ a: 1 }]), LOOSE)).toBe(true);
	});
});

describe("isDeepEqual — typed arrays", () => {
	it("equal typed arrays", () => {
		expect(isDeepEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]), LOOSE)).toBe(true);
	});

	it("different bytes fail", () => {
		expect(isDeepEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]), LOOSE)).toBe(false);
	});

	it("different lengths fail", () => {
		expect(isDeepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]), LOOSE)).toBe(false);
	});

	it("different prototypes fail (Uint8Array vs Int8Array)", () => {
		expect(isDeepEqual(new Uint8Array([1, 2]), new Int8Array([1, 2]), LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — arrays", () => {
	it("nested arrays", () => {
		expect(isDeepEqual([1, [2, [3, 4]]], [1, [2, [3, 4]]], LOOSE)).toBe(true);
		expect(isDeepEqual([1, [2, [3, 4]]], [1, [2, [3, 5]]], LOOSE)).toBe(false);
	});

	it("different lengths fail", () => {
		expect(isDeepEqual([1, 2], [1, 2, 3], LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — nested objects", () => {
	it("deep equality", () => {
		const a = { user: { id: 1, profile: { name: "Alice" } } };
		const b = { user: { id: 1, profile: { name: "Alice" } } };
		expect(isDeepEqual(a, b, LOOSE)).toBe(true);
	});

	it("deep inequality", () => {
		const a = { user: { id: 1, profile: { name: "Alice" } } };
		const b = { user: { id: 1, profile: { name: "Bob" } } };
		expect(isDeepEqual(a, b, LOOSE)).toBe(false);
	});
});

describe("isDeepEqual — circular references", () => {
	it("handles circular A→B→A vs C→D→C as equal when structurally same", () => {
		const a: Record<string, unknown> = { name: "x" };
		const b: Record<string, unknown> = { name: "y", parent: a };
		a.child = b;
		const c: Record<string, unknown> = { name: "x" };
		const d: Record<string, unknown> = { name: "y", parent: c };
		c.child = d;
		expect(isDeepEqual(a, c, LOOSE)).toBe(true);
	});

	it("does not loop on simple self-referential ref", () => {
		const a: Record<string, unknown> = { x: 1 };
		a.self = a;
		const b: Record<string, unknown> = { x: 1 };
		b.self = b;
		expect(isDeepEqual(a, b, LOOSE)).toBe(true);
	});
});

describe("isDeepEqual — prototype handling (strict)", () => {
	it("strict: different prototypes differ", () => {
		class Foo {
			x = 1;
		}
		const plain = { x: 1 };
		expect(isDeepEqual(new Foo(), plain, STRICT)).toBe(false);
	});

	it("loose: same shape compares equal regardless of prototype", () => {
		class Foo {
			x = 1;
		}
		const plain = { x: 1 };
		expect(isDeepEqual(new Foo(), plain, LOOSE)).toBe(true);
	});
});
