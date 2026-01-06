/**
 * TestCase Tests
 */

import type { BaseComponent } from "testurio";
import { TestCase, TestCaseBuilder, testCase } from "testurio";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("TestCase", () => {
	let components: Map<string, BaseComponent>;
	let builder: TestCaseBuilder;

	beforeEach(() => {
		components = new Map<string, BaseComponent>();
		builder = new TestCaseBuilder(components, {});
	});

	describe("constructor", () => {
		it("should create a test case with name", () => {
			const tc = new TestCase("My Test", () => {});

			expect(tc.name).toBe("My Test");
		});
	});

	describe("before/after", () => {
		it("should chain before and after handlers", () => {
			const tc = new TestCase("Test", () => {}).before(() => {}).after(() => {});

			expect(tc).toBeInstanceOf(TestCase);
		});
	});

	describe("buildSteps", () => {
		it("should build steps from test builder", () => {
			const tc = new TestCase("Test", (test) => {
				test.wait(100);
				test.wait(200);
			});

			const steps = tc.buildSteps(builder);

			expect(steps).toHaveLength(2);
			expect(steps[0].type).toBe("wait");
			expect(steps[1].type).toBe("wait");
		});

		it("should build before steps first", () => {
			const tc = new TestCase("Test", (test) => {
				test.wait(100);
			}).before((test) => {
				test.wait(50);
			});

			const steps = tc.buildSteps(builder);

			expect(steps).toHaveLength(2);
			expect(steps[0].description).toBe("Wait 50ms");
			expect(steps[1].description).toBe("Wait 100ms");
		});

		it("should build after steps last", () => {
			const tc = new TestCase("Test", (test) => {
				test.wait(100);
			}).after((test) => {
				test.wait(200);
			});

			const steps = tc.buildSteps(builder);

			expect(steps).toHaveLength(2);
			expect(steps[0].description).toBe("Wait 100ms");
			expect(steps[1].description).toBe("Wait 200ms");
		});
	});

	describe("execute", () => {
		it("should execute all steps", async () => {
			const tc = new TestCase("Test", (test) => {
				test.wait(10);
				test.wait(10);
			});

			const result = await tc.execute(builder);

			expect(result.passed).toBe(true);
			expect(result.totalSteps).toBe(2);
			expect(result.passedSteps).toBe(2);
		});

		it("should report failure on step error", async () => {
			const tc = new TestCase("Test", (test) => {
				// Use waitUntil with a condition that throws
				test.waitUntil(
					() => {
						throw new Error("Test error");
					},
					{ timeout: 100 }
				);
			});

			const result = await tc.execute(builder);

			expect(result.passed).toBe(false);
			expect(result.failedSteps).toBe(1);
			expect(result.error).toBe("Test error");
		});

		it("should call onStepComplete callback", async () => {
			const callback = vi.fn();

			const tc = new TestCase("Test", (test) => {
				test.wait(10);
				test.wait(10);
			});

			await tc.execute(builder, { onStepComplete: callback });

			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("should record duration", async () => {
			const tc = new TestCase("Test", (test) => {
				test.wait(50);
			});

			const result = await tc.execute(builder);

			expect(result.duration).toBeGreaterThanOrEqual(40);
			expect(result.startTime).toBeLessThan(result.endTime);
		});
	});

	describe("testCase factory", () => {
		it("should create a TestCase instance", () => {
			const tc = testCase("Factory Test", () => {});

			expect(tc).toBeInstanceOf(TestCase);
			expect(tc.name).toBe("Factory Test");
		});
	});
});
