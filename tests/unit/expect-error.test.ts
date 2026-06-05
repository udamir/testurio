/**
 * ExpectAssertionError + formatExpectFailure smoke tests
 */

import { describe, expect, it } from "vitest";

import { ExpectAssertionError } from "../../packages/core/src/components/base/expect/expect-assertion-error";

describe("ExpectAssertionError", () => {
	it("self-formats .message with Expected/Received", () => {
		const err = new ExpectAssertionError({
			operator: "toBe",
			expected: 200,
			actual: 404,
		});
		expect(err.message).toContain("Assertion failed");
		expect(err.message).toContain("Expected: 200");
		expect(err.message).toContain("Received: 404");
		expect(err.name).toBe("ExpectAssertionError");
		expect(err.operator).toBe("toBe");
		expect(err.expected).toBe(200);
		expect(err.actual).toBe(404);
	});

	it("includes the source link when sourceLocation is provided", () => {
		const err = new ExpectAssertionError({
			operator: "toBe",
			expected: 1,
			actual: 2,
			sourceLocation: { file: "/elsewhere/x.ts", line: 1, column: 1 },
		});
		expect(err.message).toContain("at /elsewhere/x.ts:1:1");
	});

	it("includes the description prefix when description is provided", () => {
		const err = new ExpectAssertionError({
			operator: "toBe",
			expected: 1,
			actual: 2,
			description: "status check",
		});
		expect(err.message).toContain("Assertion failed: status check");
	});

	it("renders the Diff: block when diff is provided", () => {
		const err = new ExpectAssertionError({
			operator: "toEqual",
			expected: { a: 1 },
			actual: { a: 2 },
			diff: "  - a: 1\n  + a: 2",
		});
		expect(err.message).toContain("Diff:");
		expect(err.message).toContain("- a: 1");
		expect(err.message).toContain("+ a: 2");
	});

	it("omits the Diff: section when diff is undefined", () => {
		const err = new ExpectAssertionError({ operator: "toBe", expected: 1, actual: 2 });
		expect(err.message).not.toContain("Diff:");
	});

	it("is an instance of Error", () => {
		const err = new ExpectAssertionError({ operator: "toBe", expected: 1, actual: 2 });
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ExpectAssertionError);
	});
});
