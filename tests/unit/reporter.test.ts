/**
 * Reporter Tests
 */

import type { TestCaseResult, TestResult, TestStepResult } from "testurio";
import { CompositeReporter, ConsoleReporter, JsonReporter, SilentReporter } from "testurio";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

// Mock test result
const createTestResult = (overrides?: Partial<TestResult>): TestResult => ({
	name: "Test Scenario",
	passed: true,
	duration: 100,
	startTime: Date.now() - 100,
	endTime: Date.now(),
	testCases: [],
	passedTests: 1,
	failedTests: 0,
	totalTests: 1,
	summary: {
		totalTestCases: 1,
		passedTestCases: 1,
		failedTestCases: 0,
		totalSteps: 2,
		passedSteps: 2,
		failedSteps: 0,
		totalDuration: 100,
		averageDuration: 100,
		totalInteractions: 0,
		passRate: 1,
	},
	...overrides,
});

const createTestCaseResult = (overrides?: Partial<TestCaseResult>): TestCaseResult => ({
	name: "Test Case",
	passed: true,
	duration: 50,
	startTime: Date.now() - 50,
	endTime: Date.now(),
	steps: [],
	passedSteps: 1,
	failedSteps: 0,
	totalSteps: 1,
	...overrides,
});

const createStepResult = (overrides?: Partial<TestStepResult>): TestStepResult => ({
	stepNumber: 1,
	type: "wait",
	passed: true,
	duration: 10,
	description: "Wait 10ms",
	...overrides,
});

describe("ConsoleReporter", () => {
	let reporter: ConsoleReporter;
	let consoleSpy: MockInstance;

	beforeEach(() => {
		reporter = new ConsoleReporter();
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("should have name 'console'", () => {
		expect(reporter.name).toBe("console");
	});

	it("should log on start", () => {
		reporter.onStart({ name: "Test", startTime: Date.now() });

		expect(consoleSpy).toHaveBeenCalled();
	});

	it("should log on test case complete", () => {
		reporter.onTestCaseComplete(createTestCaseResult());

		expect(consoleSpy).toHaveBeenCalled();
	});

	it("should log on complete", () => {
		reporter.onComplete(createTestResult());

		expect(consoleSpy).toHaveBeenCalled();
	});

	it("should log steps in verbose mode", () => {
		const verboseReporter = new ConsoleReporter({ verbose: true });
		const stepSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		verboseReporter.onTestCaseStart({ name: "Test" });
		verboseReporter.onStepComplete(createStepResult());

		expect(stepSpy).toHaveBeenCalled();
	});
});

describe("JsonReporter", () => {
	let reporter: JsonReporter;
	let consoleSpy: MockInstance;

	beforeEach(() => {
		reporter = new JsonReporter();
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("should have name 'json'", () => {
		expect(reporter.name).toBe("json");
	});

	it("should output JSON on complete", () => {
		const result = createTestResult();
		reporter.onComplete(result);

		expect(consoleSpy).toHaveBeenCalled();
		const output = reporter.getOutput();
		expect(() => JSON.parse(output)).not.toThrow();
	});

	it("should output compact JSON when prettyPrint is false", () => {
		const compactReporter = new JsonReporter({ prettyPrint: false });
		vi.spyOn(console, "log").mockImplementation(() => {});

		compactReporter.onComplete(createTestResult());

		const output = compactReporter.getOutput();
		expect(output).not.toContain("\n");
	});
});

describe("SilentReporter", () => {
	let reporter: SilentReporter;

	beforeEach(() => {
		reporter = new SilentReporter();
	});

	it("should have name 'silent'", () => {
		expect(reporter.name).toBe("silent");
	});

	it("should collect results", () => {
		const result = createTestResult();
		reporter.onComplete(result);

		expect(reporter.getResults()).toHaveLength(1);
		expect(reporter.getLastResult()).toEqual(result);
	});

	it("should return undefined when no results", () => {
		expect(reporter.getLastResult()).toBeUndefined();
	});
});

describe("CompositeReporter", () => {
	let reporter: CompositeReporter;
	let silent1: SilentReporter;
	let silent2: SilentReporter;

	beforeEach(() => {
		silent1 = new SilentReporter();
		silent2 = new SilentReporter();
		reporter = new CompositeReporter([silent1, silent2]);
	});

	it("should have name 'composite'", () => {
		expect(reporter.name).toBe("composite");
	});

	it("should call all reporters on complete", () => {
		const result = createTestResult();
		reporter.onComplete(result);

		expect(silent1.getResults()).toHaveLength(1);
		expect(silent2.getResults()).toHaveLength(1);
	});

	it("should call all reporters on start", () => {
		const onStartSpy1 = vi.fn();
		const onStartSpy2 = vi.fn();

		const mockReporter1 = {
			name: "mock1",
			onStart: onStartSpy1,
			onComplete: () => {},
		};
		const mockReporter2 = {
			name: "mock2",
			onStart: onStartSpy2,
			onComplete: () => {},
		};

		const composite = new CompositeReporter([mockReporter1, mockReporter2]);
		composite.onStart({ name: "Test", startTime: Date.now() });

		expect(onStartSpy1).toHaveBeenCalled();
		expect(onStartSpy2).toHaveBeenCalled();
	});

	it("should add reporter", () => {
		const silent3 = new SilentReporter();
		reporter.addReporter(silent3);

		const result = createTestResult();
		reporter.onComplete(result);

		expect(silent3.getResults()).toHaveLength(1);
	});

	it("should remove reporter by name", () => {
		reporter.removeReporter("silent");

		const result = createTestResult();
		reporter.onComplete(result);

		// Both were removed since they have the same name
		expect(silent1.getResults()).toHaveLength(0);
		expect(silent2.getResults()).toHaveLength(0);
	});
});
