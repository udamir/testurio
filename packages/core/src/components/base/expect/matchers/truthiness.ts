/**
 * Truthiness matchers
 */

import { ExpectAssertionError } from "../expect-assertion-error";
import { captureSourceFrame } from "../source-frame";

export function toBeTruthy(actual: unknown, negated: boolean): void {
	const passed = Boolean(actual);
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeTruthy" : "toBeTruthy",
		expected: negated ? "falsy value" : "truthy value",
		actual,
		sourceLocation: captureSourceFrame(toBeTruthy),
	});
}

export function toBeFalsy(actual: unknown, negated: boolean): void {
	const passed = !actual;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeFalsy" : "toBeFalsy",
		expected: negated ? "truthy value" : "falsy value",
		actual,
		sourceLocation: captureSourceFrame(toBeFalsy),
	});
}

export function toBeNull(actual: unknown, negated: boolean): void {
	const passed = actual === null;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeNull" : "toBeNull",
		expected: negated ? "not null" : null,
		actual,
		sourceLocation: captureSourceFrame(toBeNull),
	});
}

export function toBeUndefined(actual: unknown, negated: boolean): void {
	const passed = actual === undefined;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeUndefined" : "toBeUndefined",
		expected: negated ? "defined value" : undefined,
		actual,
		sourceLocation: captureSourceFrame(toBeUndefined),
	});
}

export function toBeDefined(actual: unknown, negated: boolean): void {
	const passed = actual !== undefined;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toBeDefined" : "toBeDefined",
		expected: negated ? undefined : "defined value",
		actual,
		sourceLocation: captureSourceFrame(toBeDefined),
	});
}
