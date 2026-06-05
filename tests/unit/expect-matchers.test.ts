/**
 * expect() matcher unit tests
 *
 * Note: the file imports vitest's `expect` for the OUTER assertions and
 * testurio's `expect` (renamed to `texpect`) for the system under test.
 */

import { describe, expect, it } from "vitest";

import { ExpectAssertionError, expect as texpect } from "../../packages/core/src/components/base/expect";

function expectExpectFailure(fn: () => void): ExpectAssertionError {
	try {
		fn();
	} catch (err) {
		if (err instanceof ExpectAssertionError) return err;
		throw err;
	}
	throw new Error("Expected ExpectAssertionError but none was thrown");
}

// ============================================================================
// Equality
// ============================================================================

describe("toBe", () => {
	it("passes when values are referentially equal", () => {
		texpect(1).toBe(1);
		texpect("x").toBe("x");
		const obj = { a: 1 };
		texpect(obj).toBe(obj);
	});

	it("fails with Expected/Received when values differ", () => {
		const err = expectExpectFailure(() => texpect(200).toBe(404));
		expect(err.operator).toBe("toBe");
		expect(err.expected).toBe(404);
		expect(err.actual).toBe(200);
		expect(err.message).toContain("Expected: 404");
		expect(err.message).toContain("Received: 200");
	});

	it(".not.toBe passes when values differ", () => {
		texpect(1).not.toBe(2);
	});

	it(".not.toBe fails when values match", () => {
		const err = expectExpectFailure(() => texpect(1).not.toBe(1));
		expect(err.operator).toBe("not.toBe");
	});
});

describe("toEqual", () => {
	it("passes on deep equality", () => {
		texpect({ a: 1, b: { c: 2 } }).toEqual({ a: 1, b: { c: 2 } });
		texpect([1, 2, 3]).toEqual([1, 2, 3]);
	});

	it("fails with diff for object mismatches", () => {
		const err = expectExpectFailure(() => texpect({ a: 1, b: 2 }).toEqual({ a: 1, b: 3 }));
		expect(err.operator).toBe("toEqual");
		expect(err.diff).toBeDefined();
		expect(err.message).toContain("Diff:");
	});

	it(".not.toEqual passes when objects differ", () => {
		texpect({ a: 1 }).not.toEqual({ a: 2 });
	});
});

describe("toStrictEqual", () => {
	it("differs from toEqual on undefined properties", () => {
		texpect({ a: 1 }).toEqual({ a: 1, b: undefined });
		const err = expectExpectFailure(() =>
			texpect({ a: 1 }).toStrictEqual({ a: 1, b: undefined } as unknown as { a: number })
		);
		expect(err.operator).toBe("toStrictEqual");
	});
});

// ============================================================================
// Truthiness
// ============================================================================

describe("truthiness matchers", () => {
	it("toBeTruthy", () => {
		texpect(1).toBeTruthy();
		texpect("x").toBeTruthy();
		texpect({}).toBeTruthy();
		const err = expectExpectFailure(() => texpect(0).toBeTruthy());
		expect(err.operator).toBe("toBeTruthy");
	});

	it("toBeFalsy", () => {
		texpect(0).toBeFalsy();
		texpect("").toBeFalsy();
		texpect(null).toBeFalsy();
		const err = expectExpectFailure(() => texpect(1).toBeFalsy());
		expect(err.operator).toBe("toBeFalsy");
	});

	it("toBeNull", () => {
		texpect(null).toBeNull();
		const err = expectExpectFailure(() => texpect(undefined).toBeNull());
		expect(err.operator).toBe("toBeNull");
	});

	it("toBeUndefined", () => {
		texpect(undefined).toBeUndefined();
		const err = expectExpectFailure(() => texpect(null).toBeUndefined());
		expect(err.operator).toBe("toBeUndefined");
	});

	it("toBeDefined", () => {
		texpect(0).toBeDefined();
		texpect("").toBeDefined();
		const err = expectExpectFailure(() => texpect(undefined).toBeDefined());
		expect(err.operator).toBe("toBeDefined");
	});

	it(".not negation works for truthiness matchers", () => {
		texpect(0).not.toBeTruthy();
		texpect(1).not.toBeFalsy();
		texpect(undefined).not.toBeNull();
	});
});

// ============================================================================
// Numeric
// ============================================================================

describe("numeric matchers", () => {
	it("toBeGreaterThan", () => {
		texpect(5).toBeGreaterThan(3);
		const err = expectExpectFailure(() => texpect(2).toBeGreaterThan(5));
		expect(err.operator).toBe("toBeGreaterThan");
	});

	it("toBeGreaterThanOrEqual", () => {
		texpect(5).toBeGreaterThanOrEqual(5);
		texpect(5).toBeGreaterThanOrEqual(4);
		expectExpectFailure(() => texpect(3).toBeGreaterThanOrEqual(5));
	});

	it("toBeLessThan", () => {
		texpect(3).toBeLessThan(5);
		expectExpectFailure(() => texpect(5).toBeLessThan(3));
	});

	it("toBeLessThanOrEqual", () => {
		texpect(5).toBeLessThanOrEqual(5);
		expectExpectFailure(() => texpect(10).toBeLessThanOrEqual(5));
	});

	it("toBeCloseTo with default precision (2)", () => {
		texpect(0.1 + 0.2).toBeCloseTo(0.3);
		expectExpectFailure(() => texpect(0.1).toBeCloseTo(0.2));
	});

	it("throws TypeError when actual is not a number", () => {
		expect(() => texpect("foo" as unknown as number).toBeGreaterThan(1)).toThrow(TypeError);
	});

	it(".not.toBeGreaterThan", () => {
		texpect(2).not.toBeGreaterThan(5);
	});
});

