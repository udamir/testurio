/**
 * Allure step-details rendering
 *
 * Covers task 044's three reporter-side surfaces:
 *  1. `convertStep` propagates `start`/`stop` from `step.startTime`/`endTime`.
 *  2. JSON attachments — one `application/json` attachment per stamped payload
 *     key under any non-undefined `includePayloads` value; no payload
 *     `Parameter` row.
 *  3. Nested sub-steps — one nested `AllureStepResult` per `step.assertions`
 *     entry with status mapped from `passed` and `statusDetails.message` from
 *     `error` on fail.
 *
 * Plus the constructor's deprecation warnings for `includePayloads:
 * "parameters"` and `maxPayloadSize`.
 */

import { AllureReporter, convertStep, type FileSystemWriter } from "@testurio/reporter-allure";
import type { TestStepResult } from "testurio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const makeStep = (overrides: Partial<TestStepResult> = {}): TestStepResult => ({
	stepNumber: 1,
	type: "request",
	description: "send request",
	componentName: "api",
	messageType: "getUsers",
	passed: true,
	duration: 50,
	startTime: 1_700_000_000_000,
	endTime: 1_700_000_000_050,
	...overrides,
});

const noopWriter = (): FileSystemWriter => {
	let counter = 0;
	return {
		writeAttachment: (name: string) => `${++counter}-${name}`,
		writeTestResult: () => {},
		writeContainer: () => {},
		writeEnvironment: () => {},
	} as unknown as FileSystemWriter;
};

describe("convertStep — start/stop propagation", () => {
	it("sets start and stop from step.startTime / step.endTime", () => {
		const step = makeStep({ startTime: 100, endTime: 175 });
		const result = convertStep(step, 0, {}, noopWriter());
		expect(result.start).toBe(100);
		expect(result.stop).toBe(175);
	});
});

describe("convertStep — JSON attachments (unified)", () => {
	const fixture = makeStep({
		metadata: { request: { method: "GET" }, response: { code: 200 } },
	});

	for (const mode of ["attachments", "both", "parameters"] as const) {
		it(`emits one JSON attachment per stamped key under '${mode}'`, () => {
			const result = convertStep(fixture, 2, { includePayloads: mode }, noopWriter());
			const names = result.attachments.map((a) => a.name).sort();
			expect(names).toEqual(["request", "response"]);
			expect(result.attachments.every((a) => a.type === "application/json")).toBe(true);

			const paramNames = result.parameters.map((p) => p.name);
			expect(paramNames).not.toContain("request");
			expect(paramNames).not.toContain("response");
		});
	}

	it("preserves the `component` parameter row when payloads are attached", () => {
		const result = convertStep(fixture, 0, { includePayloads: "attachments" }, noopWriter());
		expect(result.parameters.map((p) => p.name)).toEqual(["component"]);
	});

	it("emits no payload attachments when includePayloads is undefined", () => {
		const result = convertStep(fixture, 0, {}, noopWriter());
		expect(result.attachments).toHaveLength(0);
	});
});

describe("convertStep — nested sub-steps for assertions", () => {
	it("emits one PASSED sub-step per passed assertion", () => {
		const step = makeStep({
			assertions: [
				{ passed: true, description: "code === 200" },
				{ passed: true, description: "body has 3 items" },
			],
		});
		const result = convertStep(step, 0, {}, noopWriter());
		expect(result.steps).toHaveLength(2);
		expect(result.steps[0].name).toBe("code === 200");
		expect(result.steps[0].status).toBe("passed");
		expect(result.steps[1].name).toBe("body has 3 items");
		expect(result.steps[1].status).toBe("passed");
	});

	it("emits a FAILED sub-step with statusDetails.message on fail", () => {
		const step = makeStep({
			assertions: [
				{ passed: true, description: "code === 200" },
				{ passed: false, description: "body length > 0", error: "Assertion failed: body length > 0" },
			],
		});
		const result = convertStep(step, 0, {}, noopWriter());
		expect(result.steps).toHaveLength(2);
		expect(result.steps[1].status).toBe("failed");
		expect(result.steps[1].statusDetails?.message).toBe("Assertion failed: body length > 0");
	});

	it("falls back to 'Assertion N' when description is missing", () => {
		const step = makeStep({ assertions: [{ passed: true }] });
		const result = convertStep(step, 0, {}, noopWriter());
		expect(result.steps[0].name).toBe("Assertion 1");
	});

	it("emits an empty steps array when no assertions are recorded", () => {
		const result = convertStep(makeStep(), 0, {}, noopWriter());
		expect(result.steps).toEqual([]);
	});
});

describe("AllureReporter — constructor deprecation warnings", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it('warns once when includePayloads === "parameters"', () => {
		new AllureReporter({ includePayloads: "parameters" });
		const matching = warnSpy.mock.calls.filter(([msg]) => String(msg).includes('"parameters" is deprecated'));
		expect(matching).toHaveLength(1);
	});

	it("warns once when maxPayloadSize is set", () => {
		new AllureReporter({ maxPayloadSize: 100 });
		const matching = warnSpy.mock.calls.filter(([msg]) => String(msg).includes("maxPayloadSize is deprecated"));
		expect(matching).toHaveLength(1);
	});

	it("does not warn for the canonical 'attachments' mode", () => {
		new AllureReporter({ includePayloads: "attachments" });
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("does not warn when no options are passed", () => {
		new AllureReporter();
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
