/**
 * Assertion Collector Tests
 */

import { AssertionCollector } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

describe("AssertionCollector", () => {
	let collector: AssertionCollector;

	beforeEach(() => {
		collector = new AssertionCollector();
	});

	describe("pass", () => {
		it("should record a passed assertion", () => {
			collector.pass("Value is correct", 42, 42);

			const assertions = collector.getAssertions();
			expect(assertions).toHaveLength(1);
			expect(assertions[0].passed).toBe(true);
			expect(assertions[0].description).toBe("Value is correct");
			expect(assertions[0].expected).toBe(42);
			expect(assertions[0].actual).toBe(42);
		});
	});

	describe("fail", () => {
		it("should record a failed assertion", () => {
			collector.fail("Value mismatch", "Expected 42 but got 43", 42, 43);

			const assertions = collector.getAssertions();
			expect(assertions).toHaveLength(1);
			expect(assertions[0].passed).toBe(false);
			expect(assertions[0].error).toBe("Expected 42 but got 43");
		});
	});

	describe("assertTrue", () => {
		it("should pass when condition is true", () => {
			const result = collector.assertTrue(true, "Condition is true");

			expect(result).toBe(true);
			expect(collector.allPassed()).toBe(true);
		});

		it("should fail when condition is false", () => {
			const result = collector.assertTrue(false, "Condition should be true");

			expect(result).toBe(false);
			expect(collector.hasFailed()).toBe(true);
		});
	});

	describe("assertEqual", () => {
		it("should pass when values are equal", () => {
			const result = collector.assertEqual(42, 42, "Numbers match");

			expect(result).toBe(true);
			expect(collector.allPassed()).toBe(true);
		});

		it("should fail when values are not equal", () => {
			const result = collector.assertEqual(42, 43, "Numbers should match");

			expect(result).toBe(false);
			expect(collector.hasFailed()).toBe(true);
		});
	});

	describe("assertDeepEqual", () => {
		it("should pass when objects are deeply equal", () => {
			const result = collector.assertDeepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }, "Objects match");

			expect(result).toBe(true);
		});

		it("should fail when objects are not deeply equal", () => {
			const result = collector.assertDeepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } }, "Objects should match");

			expect(result).toBe(false);
		});
	});

	describe("assertDefined", () => {
		it("should pass when value is defined", () => {
			const result = collector.assertDefined("hello", "Value is defined");

			expect(result).toBe(true);
		});

		it("should fail when value is null", () => {
			const result = collector.assertDefined(null, "Value should be defined");

			expect(result).toBe(false);
		});

		it("should fail when value is undefined", () => {
			const result = collector.assertDefined(undefined, "Value should be defined");

			expect(result).toBe(false);
		});
	});

	describe("assertMatches", () => {
		it("should pass when predicate returns true", () => {
			const result = collector.assertMatches(42, (v) => v > 0, "Value is positive");

			expect(result).toBe(true);
		});

		it("should fail when predicate returns false", () => {
			const result = collector.assertMatches(-1, (v) => v > 0, "Value should be positive");

			expect(result).toBe(false);
		});
	});

	describe("getPassedAssertions", () => {
		it("should return only passed assertions", () => {
			collector.pass("Pass 1");
			collector.fail("Fail 1", "Error");
			collector.pass("Pass 2");

			const passed = collector.getPassedAssertions();
			expect(passed).toHaveLength(2);
		});
	});

	describe("getFailedAssertions", () => {
		it("should return only failed assertions", () => {
			collector.pass("Pass 1");
			collector.fail("Fail 1", "Error");
			collector.fail("Fail 2", "Error");

			const failed = collector.getFailedAssertions();
			expect(failed).toHaveLength(2);
		});
	});

	describe("allPassed", () => {
		it("should return true when all assertions passed", () => {
			collector.pass("Pass 1");
			collector.pass("Pass 2");

			expect(collector.allPassed()).toBe(true);
		});

		it("should return false when any assertion failed", () => {
			collector.pass("Pass 1");
			collector.fail("Fail 1", "Error");

			expect(collector.allPassed()).toBe(false);
		});
	});

	describe("getSummary", () => {
		it("should return summary statistics", () => {
			collector.pass("Pass 1");
			collector.pass("Pass 2");
			collector.fail("Fail 1", "Error");

			const summary = collector.getSummary();

			expect(summary.total).toBe(3);
			expect(summary.passed).toBe(2);
			expect(summary.failed).toBe(1);
			expect(summary.passRate).toBeCloseTo(0.667, 2);
		});

		it("should return 100% pass rate when empty", () => {
			const summary = collector.getSummary();

			expect(summary.passRate).toBe(1);
		});
	});

	describe("clear", () => {
		it("should clear all assertions", () => {
			collector.pass("Pass 1");
			collector.fail("Fail 1", "Error");

			collector.clear();

			expect(collector.count).toBe(0);
			expect(collector.getAssertions()).toHaveLength(0);
		});
	});
});