// ============================================================================
// String
// ============================================================================

describe("string matchers", () => {
	it("toMatch with substring", () => {
		texpect("hello world").toMatch("world");
		const err = expectExpectFailure(() => texpect("hi").toMatch("xyz"));
		expect(err.operator).toBe("toMatch");
	});

	it("toMatch with RegExp", () => {
		texpect("abc123").toMatch(/\d+/);
		expectExpectFailure(() => texpect("abc").toMatch(/\d+/));
	});

	it("toContain on string", () => {
		texpect("foobar").toContain("bar");
		expectExpectFailure(() => texpect("foo").toContain("baz"));
	});

	it("toMatch throws TypeError on non-string actual", () => {
		expect(() => texpect(42 as unknown as string).toMatch("x")).toThrow(TypeError);
	});
});

// ============================================================================
// Collection
// ============================================================================

describe("collection matchers", () => {
	it("toContain on array", () => {
		texpect([1, 2, 3]).toContain(2);
		expectExpectFailure(() => texpect([1, 2, 3]).toContain(99));
	});

	it("toHaveLength", () => {
		texpect([1, 2, 3]).toHaveLength(3);
		texpect("abc").toHaveLength(3);
		expectExpectFailure(() => texpect([1]).toHaveLength(5));
	});

	it("toMatchObject allows extra keys in actual", () => {
		texpect({ id: 1, name: "Alice", role: "admin" }).toMatchObject({ id: 1 });
		const err = expectExpectFailure(() => texpect({ id: 1, name: "Alice" }).toMatchObject({ id: 2 }));
		expect(err.operator).toBe("toMatchObject");
		expect(err.diff).toBeDefined();
	});

	it("toMatchObject walks nested", () => {
		texpect({ a: { b: { c: 1 } }, x: 99 }).toMatchObject({ a: { b: { c: 1 } } });
	});

	it("toHaveProperty (path only)", () => {
		texpect({ user: { id: 42 } }).toHaveProperty("user.id");
		const err = expectExpectFailure(() => texpect({ user: { id: 42 } }).toHaveProperty("user.missing"));
		expect(err.operator).toBe("toHaveProperty");
	});

	it("toHaveProperty (path + value)", () => {
		texpect({ user: { id: 42 } }).toHaveProperty("user.id", 42);
		expectExpectFailure(() => texpect({ user: { id: 42 } }).toHaveProperty("user.id", 99));
	});

	it("toHaveProperty with string[] path", () => {
		texpect({ "weird.key": { x: 1 } }).toHaveProperty(["weird.key", "x"], 1);
	});

	it(".not.toContain on array", () => {
		texpect([1, 2]).not.toContain(99);
	});

	it(".not.toMatchObject", () => {
		texpect({ a: 1 }).not.toMatchObject({ a: 2 });
	});
});

// ============================================================================
// Failure message format
// ============================================================================

describe("failure messages", () => {
	it("contain Expected/Received block", () => {
		const err = expectExpectFailure(() => texpect(1).toBe(2));
		expect(err.message).toContain("Expected: 2");
		expect(err.message).toContain("Received: 1");
	});

	it("contain source link to test file", () => {
		const err = expectExpectFailure(() => texpect(1).toBe(2));
		expect(err.message).toContain("tests/unit/expect-matchers.test.ts");
	});

	it("contain Diff: block for toEqual failures", () => {
		const err = expectExpectFailure(() => texpect({ a: 1 }).toEqual({ a: 2 }));
		expect(err.message).toContain("Diff:");
	});
});

// ============================================================================
// Type-level (compile-time) tests
// ============================================================================

describe("type-level narrowing", () => {
	it("toMatch is unavailable on number actual", () => {
		try {
			// @ts-expect-error - toMatch only exists on StringExpectation
			texpect(5).toMatch("x");
		} catch {
			/* expected runtime TypeError; the value here is the compile-time error */
		}
		expect(true).toBe(true);
	});

	it("toBeGreaterThan is unavailable on string actual", () => {
		try {
			// @ts-expect-error - toBeGreaterThan only exists on NumericExpectation
			texpect("foo").toBeGreaterThan(1);
		} catch {
			/* expected runtime TypeError; we only assert the @ts-expect-error works */
		}
		expect(true).toBe(true);
	});

	it("toMatchObject compiles on object actual", () => {
		texpect({ a: 1 }).toMatchObject({ a: 1 });
	});

	it("toContain compiles on array actual", () => {
		texpect([1, 2]).toContain(1);
	});
});
