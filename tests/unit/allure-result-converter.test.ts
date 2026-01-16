/**
 * Result Converter Unit Tests
 */

import type { AllureReporterOptions, AllureWriter } from "@testurio/reporter-allure";
import {
	ContentType,
	convertMetadataToLabels,
	convertMetadataToLinks,
	convertStatus,
	convertStatusDetails,
	convertStep,
	convertTestCase,
	convertToContainer,
	LabelName,
	LinkType,
	Stage,
	Status,
} from "@testurio/reporter-allure";
import type { TestCaseMetadata, TestCaseResult, TestResult, TestStepResult } from "testurio";
import { describe, expect, it, vi } from "vitest";

describe("ResultConverter", () => {
	describe("convertStatus", () => {
		it("should return PASSED for passed=true", () => {
			expect(convertStatus(true)).toBe(Status.PASSED);
		});

		it("should return FAILED for assertion failure", () => {
			expect(convertStatus(false, "AssertionError: expected true to be false")).toBe(Status.FAILED);
		});

		it("should return FAILED for expect error", () => {
			expect(convertStatus(false, "expect(received).toBe(expected)")).toBe(Status.FAILED);
		});

		it("should return BROKEN for unexpected error", () => {
			expect(convertStatus(false, "TypeError: Cannot read property 'foo'")).toBe(Status.BROKEN);
		});

		it("should return BROKEN for error without message", () => {
			expect(convertStatus(false)).toBe(Status.BROKEN);
		});
	});

	describe("convertStatusDetails", () => {
		it("should return undefined when no error or stackTrace", () => {
			expect(convertStatusDetails(undefined, undefined)).toBeUndefined();
		});

		it("should return message only when no stackTrace", () => {
			const result = convertStatusDetails("Error message", undefined);
			expect(result).toEqual({ message: "Error message", trace: undefined });
		});

		it("should return both message and trace", () => {
			const result = convertStatusDetails("Error message", "at foo.ts:10:5");
			expect(result).toEqual({
				message: "Error message",
				trace: "at foo.ts:10:5",
			});
		});
	});

	describe("convertMetadataToLabels", () => {
		const defaultOptions: AllureReporterOptions = {};

		it("should always include framework=testurio label", () => {
			const labels = convertMetadataToLabels(undefined, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.FRAMEWORK, value: "testurio" });
		});

		it("should always include language=typescript label", () => {
			const labels = convertMetadataToLabels(undefined, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.LANGUAGE, value: "typescript" });
		});

		it("should map id to ALLURE_ID label", () => {
			const metadata: TestCaseMetadata = { id: "TC-001" };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.ALLURE_ID, value: "TC-001" });
		});

		it("should map epic to EPIC label", () => {
			const metadata: TestCaseMetadata = { epic: "User Management" };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.EPIC, value: "User Management" });
		});

		it("should map feature to FEATURE label", () => {
			const metadata: TestCaseMetadata = { feature: "User API" };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.FEATURE, value: "User API" });
		});

		it("should map story to STORY label", () => {
			const metadata: TestCaseMetadata = { story: "Get User" };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.STORY, value: "Get User" });
		});

		it("should map severity to SEVERITY label", () => {
			const metadata: TestCaseMetadata = { severity: "critical" };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.SEVERITY, value: "critical" });
		});

		it("should map each tag to TAG label", () => {
			const metadata: TestCaseMetadata = { tags: ["api", "smoke", "regression"] };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: LabelName.TAG, value: "api" });
			expect(labels).toContainEqual({ name: LabelName.TAG, value: "smoke" });
			expect(labels).toContainEqual({ name: LabelName.TAG, value: "regression" });
		});

		it("should map custom labels with custom names", () => {
			const metadata: TestCaseMetadata = { labels: { owner: "team-api", layer: "integration" } };
			const labels = convertMetadataToLabels(metadata, defaultOptions);
			expect(labels).toContainEqual({ name: "owner", value: "team-api" });
			expect(labels).toContainEqual({ name: "layer", value: "integration" });
		});

		it("should include defaultEpic when no epic in metadata", () => {
			const options: AllureReporterOptions = { defaultEpic: "Default Epic" };
			const labels = convertMetadataToLabels({}, options);
			expect(labels).toContainEqual({ name: LabelName.EPIC, value: "Default Epic" });
		});

		it("should prefer metadata epic over defaultEpic", () => {
			const options: AllureReporterOptions = { defaultEpic: "Default Epic" };
			const metadata: TestCaseMetadata = { epic: "Custom Epic" };
			const labels = convertMetadataToLabels(metadata, options);
			expect(labels).toContainEqual({ name: LabelName.EPIC, value: "Custom Epic" });
			expect(labels).not.toContainEqual({ name: LabelName.EPIC, value: "Default Epic" });
		});

		it("should include defaultFeature when no feature in metadata", () => {
			const options: AllureReporterOptions = { defaultFeature: "Default Feature" };
			const labels = convertMetadataToLabels({}, options);
			expect(labels).toContainEqual({ name: LabelName.FEATURE, value: "Default Feature" });
		});

		it("should include default labels from options", () => {
			const options: AllureReporterOptions = {
				labels: [
					{ name: "owner", value: "team-api" },
					{ name: "layer", value: "unit" },
				],
			};
			const labels = convertMetadataToLabels({}, options);
			expect(labels).toContainEqual({ name: "owner", value: "team-api" });
			expect(labels).toContainEqual({ name: "layer", value: "unit" });
		});
	});

	describe("convertMetadataToLinks", () => {
		it("should return empty array when no metadata", () => {
			const links = convertMetadataToLinks(undefined, {});
			expect(links).toEqual([]);
		});

		it("should create TMS link from id with pattern", () => {
			const metadata: TestCaseMetadata = { id: "TC-001" };
			const options: AllureReporterOptions = {
				tmsUrlPattern: "https://testrail.example.com/view/{id}",
			};
			const links = convertMetadataToLinks(metadata, options);
			expect(links).toContainEqual({
				name: "TC-001",
				url: "https://testrail.example.com/view/TC-001",
				type: LinkType.TMS,
			});
		});

		it("should create ISSUE links from issues array", () => {
			const metadata: TestCaseMetadata = { issues: ["BUG-123", "BUG-456"] };
			const options: AllureReporterOptions = {
				issueUrlPattern: "https://jira.example.com/browse/{id}",
			};
			const links = convertMetadataToLinks(metadata, options);
			expect(links).toContainEqual({
				name: "BUG-123",
				url: "https://jira.example.com/browse/BUG-123",
				type: LinkType.ISSUE,
			});
			expect(links).toContainEqual({
				name: "BUG-456",
				url: "https://jira.example.com/browse/BUG-456",
				type: LinkType.ISSUE,
			});
		});

		it("should not create TMS link when no pattern", () => {
			const metadata: TestCaseMetadata = { id: "TC-001" };
			const links = convertMetadataToLinks(metadata, {});
			expect(links.filter((l) => l.type === LinkType.TMS)).toHaveLength(0);
		});
	});

	describe("convertStep", () => {
		const defaultOptions: AllureReporterOptions = {};

		const createStep = (overrides: Partial<TestStepResult> = {}): TestStepResult => ({
			stepNumber: 1,
			type: "request",
			description: "Send getUser request",
			componentName: "api",
			passed: true,
			duration: 50,
			...overrides,
		});

		it("should map step type to step name", () => {
			const step = createStep({ type: "request", description: "Send request" });
			const result = convertStep(step, 0, defaultOptions);
			expect(result.name).toBe("Step 1: request - Send request");
		});

		it("should map step description", () => {
			const step = createStep({ description: "Custom description" });
			const result = convertStep(step, 0, defaultOptions);
			expect(result.name).toContain("Custom description");
		});

		it("should include component as parameter", () => {
			const step = createStep({ componentName: "myClient" });
			const result = convertStep(step, 0, defaultOptions);
			expect(result.parameters).toContainEqual({ name: "component", value: "myClient" });
		});

		it("should map passed status", () => {
			const step = createStep({ passed: true });
			const result = convertStep(step, 0, defaultOptions);
			expect(result.status).toBe(Status.PASSED);
		});

		it("should map failed status with error details", () => {
			const step = createStep({
				passed: false,
				error: "AssertionError: expected 200 to equal 404",
				stackTrace: "at test.ts:10:5",
			});
			const result = convertStep(step, 0, defaultOptions);
			expect(result.status).toBe(Status.FAILED);
			expect(result.statusDetails?.message).toBe("AssertionError: expected 200 to equal 404");
			expect(result.statusDetails?.trace).toBe("at test.ts:10:5");
		});

		it("should set stage to FINISHED", () => {
			const step = createStep();
			const result = convertStep(step, 0, defaultOptions);
			expect(result.stage).toBe(Stage.FINISHED);
		});
	});

	describe("convertStep with payloads", () => {
		const createStep = (overrides: Partial<TestStepResult> = {}): TestStepResult => ({
			stepNumber: 1,
			type: "request",
			description: "Send request",
			componentName: "api",
			passed: true,
			duration: 50,
			...overrides,
		});

		it("should not include payloads when includePayloads is undefined", () => {
			const step = createStep({ metadata: { request: { body: "data" } } });
			const result = convertStep(step, 0, {});
			expect(result.parameters.filter((p) => p.name === "request")).toHaveLength(0);
		});

		it("should add payload as parameter when mode is 'parameters'", () => {
			const step = createStep({ metadata: { request: { body: "test data" } } });
			const options: AllureReporterOptions = { includePayloads: "parameters" };
			const result = convertStep(step, 0, options);
			expect(result.parameters.some((p) => p.name === "request")).toBe(true);
		});

		it("should truncate payload to maxPayloadSize", () => {
			const longData = "x".repeat(2000);
			const step = createStep({ metadata: { request: longData } });
			const options: AllureReporterOptions = { includePayloads: "parameters", maxPayloadSize: 100 };
			const result = convertStep(step, 0, options);
			const requestParam = result.parameters.find((p) => p.name === "request");
			expect(requestParam?.value.length).toBeLessThanOrEqual(100);
		});

		it("should add '...' suffix when truncated", () => {
			const longData = "x".repeat(2000);
			const step = createStep({ metadata: { request: longData } });
			const options: AllureReporterOptions = { includePayloads: "parameters", maxPayloadSize: 100 };
			const result = convertStep(step, 0, options);
			const requestParam = result.parameters.find((p) => p.name === "request");
			expect(requestParam?.value.endsWith("...")).toBe(true);
		});

		it("should create attachment when mode is 'attachments'", () => {
			const step = createStep({ metadata: { request: { body: "data" } } });
			const options: AllureReporterOptions = { includePayloads: "attachments" };
			const mockWriter: AllureWriter = {
				writeTestResult: vi.fn(),
				writeContainer: vi.fn(),
				writeEnvironment: vi.fn(),
				writeAttachment: vi.fn().mockReturnValue("attachment-123.json"),
			};
			const result = convertStep(step, 0, options, mockWriter);
			expect(mockWriter.writeAttachment).toHaveBeenCalled();
			expect(result.attachments).toContainEqual({
				name: "Payload",
				source: "attachment-123.json",
				type: ContentType.JSON,
			});
		});

		it("should do both when mode is 'both'", () => {
			const step = createStep({ metadata: { request: { body: "data" } } });
			const options: AllureReporterOptions = { includePayloads: "both" };
			const mockWriter: AllureWriter = {
				writeTestResult: vi.fn(),
				writeContainer: vi.fn(),
				writeEnvironment: vi.fn(),
				writeAttachment: vi.fn().mockReturnValue("attachment-123.json"),
			};
			const result = convertStep(step, 0, options, mockWriter);
			expect(result.parameters.some((p) => p.name === "request")).toBe(true);
			expect(result.attachments.length).toBeGreaterThan(0);
		});
	});

	describe("convertTestCase", () => {
		const createTestCase = (overrides: Partial<TestCaseResult> = {}): TestCaseResult => ({
			name: "Test case name",
			passed: true,
			duration: 100,
			startTime: Date.now(),
			endTime: Date.now() + 100,
			steps: [],
			passedSteps: 0,
			failedSteps: 0,
			totalSteps: 0,
			...overrides,
		});

		it("should generate unique UUID", () => {
			const result1 = convertTestCase(createTestCase(), {});
			const result2 = convertTestCase(createTestCase(), {});
			expect(result1.uuid).not.toBe(result2.uuid);
		});

		it("should generate historyId from test name", () => {
			const testCase = createTestCase({ name: "My Test" });
			const result = convertTestCase(testCase, {});
			expect(result.historyId).toBeDefined();
			expect(typeof result.historyId).toBe("string");
		});

		it("should generate testCaseId from test name", () => {
			const testCase = createTestCase({ name: "My Test" });
			const result = convertTestCase(testCase, {});
			expect(result.testCaseId).toBeDefined();
			expect(typeof result.testCaseId).toBe("string");
		});

		it("should map name and fullName", () => {
			const testCase = createTestCase({ name: "Test Name" });
			const result = convertTestCase(testCase, {});
			expect(result.name).toBe("Test Name");
			expect(result.fullName).toBe("Test Name");
		});

		it("should include all converted steps", () => {
			const testCase = createTestCase({
				steps: [
					{ stepNumber: 1, type: "request", description: "Step 1", passed: true, duration: 10 },
					{ stepNumber: 2, type: "assert", description: "Step 2", passed: true, duration: 5 },
				],
				totalSteps: 2,
				passedSteps: 2,
			});
			const result = convertTestCase(testCase, {});
			expect(result.steps).toHaveLength(2);
		});

		it("should include all labels from metadata", () => {
			const testCase = createTestCase({
				testCaseMetadata: {
					epic: "My Epic",
					feature: "My Feature",
					tags: ["tag1"],
				},
			});
			const result = convertTestCase(testCase, {});
			expect(result.labels).toContainEqual({ name: LabelName.EPIC, value: "My Epic" });
			expect(result.labels).toContainEqual({ name: LabelName.FEATURE, value: "My Feature" });
		});

		it("should include all links from metadata", () => {
			const testCase = createTestCase({
				testCaseMetadata: {
					id: "TC-001",
					issues: ["BUG-123"],
				},
			});
			const options: AllureReporterOptions = {
				tmsUrlPattern: "https://tms/{id}",
				issueUrlPattern: "https://jira/{id}",
			};
			const result = convertTestCase(testCase, options);
			expect(result.links).toContainEqual({
				name: "TC-001",
				url: "https://tms/TC-001",
				type: LinkType.TMS,
			});
		});

		it("should set stage to FINISHED", () => {
			const result = convertTestCase(createTestCase(), {});
			expect(result.stage).toBe(Stage.FINISHED);
		});

		it("should include description from metadata", () => {
			const testCase = createTestCase({
				testCaseMetadata: { description: "Test description" },
			});
			const result = convertTestCase(testCase, {});
			expect(result.description).toBe("Test description");
		});
	});

	describe("convertToContainer", () => {
		const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
			name: "Test Scenario",
			passed: true,
			duration: 1000,
			startTime: Date.now(),
			endTime: Date.now() + 1000,
			testCases: [],
			passedTests: 0,
			failedTests: 0,
			totalTests: 0,
			...overrides,
		});

		it("should generate unique UUID", () => {
			const result1 = convertToContainer(createTestResult(), []);
			const result2 = convertToContainer(createTestResult(), []);
			expect(result1.uuid).not.toBe(result2.uuid);
		});

		it("should use scenario name", () => {
			const testResult = createTestResult({ name: "My Scenario" });
			const container = convertToContainer(testResult, []);
			expect(container.name).toBe("My Scenario");
		});

		it("should include all test case UUIDs as children", () => {
			const uuids = ["uuid-1", "uuid-2", "uuid-3"];
			const container = convertToContainer(createTestResult(), uuids);
			expect(container.children).toEqual(uuids);
		});

		it("should have empty befores and afters arrays", () => {
			const container = convertToContainer(createTestResult(), []);
			expect(container.befores).toEqual([]);
			expect(container.afters).toEqual([]);
		});
	});
});
