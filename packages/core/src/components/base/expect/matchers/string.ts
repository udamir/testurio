/**
 * String matchers
 */

import { ExpectAssertionError } from "../expect-assertion-error";
import { captureSourceFrame } from "../source-frame";

function assertString(actual: unknown, op: string): string {
	if (typeof actual !== "string") {
		throw new TypeError(`expect(...).${op}() requires a string actual; got ${typeof actual}`);
	}
	return actual;
}

export function toMatch(actual: unknown, expected: string | RegExp, negated: boolean): void {
	const s = assertString(actual, "toMatch");
	const passed = typeof expected === "string" ? s.includes(expected) : expected.test(s);
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toMatch" : "toMatch",
		expected: typeof expected === "string" ? `to contain "${expected}"` : `to match ${expected.toString()}`,
		actual: s,
		sourceLocation: captureSourceFrame(toMatch),
	});
}

export function toContainString(actual: unknown, expected: string, negated: boolean): void {
	const s = assertString(actual, "toContain");
	const passed = s.includes(expected);
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toContain" : "toContain",
		expected: `to contain "${expected}"`,
		actual: s,
		sourceLocation: captureSourceFrame(toContainString),
	});
}
