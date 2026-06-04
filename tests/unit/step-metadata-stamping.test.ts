/**
 * Step metadata stamping — covers Phases 1 + 2 of FR-9 (v2).
 *
 * - `stampMetadata` shallow-merges patches, later writes win, lazy-init.
 * - `StepInfo.metadata` and `TestStepResult.metadata` carry stamped data
 *   through the result projections.
 */

import type { Component, Step, StepExecutionResult } from "testurio";
// Re-import internal toTestStepResult — exported from testurio's index since
// step-executor.ts re-exports it via the execution module.
import { stampMetadata, toTestStepResult } from "testurio";
import { describe, expect, it } from "vitest";

const makeStep = (overrides: Partial<Step> = {}): Step =>
	({
		id: "step-1",
		type: "request",
		component: { name: "api" } as unknown as Component,
		description: "send request",
		params: { messageType: "getUsers" },
		handlers: [],
		mode: "action",
		...overrides,
	}) as Step;

describe("stampMetadata", () => {
	it("initializes metadata when undefined", () => {
		const step = makeStep();
		expect(step.metadata).toBeUndefined();

		stampMetadata(step, { request: { x: 1 } });

		expect(step.metadata).toEqual({ request: { x: 1 } });
	});

	it("shallow-merges over existing metadata", () => {
		const step = makeStep({ metadata: { request: { x: 1 } } });

		stampMetadata(step, { response: { y: 2 } });

		expect(step.metadata).toEqual({ request: { x: 1 }, response: { y: 2 } });
	});

	it("later writes win on key collision", () => {
		const step = makeStep({ metadata: { request: { from: "first" } } });

		stampMetadata(step, { request: { from: "second" } });

		expect(step.metadata).toEqual({ request: { from: "second" } });
	});

	it("accepts arbitrary record values (strings, arrays, etc.)", () => {
		const step = makeStep();

		stampMetadata(step, { request: "raw SQL string" });
		stampMetadata(step, { response: [1, 2, 3] });

		expect(step.metadata).toEqual({
			request: "raw SQL string",
			response: [1, 2, 3],
		});
	});
});

describe("toTestStepResult — metadata propagation", () => {
	it("carries StepInfo.metadata through to TestStepResult.metadata", () => {
		const result: StepExecutionResult = {
			step: {
				type: "request",
				componentName: "api",
				description: "getUsers",
				messageType: "getUsers",
				metadata: { request: { method: "GET" }, response: { code: 200 } },
			},
			passed: true,
			duration: 12,
			startTime: 1,
			endTime: 13,
		};

		const out = toTestStepResult(result, 0);

		expect(out.metadata).toEqual({
			request: { method: "GET" },
			response: { code: 200 },
		});
		expect(out.messageType).toBe("getUsers");
	});

	it("leaves metadata undefined when StepInfo.metadata was undefined", () => {
		const result: StepExecutionResult = {
			step: {
				type: "assert",
				componentName: "api",
				description: "ok",
			},
			passed: true,
			duration: 1,
			startTime: 1,
			endTime: 2,
		};

		const out = toTestStepResult(result, 0);

		expect(out.metadata).toBeUndefined();
	});
});
