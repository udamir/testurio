/**
 * Collection matchers
 */

import { isDeepEqual } from "../deep-equal";
import { renderDiff } from "../diff";
import { ExpectAssertionError } from "../expect-assertion-error";
import { captureSourceFrame } from "../source-frame";

export function toContainArray<E>(actual: readonly E[], expected: E, negated: boolean): void {
	if (!Array.isArray(actual)) {
		throw new TypeError(`expect(...).toContain() requires an array actual; got ${typeof actual}`);
	}
	const passed = actual.some((x) => Object.is(x, expected));
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toContain" : "toContain",
		expected: `to contain item`,
		actual,
		sourceLocation: captureSourceFrame(toContainArray),
	});
}

interface HasLength {
	readonly length: number;
}

function hasLength(v: unknown): v is HasLength {
	return v !== null && typeof v === "object" && typeof (v as { length?: unknown }).length === "number";
}

export function toHaveLength(actual: unknown, expected: number, negated: boolean): void {
	if (typeof actual !== "string" && !hasLength(actual)) {
		throw new TypeError(`expect(...).toHaveLength() requires actual with a numeric .length`);
	}
	const len = (actual as { length: number }).length;
	const passed = len === expected;
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toHaveLength" : "toHaveLength",
		expected: negated ? `length ≠ ${expected}` : `length ${expected}`,
		actual: `length ${len}`,
		sourceLocation: captureSourceFrame(toHaveLength),
	});
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function matchObjectShape(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
	for (const key of Object.keys(expected)) {
		const ev = expected[key];
		const av = actual[key];
		if (isPlainObject(ev) && isPlainObject(av)) {
			if (!matchObjectShape(av, ev)) return false;
		} else if (!isDeepEqual(av, ev, { strict: false })) {
			return false;
		}
	}
	return true;
}

export function toMatchObject<T extends object>(actual: T, expected: Partial<T>, negated: boolean): void {
	if (!isPlainObject(actual) || !isPlainObject(expected)) {
		throw new TypeError(`expect(...).toMatchObject() requires plain object on both sides`);
	}
	const passed = matchObjectShape(actual, expected);
	if (passed !== negated) return;
	throw new ExpectAssertionError({
		operator: negated ? "not.toMatchObject" : "toMatchObject",
		expected,
		actual,
		diff: negated ? undefined : renderDiff(expected, actual),
		sourceLocation: captureSourceFrame(toMatchObject),
	});
}

function walkPath(obj: unknown, path: readonly string[]): { found: boolean; value: unknown } {
	let cur: unknown = obj;
	for (const segment of path) {
		if (cur === null || typeof cur !== "object") return { found: false, value: undefined };
		const rec = cur as Record<string, unknown>;
		if (!(segment in rec)) return { found: false, value: undefined };
		cur = rec[segment];
	}
	return { found: true, value: cur };
}

export function toHaveProperty(
	actual: unknown,
	path: string | readonly string[],
	value: unknown,
	hasValueArg: boolean,
	negated: boolean
): void {
	const segments = typeof path === "string" ? path.split(".") : path;
	const { found, value: foundVal } = walkPath(actual, segments);
	let passed: boolean;
	if (!found) {
		passed = false;
	} else if (hasValueArg) {
		passed = isDeepEqual(foundVal, value, { strict: false });
	} else {
		passed = true;
	}
	if (passed !== negated) return;
	const pathStr = segments.join(".");
	throw new ExpectAssertionError({
		operator: negated ? "not.toHaveProperty" : "toHaveProperty",
		expected: hasValueArg ? `property "${pathStr}" = ${JSON.stringify(value)}` : `property "${pathStr}" to exist`,
		actual: found ? foundVal : `property "${pathStr}" missing`,
		sourceLocation: captureSourceFrame(toHaveProperty),
	});
}
