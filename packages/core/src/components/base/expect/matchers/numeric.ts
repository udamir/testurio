/**
 * Numeric matchers
 */

import { ExpectAssertionError } from "../expect-assertion-error";
import { captureSourceFrame } from "../source-frame";

function assertNumber(actual: unknown, op: string): number {
	if (typeof actual !== "number") {
		throw new TypeError(`expect(...).${op}() requires a number actual; got ${typeof actual}`);
	}
	return actual;
}

export function toBeGreaterThan(actual: unknown, expected: number, negated: boolean): void {
	const n = assertNumber(actual, "toBeGreaterThan");
	const passed = n > expected;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeGreaterThan" : "toBeGreaterThan",
		expected: negated ? `not > ${expected}` : `> ${expected}`,
		actual: n,
		sourceLocation: captureSourceFrame(toBeGreaterThan),
	});
}

export function toBeGreaterThanOrEqual(actual: unknown, expected: number, negated: boolean): void {
	const n = assertNumber(actual, "toBeGreaterThanOrEqual");
	const passed = n >= expected;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeGreaterThanOrEqual" : "toBeGreaterThanOrEqual",
		expected: negated ? `not >= ${expected}` : `>= ${expected}`,
		actual: n,
		sourceLocation: captureSourceFrame(toBeGreaterThanOrEqual),
	});
}

export function toBeLessThan(actual: unknown, expected: number, negated: boolean): void {
	const n = assertNumber(actual, "toBeLessThan");
	const passed = n < expected;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeLessThan" : "toBeLessThan",
		expected: negated ? `not < ${expected}` : `< ${expected}`,
		actual: n,
		sourceLocation: captureSourceFrame(toBeLessThan),
	});
}

export function toBeLessThanOrEqual(actual: unknown, expected: number, negated: boolean): void {
	const n = assertNumber(actual, "toBeLessThanOrEqual");
	const passed = n <= expected;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeLessThanOrEqual" : "toBeLessThanOrEqual",
		expected: negated ? `not <= ${expected}` : `<= ${expected}`,
		actual: n,
		sourceLocation: captureSourceFrame(toBeLessThanOrEqual),
	});
}

export function toBeCloseTo(actual: unknown, expected: number, numDigits: number, negated: boolean): void {
	const n = assertNumber(actual, "toBeCloseTo");
	const tolerance = 10 ** -numDigits / 2;
	const passed = Math.abs(n - expected) < tolerance;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeCloseTo" : "toBeCloseTo",
		expected: negated ? `not ≈ ${expected} (precision ${numDigits})` : `≈ ${expected} (precision ${numDigits})`,
		actual: n,
		sourceLocation: captureSourceFrame(toBeCloseTo),
	});
}
