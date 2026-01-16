/**
 * Allure Reporter
 *
 * Converts Testurio test results to Allure format.
 * Implements the TestReporter interface from Testurio core.
 */

import type { StepResult as AllureStepResult } from "allure-js-commons";
import type { TestCaseResult, TestReporter, TestResult, TestStepResult } from "testurio";
import { convertStep, convertTestCase, convertToContainer } from "./result-converter";
import type { AllureReporterOptions } from "./types";
import { FileSystemWriter } from "./writers/file-writer";
import type { AllureWriter } from "./writers/writer";

/**
 * Internal reporter state
 */
interface ReporterState {
	/** Scenario start info */
	scenarioInfo?: { name?: string; startTime: number };
	/** Accumulated test case results for container */
	testCaseUuids: string[];
	/** Currently active test case UUID */
	currentTestCaseUuid?: string;
	/** Accumulated steps for current test case */
	currentSteps: AllureStepResult[];
}

/**
 * Allure Reporter
 *
 * Converts Testurio test results to Allure-compatible format and writes
 * JSON files that can be processed by `allure generate` to create
 * interactive HTML reports.
 *
 * @example
 * ```typescript
 * const scenario = new TestScenario({
 *   name: 'API Tests',
 *   components: [server, client],
 *   reporters: [
 *     new AllureReporter({
 *       resultsDir: 'allure-results',
 *       environmentInfo: { 'Node.js': process.version },
 *     }),
 *   ],
 * });
 * ```
 */
export class AllureReporter implements TestReporter {
	readonly name = "allure";
	private options: Required<Pick<AllureReporterOptions, "resultsDir" | "maxPayloadSize">> & AllureReporterOptions;
	private writer: AllureWriter;
	private state: ReporterState;

	constructor(options?: AllureReporterOptions) {
		this.options = {
			resultsDir: "allure-results",
			maxPayloadSize: 1000,
			...options,
		};
		this.writer = new FileSystemWriter(this.options.resultsDir);
		this.state = {
			testCaseUuids: [],
			currentSteps: [],
		};
	}

	/**
	 * Get reporter options
	 */
	getOptions(): AllureReporterOptions {
		return this.options;
	}

	/**
	 * Get the writer instance (for testing)
	 */
	getWriter(): AllureWriter {
		return this.writer;
	}

	/**
	 * Set a custom writer (for testing)
	 */
	setWriter(writer: AllureWriter): void {
		this.writer = writer;
	}

	/**
	 * Called when test execution starts
	 */
	onStart(result: { name?: string; startTime: number }): void {
		// Reset state for new scenario
		this.state = {
			scenarioInfo: result,
			testCaseUuids: [],
			currentSteps: [],
		};
	}

	/**
	 * Called when a test case starts
	 */
	onTestCaseStart(_testCase: { name: string }): void {
		// Reset current steps for new test case
		this.state.currentSteps = [];
		this.state.currentTestCaseUuid = undefined;
	}

	/**
	 * Called when a test step completes
	 */
	onStepComplete(step: TestStepResult): void {
		// Convert and accumulate step
		const allureStep = convertStep(step, this.state.currentSteps.length, this.options, this.writer);
		this.state.currentSteps.push(allureStep);
	}

	/**
	 * Called when a test case completes
	 */
	onTestCaseComplete(result: TestCaseResult): void {
		// Convert test case to Allure format
		const allureResult = convertTestCase(result, this.options, this.writer);

		// Use accumulated steps (they include any attachment processing)
		// But convertTestCase also creates steps, so we use its result for consistency
		// The accumulated steps were used for real-time attachment writing

		// Write result file
		this.writer.writeTestResult(allureResult);

		// Store UUID for container
		this.state.testCaseUuids.push(allureResult.uuid);
		this.state.currentTestCaseUuid = allureResult.uuid;
	}

	/**
	 * Called when test execution completes
	 */
	onComplete(result: TestResult): void {
		// Create and write container
		const container = convertToContainer(result, this.state.testCaseUuids);
		this.writer.writeContainer(container);

		// Write environment info if configured
		if (this.options.environmentInfo) {
			this.writer.writeEnvironment(this.options.environmentInfo);
		}
	}

	/**
	 * Called when an error occurs
	 */
	onError(error: Error): void {
		// Log error but don't throw - let other reporters continue
		console.error(`[AllureReporter] Error: ${error.message}`);
	}
}
