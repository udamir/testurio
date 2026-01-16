/**
 * Allure Reporter Integration Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AllureWriter } from "@testurio/reporter-allure";
import { AllureReporter, FileSystemWriter, LabelName, Status } from "@testurio/reporter-allure";
import type { TestCaseResult, TestResult, TestStepResult } from "testurio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
		it("should produce valid Allure JSON structure", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseStart({ name: "Test case" });
			reporter.onStepComplete(createStepResult());
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			// Check required fields
			expect(result.uuid).toBeDefined();
			expect(result.name).toBe("Test case");
			expect(result.status).toBe("passed");
			expect(result.stage).toBe("finished");
			expect(result.steps).toBeInstanceOf(Array);
			expect(result.labels).toBeInstanceOf(Array);
			expect(result.links).toBeInstanceOf(Array);
		});

		it("should include framework and language labels", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.labels).toContainEqual({ name: "framework", value: "testurio" });
			expect(result.labels).toContainEqual({ name: "language", value: "typescript" });
		});
	});

	describe("metadata integration", () => {
		it("should include BDD labels in result", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					testCaseMetadata: {
						epic: "User Management",
						feature: "User API",
						story: "Get User",
					},
				})
			);
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.labels).toContainEqual({ name: "epic", value: "User Management" });
			expect(result.labels).toContainEqual({ name: "feature", value: "User API" });
			expect(result.labels).toContainEqual({ name: "story", value: "Get User" });
		});

		it("should include severity in result", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					testCaseMetadata: { severity: "critical" },
				})
			);
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.labels).toContainEqual({ name: "severity", value: "critical" });
		});

		it("should include tags in result", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					testCaseMetadata: { tags: ["api", "smoke", "regression"] },
				})
			);
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.labels).toContainEqual({ name: "tag", value: "api" });
			expect(result.labels).toContainEqual({ name: "tag", value: "smoke" });
			expect(result.labels).toContainEqual({ name: "tag", value: "regression" });
		});

		it("should include TMS link", () => {
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				tmsUrlPattern: "https://testrail.example.com/view/{id}",
			});

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					testCaseMetadata: { id: "TC-001" },
				})
			);
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.links).toContainEqual({
				name: "TC-001",
				url: "https://testrail.example.com/view/TC-001",
				type: "tms",
			});
		});

		it("should include issue links", () => {
			const reporter = new AllureReporter({
				resultsDir: tempDir,
				issueUrlPattern: "https://jira.example.com/browse/{id}",
			});

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					testCaseMetadata: { issues: ["BUG-123", "BUG-456"] },
				})
			);
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

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
	});

	describe("error handling", () => {
		it("should handle missing metadata gracefully", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult({ testCaseMetadata: undefined }));
			reporter.onComplete(createTestResult());

			const files = fs.readdirSync(tempDir);
			expect(files.length).toBeGreaterThan(0);
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

		it("should capture assertion errors as FAILED", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					passed: false,
					error: "AssertionError: expected 200 to equal 404",
					stackTrace: "at test.ts:10:5",
				})
			);
			reporter.onComplete(createTestResult({ passed: false }));

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.status).toBe("failed");
			expect(result.statusDetails.message).toBe("AssertionError: expected 200 to equal 404");
		});

		it("should capture exceptions as BROKEN", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });

			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(
				createTestCaseResult({
					passed: false,
					error: "TypeError: Cannot read property 'foo' of undefined",
					stackTrace: "at test.ts:15:8",
				})
			);
			reporter.onComplete(createTestResult({ passed: false }));

			const files = fs.readdirSync(tempDir);
			const resultFile = files.find((f) => f.endsWith("-result.json"));
			const result = JSON.parse(fs.readFileSync(path.join(tempDir, resultFile!), "utf-8"));

			expect(result.status).toBe("broken");
		});

		it("should log error in onError but not throw", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			expect(() => reporter.onError(new Error("Test error"))).not.toThrow();
			expect(consoleSpy).toHaveBeenCalledWith("[AllureReporter] Error: Test error");

			consoleSpy.mockRestore();
		});
	});

	describe("custom writer", () => {
		it("should allow setting custom writer", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const mockWriter: AllureWriter = {
				writeTestResult: vi.fn(),
				writeContainer: vi.fn(),
				writeEnvironment: vi.fn(),
				writeAttachment: vi.fn(),
			};

			reporter.setWriter(mockWriter);
			expect(reporter.getWriter()).toBe(mockWriter);
		});

		it("should use custom writer for writing results", () => {
			const reporter = new AllureReporter({ resultsDir: tempDir });
			const mockWriter: AllureWriter = {
				writeTestResult: vi.fn(),
				writeContainer: vi.fn(),
				writeEnvironment: vi.fn(),
				writeAttachment: vi.fn(),
			};

			reporter.setWriter(mockWriter);
			reporter.onStart({ name: "Test", startTime: Date.now() });
			reporter.onTestCaseComplete(createTestCaseResult());
			reporter.onComplete(createTestResult());

			expect(mockWriter.writeTestResult).toHaveBeenCalled();
			expect(mockWriter.writeContainer).toHaveBeenCalled();
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
		const writer = new FileSystemWriter(newDir);

		expect(fs.existsSync(newDir)).toBe(true);
	});

	it("should write result JSON with correct filename", () => {
		const writer = new FileSystemWriter(tempDir);
		const result = {
			uuid: "test-uuid-123",
			name: "Test",
			status: Status.PASSED,
			stage: "finished" as const,
			labels: [],
			links: [],
			steps: [],
			attachments: [],
			parameters: [],
			statusDetails: { message: undefined },
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

	it("should write environment.properties", () => {
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

	it("should write attachment with generated filename", () => {
		const writer = new FileSystemWriter(tempDir);
		const content = Buffer.from('{"key": "value"}');

		const filename = writer.writeAttachment("test-attachment", content, "application/json");

		expect(filename).toMatch(/-attachment\.json$/);
		const attachmentPath = path.join(tempDir, filename);
		expect(fs.existsSync(attachmentPath)).toBe(true);
	});

	it("should use correct file extension for MIME type", () => {
		const writer = new FileSystemWriter(tempDir);
		const content = Buffer.from("test");

		const jsonFile = writer.writeAttachment("test", content, "application/json");
		expect(jsonFile).toMatch(/\.json$/);

		const txtFile = writer.writeAttachment("test", content, "text/plain");
		expect(txtFile).toMatch(/\.txt$/);

		const pngFile = writer.writeAttachment("test", content, "image/png");
		expect(pngFile).toMatch(/\.png$/);

		const unknownFile = writer.writeAttachment("test", content, "unknown/type");
		expect(unknownFile).toMatch(/\.bin$/);
	});

	it("should return results directory path", () => {
		const writer = new FileSystemWriter(tempDir);
		expect(writer.getResultsDir()).toBe(tempDir);
	});
});
