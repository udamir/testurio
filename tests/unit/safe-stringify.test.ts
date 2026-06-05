/**
 * safe-stringify unit tests
 *
 * Tests for the zero-dep safeStringify + safeStringifyMultiline used by
 * the expect API in packages/core/src/components/base/expect/safe-stringify.ts.
 */

import { describe, expect, it } from "vitest";

import { safeStringify, safeStringifyMultiline } from "../../packages/core/src/components/base/expect/safe-stringify";

const M = 4096; // default max bytes

describe("safeStringify", () => {
	it("renders undefined as the literal 'undefined'", () => {
		expect(safeStringify(undefined, { maxBytes: M })).toBe("undefined");
	});

	it("renders primitives via JSON.stringify", () => {
		expect(safeStringify(null, { maxBytes: M })).toBe("null");
		expect(safeStringify(42, { maxBytes: M })).toBe("42");
		expect(safeStringify("hi", { maxBytes: M })).toBe('"hi"');
		expect(safeStringify(true, { maxBytes: M })).toBe("true");
	});

	it("renders bigint with trailing 'n' suffix", () => {
		expect(safeStringify(123n, { maxBytes: M })).toBe('"123n"');
	});

	it("renders functions with name when available", () => {
		const named = function foo(): void {};
		const anon = (): void => {};
		expect(safeStringify(named, { maxBytes: M })).toBe('"[Function: foo]"');
		// Arrow assigned to const inherits variable name, but at top level might be empty
		const result = safeStringify(anon, { maxBytes: M });
		expect(result.startsWith('"[Function')).toBe(true);
	});

	it("renders Map with __type tag and entries", () => {
		const m = new Map<string, number>([
			["a", 1],
			["b", 2],
		]);
		const out = safeStringify(m, { maxBytes: M });
		expect(out).toContain('"__type": "Map"');
		expect(out).toContain('"entries"');
		expect(out).toContain('"a"');
	});

	it("renders Set with __type tag and values", () => {
		const s = new Set<number>([1, 2, 3]);
		const out = safeStringify(s, { maxBytes: M });
		expect(out).toContain('"__type": "Set"');
		expect(out).toContain('"values"');
		expect(out).toContain("1");
	});

	it("renders Date as ISO", () => {
		const d = new Date("2026-06-05T00:00:00.000Z");
		const out = safeStringify(d, { maxBytes: M });
		expect(out).toContain('"__type": "Date"');
		expect(out).toContain('"2026-06-05T00:00:00.000Z"');
	});

	it("renders Error with name + message", () => {
		const e = new TypeError("nope");
		const out = safeStringify(e, { maxBytes: M });
		expect(out).toContain('"__type": "Error"');
		expect(out).toContain('"name": "TypeError"');
		expect(out).toContain('"message": "nope"');
	});

	it("handles circular references with [Circular]", () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj.self = obj;
		const out = safeStringify(obj, { maxBytes: M });
		expect(out).toContain('"[Circular]"');
		// Does not throw.
	});

	it("truncates output beyond maxBytes with a marker", () => {
		const big = "x".repeat(10_000);
		const out = safeStringify(big, { maxBytes: 100 });
		expect(out).toContain("(truncated, original");
		expect(out.length).toBeLessThan(200);
	});
});

describe("safeStringifyMultiline", () => {
	it("delegates scalars to safeStringify (one-line)", () => {
		expect(safeStringifyMultiline(42, 0, 6, 256)).toBe("42");
		expect(safeStringifyMultiline("hi", 0, 6, 256)).toBe('"hi"');
		expect(safeStringifyMultiline(null, 0, 6, 256)).toBe("null");
	});

	it("uses single-line form when result fits in 60 chars", () => {
		const small = { a: 1 };
		expect(safeStringifyMultiline(small, 0, 6, 256)).toBe(safeStringify(small, { maxBytes: 256 }));
	});

	it("expands to multi-line indented form for larger structures", () => {
		const big = {
			id: 1,
			name: "Alice Wonderland",
			role: "administrator",
			extras: { city: "Wonder Town", zip: "00000" },
		};
		const out = safeStringifyMultiline(big, 0, 6, 256);
		expect(out).toContain("\n");
		expect(out).toContain('"name": "Alice Wonderland"');
		// Has opening brace at start and closing at end.
		expect(out.startsWith("{")).toBe(true);
		expect(out.endsWith("}")).toBe(true);
	});

	it("renders empty arrays and objects compactly", () => {
		expect(safeStringifyMultiline([], 0, 6, 256)).toBe("[]");
		expect(safeStringifyMultiline({}, 0, 6, 256)).toBe("{}");
	});

	it("caps depth and emits '…' marker beyond maxDepth", () => {
		// Build deeply nested object that won't collapse to one-line.
		const deep: Record<string, unknown> = {};
		let cur = deep;
		for (let i = 0; i < 10; i++) {
			cur.next = {
				padding: "x".repeat(80),
				wrapped: {},
			};
			cur = (cur.next as { padding: string; wrapped: Record<string, unknown> }).wrapped;
		}
		const out = safeStringifyMultiline(deep, 0, 3, 256);
		expect(out).toContain('"…"');
	});

	it("handles circular refs without infinite loop", () => {
		const obj: Record<string, unknown> = { padding: "x".repeat(80) };
		obj.self = obj;
		const out = safeStringifyMultiline(obj, 0, 6, 256);
		expect(out).toContain('"[Circular]"');
	});
});
