/**
 * Test Case Builder Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { TestCaseBuilder } from "testurio";
import type { BaseComponent } from "testurio";

describe("TestCaseBuilder", () => {
	let components: Map<string, BaseComponent>;
	let builder: TestCaseBuilder;

	beforeEach(() => {
		components = new Map<string, BaseComponent>();
		builder = new TestCaseBuilder(components, {});
	});

	describe("context", () => {
		it("should provide mutable context", () => {
			type TestContext = {
				value: number;
				[key: string]: unknown;
			};

			const contextBuilder = new TestCaseBuilder<TestContext>(
				components,
				{ value: 0 } as TestContext,
			);

			expect(contextBuilder.context.value).toBe(0);

			contextBuilder.context.value = 42;

			expect(contextBuilder.context.value).toBe(42);
		});
	});

	describe("wait", () => {
		it("should register a wait step", () => {
			builder.wait(100);

			const steps = builder.getSteps();
			expect(steps).toHaveLength(1);
			expect(steps[0].type).toBe("wait");
			expect(steps[0].description).toBe("Wait 100ms");
		});
	});

	describe("waitUntil", () => {
		it("should register a waitUntil step", () => {
			builder.waitUntil(() => true);

			const steps = builder.getSteps();
			expect(steps).toHaveLength(1);
			expect(steps[0].type).toBe("waitUntil");
		});
	});

	describe("step registration", () => {
		it("should track phase for registered steps", () => {
			builder.setPhase("init");
			builder.wait(100);

			builder.setPhase("test");
			builder.wait(200);

			builder.setPhase("after");
			builder.wait(300);

			const steps = builder.getSteps();

			expect(steps).toHaveLength(3);
			expect(steps[0].phase).toBe("init");
			expect(steps[1].phase).toBe("test");
			expect(steps[2].phase).toBe("after");
		});
	});
});
