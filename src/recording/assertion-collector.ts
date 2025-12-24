/**
 * Assertion Collector
 *
 * Collects and tracks assertions during test execution.
 */

import type { AssertionResult } from "../types";

/**
 * Assertion Collector
 *
 * Collects assertions during test execution for reporting.
 */
export class AssertionCollector {
	private assertions: AssertionResult[] = [];

	/**
	 * Record a successful assertion
	 */
	pass(description: string, expected?: unknown, actual?: unknown): void {
		this.assertions.push({
			passed: true,
			description,
			expected,
			actual,
		});
	}

	/**
	 * Record a failed assertion
	 */
	fail(
		description: string,
		error: string,
		expected?: unknown,
		actual?: unknown,
	): void {
		this.assertions.push({
			passed: false,
			description,
			expected,
			actual,
			error,
		});
	}

	/**
	 * Record an assertion result
	 */
	record(result: AssertionResult): void {
		this.assertions.push(result);
	}

	/**
	 * Assert that a condition is true
	 */
	assertTrue(condition: boolean, description: string, error?: string): boolean {
		if (condition) {
			this.pass(description, true, true);
		} else {
			this.fail(
				description,
				error || "Expected true but got false",
				true,
				false,
			);
		}
		return condition;
	}

	/**
	 * Assert that two values are equal
	 */
	assertEqual<T>(actual: T, expected: T, description: string): boolean {
		const passed = actual === expected;
		if (passed) {
			this.pass(description, expected, actual);
		} else {
			this.fail(
				description,
				`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
				expected,
				actual,
			);
		}
		return passed;
	}

	/**
	 * Assert that two values are deeply equal
	 */
	assertDeepEqual<T>(actual: T, expected: T, description: string): boolean {
		const passed = JSON.stringify(actual) === JSON.stringify(expected);
		if (passed) {
			this.pass(description, expected, actual);
		} else {
			this.fail(
				description,
				`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
				expected,
				actual,
			);
		}
		return passed;
	}

	/**
	 * Assert that a value is defined (not null or undefined)
	 */
	assertDefined<T>(value: T | null | undefined, description: string): boolean {
		const passed = value !== null && value !== undefined;
		if (passed) {
			this.pass(description, "defined", value);
		} else {
			this.fail(description, "Expected value to be defined", "defined", value);
		}
		return passed;
	}

	/**
	 * Assert that a value matches a predicate
	 */
	assertMatches<T>(
		value: T,
		predicate: (value: T) => boolean,
		description: string,
	): boolean {
		const passed = predicate(value);
		if (passed) {
			this.pass(description, "match", value);
		} else {
			this.fail(description, "Value did not match predicate", "match", value);
		}
		return passed;
	}

	/**
	 * Get all assertions
	 */
	getAssertions(): AssertionResult[] {
		return [...this.assertions];
	}

	/**
	 * Get passed assertions
	 */
	getPassedAssertions(): AssertionResult[] {
		return this.assertions.filter((a) => a.passed);
	}

	/**
	 * Get failed assertions
	 */
	getFailedAssertions(): AssertionResult[] {
		return this.assertions.filter((a) => !a.passed);
	}

	/**
	 * Check if all assertions passed
	 */
	allPassed(): boolean {
		return this.assertions.every((a) => a.passed);
	}

	/**
	 * Check if any assertion failed
	 */
	hasFailed(): boolean {
		return this.assertions.some((a) => !a.passed);
	}

	/**
	 * Get summary
	 */
	getSummary(): {
		total: number;
		passed: number;
		failed: number;
		passRate: number;
	} {
		const passed = this.getPassedAssertions().length;
		const failed = this.getFailedAssertions().length;
		const total = this.assertions.length;

		return {
			total,
			passed,
			failed,
			passRate: total > 0 ? passed / total : 1,
		};
	}

	/**
	 * Clear all assertions
	 */
	clear(): void {
		this.assertions = [];
	}

	/**
	 * Get assertion count
	 */
	get count(): number {
		return this.assertions.length;
	}
}
