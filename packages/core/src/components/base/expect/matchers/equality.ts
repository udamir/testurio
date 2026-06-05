/**
 * Equality matchers: toBe, toEqual, toStrictEqual
 */

import { isDeepEqual } from "../deep-equal";
import { renderDiff } from "../diff";
import { ExpectAssertionError } from "../expect-assertion-error";
import { captureSourceFrame } from "../source-frame";

export function toBe<T>(actual: T, expected: T, negated: boolean): void {
	const passed = Object.is(actual, expected);
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBe" : "toBe",
		expected,
		actual,
		sourceLocation: captureSourceFrame(toBe),
	});
}

export function toEqual<T>(actual: T, expected: T, negated: boolean): void {
	const passed = isDeepEqual(actual, expected, { strict: false });
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toEqual" : "toEqual",
		expected,
		actual,
		diff: negated ? undefined : renderDiff(expected, actual),
		sourceLocation: captureSourceFrame(toEqual),
	});
}

export function toStrictEqual<T>(actual: T, expected: T, negated: boolean): void {
	const passed = isDeepEqual(actual, expected, { strict: true });
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toStrictEqual" : "toStrictEqual",
		expected,
		actual,
		diff: negated ? undefined : renderDiff(expected, actual),
		sourceLocation: captureSourceFrame(toStrictEqual),
	});
}
