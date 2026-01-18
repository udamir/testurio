/**
 * Allure Reporter Integration Tests
 *
 * Tests the full reporter lifecycle with real file I/O.
 * Minimizes mocks by verifying behavior through actual JSON output.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AllureReporterOptions } from "@testurio/reporter-allure";
import {
	AllureReporter,
	convertMetadataToLabels,
	convertStatusDetails,
	convertTestCase,
	convertToContainer,
	FileSystemWriter,
	LabelName,
	Stage,
	Status,
} from "@testurio/reporter-allure";
import type { TestCaseMetadata, TestCaseResult, TestResult, TestStepResult } from "testurio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("AllureReporter", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "allure-test-"));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true });
		}
	});

	const createStepResult = (overrides: Partial<TestStepResult> = {}): TestStepResult => ({
		stepNumber: 1,
		type: "request",
		description: "Send request",
		componentName: "api",
		passed: true,
		duration: 50,
		...overrides,
	});

	const createTestCaseResult = (overrides: Partial<TestCaseResult> = {}): TestCaseResult => ({
		name: "Test case",
		passed: true,
		duration: 100,
		startTime: Date.now(),
		endTime: Date.now() + 100,
		steps: [createStepResult()],
		passedSteps: 1,
		failedSteps: 0,
		totalSteps: 1,
		...overrides,
	});

	const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
		name: "Test Scenario",
		passed: true,
		duration: 200,
		startTime: Date.now(),
		endTime: Date.now() + 200,
		testCases: [createTestCaseResult()],
		passedTests: 1,
		failedTests: 0,
		totalTests: 1,
		...overrides,
	});

	// Helper to run full lifecycle and get result JSON
	const runAndGetResult = (
		reporter: AllureReporter,
		testCaseResult: TestCaseResult = createTestCaseResult()
	): Record<string, unknown> => {
		reporter.onStart({ name: "Test", startTime: Date.now() });
		reporter.onTestCaseStart({ name: testCaseResult.name });
		for (const step of testCaseResult.steps) {
			reporter.onStepComplete(step);
		}
		reporter.onTestCaseComplete(testCaseResult);
		reporter.onComplete(createTestResult({ testCases: [testCaseResult] }));

		const files = fs.readdirSync(tempDir);
		const resultFile = files.find((f) => f.endsWith("-result.json"));
		return JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));
	};

	describe("constructor", () => {
		it("should use default resultsDir when not specified", () => {
			const reporter = new AllureReporter();
			expect(reporter.getOptions().resultsDir).toBe("allure-results");
		});

		it("should use custom resultsDir when specified", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			expect(reporter.getOptions().resultsDir).toBe(tempDir);
		});

		it("should have name property set to 'allure'", () => {
			const reporter = new AllureReporter();
			expect(reporter.name).toBe("allure");
		});
	});

	describe("lifecycle", () => {
		it("should create result file on test case complete", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseStart({ name: "Test case" });
			reporter.onStepComplete(createStepResult());
			reporter.onTestCaseComplete(createTestCaseResult());

			const files = fs.readdirSync(tempDir);
			const resultFiles = files.filter((f) => f.endsWith("-result.json"));
			expect(resultFiles).toHaveLength(1);
		});

		it("should create container file on complete", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseStart({ name: "Test case" });
			reporter.onStepComplete(createStepResult());
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const containerFiles = files.filter((f) => f.endsWith("-container.json"));
			expect(containerFiles).toHaveLength(1);
		});

		it("should write environment.properties when configured", () => {
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				environmentInfo: {
					"Node.js": "v20.0.0",
					OS: "darwin",
				},
			});

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult());

			const envFile = path.join(tempDir, "environment.properties");
			expect(fs.existsSync(envFile)).toBe(true);

			const content = fs.readFileSync(envFile, "utf-8");
			expect(content).toContain("Node.js=v20.0.0");
			expect(content).toContain("OS=darwin");
		});

		it("should accumulate multiple test cases in container", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });

			// First test case
			reporter.onTestCaseStart({ name: "Test case 1" });
			reporter.onStepComplete(createStepResult());
			reporter.onTestCaseComplete(createTestCaseResult({ name: "Test case 1" }));

			// Second test case
			reporter.onTestCaseStart({ name: "Test case 2" });
			reporter.onStepComplete(createStepResult());
			reporter.onTestCaseComplete(createTestCaseResult({ name: "Test case 2" }));

			reporter.onComplete(
				createTestResult({
					testCases: [createTestCaseResult({ name: "Test case 1" }), createTestCaseResult({ name: "Test case 2" })],
					totalTests: 2,
					passedTests: 2,
				})
			);

			const files = fs.readdirSync(tempDir);
			const resultFiles = files.filter((f) => f.endsWith("-result.json"));
			const containerFiles = files.filter((f) => f.endsWith("-container.json"));

			expect(resultFiles).toHaveLength(2);
			expect(containerFiles).toHaveLength(1);

			// Check container has both children
			const containerFile = containerFiles[0];
			const container = JSON.parse(fs.readFileSync(path.join(tempDir, containerFile), "utf-8"));
			expect(container.children).toHaveLength(2);
		});
	});

	describe("result file structure", () => {
		it("should produce valid Allure JSON structure with all required fields", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(reporter);

			// Check all required Allure fields
			expect(result.uuid).toBeDefined();
			expect(typeof result.uuid).toBe("string");
			expect(result.historyId).toBeDefined();
			expect(typeof result.historyId).toBe("string");
			expect(result.testCaseId).toBeDefined();
			expect(typeof result.testCaseId).toBe("string");
			expect(result.name).toBe("Test case");
			expect(result.fullName).toBe("Test case");
			expect(result.status).toBe("passed");
			expect(result.stage).toBe("finished");
			expect(result.steps).toBeInstanceOf(Array);
			expect(result.labels).toBeInstanceOf(Array);
			expect(result.links).toBeInstanceOf(Array);
			expect(result.start).toBeDefined();
			expect(result.stop).toBeDefined();
		});

		it("should include framework and language labels", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(reporter);

			expect(result.labels).toContainEqual({ name: "framework", value: "testurio" });
			expect(result.labels).toContainEqual({ name: "language", value: "typescript" });
		});

		it("should format step name with type and description", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ stepNumber: 1, type: "request", description: "GET /users" })],
				})
			);

			const steps = result.steps as Array<{ name: string }>;
			expect(steps[0].name).toBe("Step 1: request - GET /users");
		});

		it("should include component as step parameter", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ componentName: "myApiClient" })],
				})
			);

			const steps = result.steps as Array<{ parameters: Array<{ name: string; value: string }> }>;
			expect(steps[0].parameters).toContainEqual({ name: "component", value: "myApiClient" });
		});
	});

	describe("status mapping", () => {
		it("should map passed=true to status 'passed'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(reporter, createTestCaseResult({ passed: true }));
			expect(result.status).toBe("passed");
		});

		it("should map assertion errors to status 'failed'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					passed: false,
					error: "AssertionError: expected 200 to equal 404",
					stackTrace: "at test.ts:10:5",
				})
			);

			expect(result.status).toBe("failed");
			expect((result.statusDetails as { message: string }).message).toBe("AssertionError: expected 200 to equal 404");
			expect((result.statusDetails as { trace: string }).trace).toBe("at test.ts:10:5");
		});

		it("should map expect errors to status 'failed'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					passed: false,
					error: "expect(received).toBe(expected)",
				})
			);

			expect(result.status).toBe("failed");
		});

		it("should map unexpected errors to status 'broken'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					passed: false,
					error: "TypeError: Cannot read property 'foo' of undefined",
				})
			);

			expect(result.status).toBe("broken");
		});

		it("should map errors without message to status 'broken'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					passed: false,
					error: undefined,
				})
			);

			expect(result.status).toBe("broken");
		});
	});

	describe("labels from metadata", () => {
		it("should include ALLURE_ID from id metadata", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { id: "TC-001" },
				})
			);

			expect(result.labels).toContainEqual({ name: "ALLURE_ID", value: "TC-001" });
		});

		it("should include BDD labels (epic, feature, story)", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: {
						epic: "User Management",
						feature: "User API",
						story: "Get User",
					},
				})
			);

			expect(result.labels).toContainEqual({ name: "epic", value: "User Management" });
			expect(result.labels).toContainEqual({ name: "feature", value: "User API" });
			expect(result.labels).toContainEqual({ name: "story", value: "Get User" });
		});

		it("should include severity label", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { severity: "critical" },
				})
			);

			expect(result.labels).toContainEqual({ name: "severity", value: "critical" });
		});

		it("should include multiple tags as separate labels", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { tags: ["api", "smoke", "regression"] },
				})
			);

			expect(result.labels).toContainEqual({ name: "tag", value: "api" });
			expect(result.labels).toContainEqual({ name: "tag", value: "smoke" });
			expect(result.labels).toContainEqual({ name: "tag", value: "regression" });
		});

		it("should include custom labels from metadata", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { labels: { owner: "team-api", layer: "integration" } },
				})
			);

			expect(result.labels).toContainEqual({ name: "owner", value: "team-api" });
			expect(result.labels).toContainEqual({ name: "layer", value: "integration" });
		});

		it("should use defaultEpic when no epic in metadata", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir, defaultEpic: "Default Epic" });
			const result = runAndGetResult(reporter, createTestCaseResult({ testCaseMetadata: {} }));

			expect(result.labels).toContainEqual({ name: "epic", value: "Default Epic" });
		});

		it("should use defaultFeature when no feature in metadata", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir, defaultFeature: "Default Feature" });
			const result = runAndGetResult(reporter, createTestCaseResult({ testCaseMetadata: {} }));

			expect(result.labels).toContainEqual({ name: "feature", value: "Default Feature" });
		});

		it("should include default labels from options", () => {
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				labels: [
					{ name: "owner", value: "team-api" },
					{ name: "layer", value: "unit" },
				],
			});
			const result = runAndGetResult(reporter);

			expect(result.labels).toContainEqual({ name: "owner", value: "team-api" });
			expect(result.labels).toContainEqual({ name: "layer", value: "unit" });
		});

		it("should include description from metadata", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { description: "This test verifies user retrieval" },
				})
			);

			expect(result.description).toBe("This test verifies user retrieval");
		});
	});

	describe("links from metadata", () => {
		it("should include TMS link when pattern configured", () => {
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				tmsUrlPattern: "https://testrail.example.com/view/{id}",
			});
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { id: "TC-001" },
				})
			);

			expect(result.links).toContainEqual({
				name: "TC-001",
				url: "https://testrail.example.com/view/TC-001",
				type: "tms",
			});
		});

		it("should include issue links when pattern configured", () => {
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				issueUrlPattern: "https://jira.example.com/browse/{id}",
			});
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { issues: ["BUG-123", "BUG-456"] },
				})
			);

			expect(result.links).toContainEqual({
				name: "BUG-123",
				url: "https://jira.example.com/browse/BUG-123",
				type: "issue",
			});
			expect(result.links).toContainEqual({
				name: "BUG-456",
				url: "https://jira.example.com/browse/BUG-456",
				type: "issue",
			});
		});

		it("should not include TMS link when no pattern configured", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					testCaseMetadata: { id: "TC-001" },
				})
			);

			const links = result.links as Array<{ type: string }>;
			expect(links.filter((l) => l.type === "tms")).toHaveLength(0);
		});

		it("should have empty links when no metadata", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(reporter, createTestCaseResult({ testCaseMetadata: undefined }));

			expect(result.links).toEqual([]);
		});
	});

	describe("payload capture", () => {
		it("should not include payloads when includePayloads is undefined", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ metadata: { request: { body: "data" } } })],
				})
			);

			const steps = result.steps as Array<{ parameters: Array<{ name: string }> }>;
			const requestParams = steps[0].parameters.filter((p) => p.name === "request");
			expect(requestParams).toHaveLength(0);
		});

		it("should add payload as parameter when mode is 'parameters'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir, includePayloads: "parameters" });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ metadata: { request: { body: "test data" } } })],
				})
			);

			const steps = result.steps as Array<{ parameters: Array<{ name: string; value: string }> }>;
			expect(steps[0].parameters.some((p) => p.name === "request")).toBe(true);
		});

		it("should truncate payload to maxPayloadSize with '...' suffix", () => {
			const longData = "x".repeat(2000);
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				includePayloads: "parameters",
				maxPayloadSize: 100,
			});
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ metadata: { request: longData } })],
				})
			);

			const steps = result.steps as Array<{ parameters: Array<{ name: string; value: string }> }>;
			const requestParam = steps[0].parameters.find((p) => p.name === "request");
			expect(requestParam?.value.length).toBeLessThanOrEqual(100);
			expect(requestParam?.value.endsWith("...")).toBe(true);
		});

		it("should create attachment file when mode is 'attachments'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir, includePayloads: "attachments" });
			runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ metadata: { request: { body: "data" } } })],
				})
			);

			const files = fs.readdirSync(tempDir);
			const attachmentFiles = files.filter((f) => f.includes("-attachment."));
			expect(attachmentFiles.length).toBeGreaterThan(0);
		});

		it("should include attachment reference in step when mode is 'attachments'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir, includePayloads: "attachments" });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ metadata: { request: { body: "data" } } })],
				})
			);

			const steps = result.steps as Array<{ attachments: Array<{ name: string; source: string; type: string }> }>;
			expect(steps[0].attachments.length).toBeGreaterThan(0);
			expect(steps[0].attachments[0].name).toBe("Payload");
			expect(steps[0].attachments[0].type).toBe("application/json");
		});

		it("should include both parameter and attachment when mode is 'both'", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir, includePayloads: "both" });
			const result = runAndGetResult(
				reporter,
				createTestCaseResult({
					steps: [createStepResult({ metadata: { request: { body: "data" } } })],
				})
			);

			const steps = result.steps as Array<{
				parameters: Array<{ name: string }>;
				attachments: Array<{ name: string }>;
			}>;

			// Should have parameter
			expect(steps[0].parameters.some((p) => p.name === "request")).toBe(true);
			// Should have attachment
			expect(steps[0].attachments.length).toBeGreaterThan(0);

			// Should have attachment file
			const files = fs.readdirSync(tempDir);
			const attachmentFiles = files.filter((f) => f.includes("-attachment."));
			expect(attachmentFiles.length).toBeGreaterThan(0);
		});
	});

	describe("container structure", () => {
		it("should use scenario name in container", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "My Test Scenario", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult({ name: "My Test Scenario" }));

			const files = fs.readdirSync(tempDir);
			const containerFile = files.find((f) => f.endsWith("-container.json"));
			const container = JSON.parse(fs.readFileSync(path.join(tempDir, containerFile!), "utf-8"));

			expect(container.name).toBe("My Test Scenario");
		});

		it("should have empty befores and afters arrays", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const containerFile = files.find((f) => f.endsWith("-container.json"));
			const container = JSON.parse(fs.readFileSync(path.join(tempDir, containerFile!), "utf-8"));

			expect(container.befores).toEqual([]);
			expect(container.afters).toEqual([]);
		});
	});

	describe("error handling", () => {
		it("should handle missing metadata gracefully", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const result = runAndGetResult(reporter, createTestCaseResult({ testCaseMetadata: undefined }));

			// Should still have framework labels
			expect(result.labels).toContainEqual({ name: "framework", value: "testurio" });
		});

		it("should handle empty step list", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult({ steps: [], totalSteps: 0 }));
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.steps).toEqual([]);
		});
	});
});

describe("FileSystemWriter", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "allure-writer-test-"));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true });
		}
	});

	it("should create output directory if not exists", () => {
		const newDir = path.join(tempDir, "nested", "dir");
		new FileSystemWriter(newDir);

		expect(fs.existsSync(newDir)).toBe(true);
	});

	it("should write result JSON with correct filename", () => {
		const writer = new FileSystemWriter(tempDir);
		const result = {
			uuid: "test-uuid-123",
			historyId: "history-123",
			testCaseId: "testcase-123",
			name: "Test",
			fullName: "Test",
			status: Status.PASSED,
			stage: Stage.FINISHED,
			labels: [],
			links: [],
			steps: [],
			attachments: [],
			parameters: [],
			statusDetails: {},
		};

		writer.writeTestResult(result);

		const expectedFile = path.join(tempDir, "test-uuid-123-result.json");
		expect(fs.existsSync(expectedFile)).toBe(true);
	});

	it("should write container JSON with correct filename", () => {
		const writer = new FileSystemWriter(tempDir);
		const container = {
			uuid: "container-uuid-456",
			name: "Container",
			children: ["child-1", "child-2"],
			befores: [],
			afters: [],
		};

		writer.writeContainer(container);

		const expectedFile = path.join(tempDir, "container-uuid-456-container.json");
		expect(fs.existsSync(expectedFile)).toBe(true);
	});

	it("should write environment.properties with correct format", () => {
		const writer = new FileSystemWriter(tempDir);

		writer.writeEnvironment({
			"Node.js": "v20.0.0",
			OS: "darwin",
			Environment: "test",
		});

		const envFile = path.join(tempDir, "environment.properties");
		expect(fs.existsSync(envFile)).toBe(true);

		const content = fs.readFileSync(envFile, "utf-8");
		expect(content).toContain("Node.js=v20.0.0");
		expect(content).toContain("OS=darwin");
		expect(content).toContain("Environment=test");
	});

	it("should write attachment with generated filename and correct extension", () => {
		const writer = new FileSystemWriter(tempDir);
		const content = Buffer.from('{"key": "value"}');

		const filename = writer.writeAttachment("test-attachment", content, "application/json");

		expect(filename).toMatch(/-attachment\.json$/);
		const attachmentPath = path.join(tempDir, filename);
		expect(fs.existsSync(attachmentPath)).toBe(true);

		// Verify content
		const savedContent = fs.readFileSync(attachmentPath, "utf-8");
		expect(savedContent).toBe('{"key": "value"}');
	});

	it("should use correct file extension for different MIME types", () => {
		const writer = new FileSystemWriter(tempDir);
		const content = Buffer.from("test");

		expect(writer.writeAttachment("test", content, "application/json")).toMatch(/\.json$/);
		expect(writer.writeAttachment("test", content, "text/plain")).toMatch(/\.txt$/);
		expect(writer.writeAttachment("test", content, "image/png")).toMatch(/\.png$/);
		expect(writer.writeAttachment("test", content, "unknown/type")).toMatch(/\.bin$/);
	});

	it("should return results directory path", () => {
		const writer = new FileSystemWriter(tempDir);
		expect(writer.getResultsDir()).toBe(tempDir);
	});
});

describe("ResultConverter - Edge Cases", () => {
	describe("convertStatusDetails", () => {
		// These test internal object structure not observable via JSON output

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

	describe("convertMetadataToLabels - priority rules", () => {
		// Tests label priority logic that's hard to verify via integration tests

		it("should prefer metadata epic over defaultEpic", () => {
			const options: AllureReporterOptions = { defaultEpic: "Default Epic" };
			const metadata: TestCaseMetadata = { epic: "Custom Epic" };
			const labels = convertMetadataToLabels(metadata, options);

			// Should have custom epic
			expect(labels).toContainEqual({ name: LabelName.EPIC, value: "Custom Epic" });
			// Should NOT have default epic
			expect(labels).not.toContainEqual({ name: LabelName.EPIC, value: "Default Epic" });
		});

		it("should prefer metadata feature over defaultFeature", () => {
			const options: AllureReporterOptions = { defaultFeature: "Default Feature" };
			const metadata: TestCaseMetadata = { feature: "Custom Feature" };
			const labels = convertMetadataToLabels(metadata, options);

			expect(labels).toContainEqual({ name: LabelName.FEATURE, value: "Custom Feature" });
			expect(labels).not.toContainEqual({ name: LabelName.FEATURE, value: "Default Feature" });
		});
	});

	describe("convertTestCase - deterministic IDs", () => {
		// Tests that same test name produces same historyId/testCaseId

		const createTestCase = (name: string): TestCaseResult => ({
			name,
			passed: true,
			duration: 100,
			startTime: Date.now(),
			endTime: Date.now() + 100,
			steps: [],
			passedSteps: 0,
			failedSteps: 0,
			totalSteps: 0,
		});

		it("should generate same historyId for same test name", () => {
			const result1 = convertTestCase(createTestCase("My Test"), {});
			const result2 = convertTestCase(createTestCase("My Test"), {});

			expect(result1.historyId).toBe(result2.historyId);
		});

		it("should generate same testCaseId for same test name", () => {
			const result1 = convertTestCase(createTestCase("My Test"), {});
			const result2 = convertTestCase(createTestCase("My Test"), {});

			expect(result1.testCaseId).toBe(result2.testCaseId);
		});

		it("should generate different historyId for different test names", () => {
			const result1 = convertTestCase(createTestCase("Test A"), {});
			const result2 = convertTestCase(createTestCase("Test B"), {});

			expect(result1.historyId).not.toBe(result2.historyId);
		});

		it("should generate unique UUID on each call", () => {
			const result1 = convertTestCase(createTestCase("My Test"), {});
			const result2 = convertTestCase(createTestCase("My Test"), {});

			expect(result1.uuid).not.toBe(result2.uuid);
		});
	});

	describe("convertToContainer - UUID generation", () => {
		const createTestResult = (): TestResult => ({
			name: "Test Scenario",
			passed: true,
			duration: 1000,
			startTime: Date.now(),
			endTime: Date.now() + 1000,
			testCases: [],
			passedTests: 0,
			failedTests: 0,
			totalTests: 0,
		});

		it("should generate unique UUID on each call", () => {
			const result1 = convertToContainer(createTestResult(), []);
			const result2 = convertToContainer(createTestResult(), []);

			expect(result1.uuid).not.toBe(result2.uuid);
		});
	});
});
