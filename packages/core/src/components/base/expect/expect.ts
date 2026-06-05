/**
 * expect() entry + Expectation<T> chain
 *
 * Single chain class with all matcher methods; conditional return types on
 * the `expect()` overloads narrow the visible matchers based on the actual
 * type. `.not` returns a NegatedExpectation that flips a `negated` flag the
 * underlying matchers respect.
 */

import { toContainArray, toHaveLength, toHaveProperty, toMatchObject } from "./matchers/collection";
import { toBe, toEqual, toStrictEqual } from "./matchers/equality";
import {
	toBeCloseTo,
	toBeGreaterThan,
	toBeGreaterThanOrEqual,
	toBeLessThan,
	toBeLessThanOrEqual,
} from "./matchers/numeric";
import { toContainString, toMatch } from "./matchers/string";
import { toBeDefined, toBeFalsy, toBeNull, toBeTruthy, toBeUndefined } from "./matchers/truthiness";

class ExpectationImpl<T> {
	private readonly actual: T;
	private readonly negated: boolean;

	constructor(actual: T, negated: boolean) {
		this.actual = actual;
		this.negated = negated;
	}

	get not(): NegatedExpectation<T> {
		return new ExpectationImpl<T>(this.actual, !this.negated) as unknown as NegatedExpectation<T>;
	}

	// Equality
	toBe(expected: T): void {
		toBe(this.actual, expected, this.negated);
	}

	toEqual(expected: T): void {
		toEqual(this.actual, expected, this.negated);
	}

	toStrictEqual(expected: T): void {
		toStrictEqual(this.actual, expected, this.negated);
	}

	// Truthiness
	toBeTruthy(): void {
		toBeTruthy(this.actual, this.negated);
	}

	toBeFalsy(): void {
		toBeFalsy(this.actual, this.negated);
	}

	toBeNull(): void {
		toBeNull(this.actual, this.negated);
	}

	toBeUndefined(): void {
		toBeUndefined(this.actual, this.negated);
	}

	toBeDefined(): void {
		toBeDefined(this.actual, this.negated);
	}

	// Numeric (runtime TypeError if actual not number)
	toBeGreaterThan(expected: number): void {
		toBeGreaterThan(this.actual, expected, this.negated);
	}

	toBeGreaterThanOrEqual(expected: number): void {
		toBeGreaterThanOrEqual(this.actual, expected, this.negated);
	}

	toBeLessThan(expected: number): void {
		toBeLessThan(this.actual, expected, this.negated);
	}

	toBeLessThanOrEqual(expected: number): void {
		toBeLessThanOrEqual(this.actual, expected, this.negated);
	}

	toBeCloseTo(expected: number, numDigits = 2): void {
		toBeCloseTo(this.actual, expected, numDigits, this.negated);
	}

	// String
	toMatch(expected: string | RegExp): void {
		toMatch(this.actual, expected, this.negated);
	}

	// Collection — toContain overloaded for string + array
	toContain(expected: unknown): void {
		if (typeof this.actual === "string") {
			toContainString(this.actual, expected as string, this.negated);
		} else if (Array.isArray(this.actual)) {
			toContainArray(this.actual, expected, this.negated);
		} else {
			throw new TypeError("expect(...).toContain() requires a string or array actual");
		}
	}

	toHaveLength(expected: number): void {
		toHaveLength(this.actual, expected, this.negated);
	}

	toMatchObject(expected: Partial<T & object>): void {
		toMatchObject(this.actual as object, expected as object, this.negated);
	}

	toHaveProperty(path: string | readonly string[], ...rest: [] | [unknown]): void {
		toHaveProperty(this.actual, path, rest.length === 1 ? rest[0] : undefined, rest.length === 1, this.negated);
	}
}

// Public type surface — narrowing via conditional types per actual T.

export interface Expectation<T> {
	readonly not: NegatedExpectation<T>;

	toBe(expected: T): void;
	toEqual(expected: T): void;
	toStrictEqual(expected: T): void;

	toBeTruthy(): void;
	toBeFalsy(): void;
	toBeNull(): void;
	toBeUndefined(): void;
	toBeDefined(): void;
}

export interface NumericExpectation extends Expectation<number> {
	toBeGreaterThan(expected: number): void;
	toBeGreaterThanOrEqual(expected: number): void;
	toBeLessThan(expected: number): void;
	toBeLessThanOrEqual(expected: number): void;
	toBeCloseTo(expected: number, numDigits?: number): void;
}

export interface StringExpectation extends Expectation<string> {
	toMatch(expected: string | RegExp): void;
	toContain(substring: string): void;
}

export interface ArrayExpectation<E> extends Expectation<readonly E[]> {
	toContain(element: E): void;
	toHaveLength(expected: number): void;
}

export interface ObjectExpectation<T extends object> extends Expectation<T> {
	toMatchObject(expected: Partial<T>): void;
	toHaveProperty(path: string | readonly string[], value?: unknown): void;
}

export type NegatedExpectation<T> = Omit<Expectation<T>, "not">;

export function expect(actual: number): NumericExpectation;
export function expect(actual: string): StringExpectation;
export function expect<E>(actual: readonly E[]): ArrayExpectation<E>;
export function expect<T extends object>(actual: T): ObjectExpectation<T>;
export function expect<T>(actual: T): Expectation<T>;
export function expect<T>(actual: T): Expectation<T> {
	return new ExpectationImpl<T>(actual, false) as unknown as Expectation<T>;
}
