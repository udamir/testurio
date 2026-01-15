/**
 * TestCase Class
 *
 * Represents a single test case with before/after hooks and test steps.
 * Supports metadata for integration with test reporters (e.g., Allure).
 */

import type { Severity, TestCaseMetadata, TestCaseResult, TestStepResult } from "./execution.types";
import type { Step } from "../components/base/step.types";
import { executeSteps, summarizeStepResults } from "./step-executor";
import type { TestCaseBuilder } from "./test-case-builder";
import { generateId } from "../utils";

/**
 * TestCase - represents a single test case
 */
export class TestCase {
	readonly name: string;

	/**
	 * Unique identifier for this test case instance.
	 * Used for hook isolation when test cases run in parallel.
	 */
	readonly testCaseId: string;

	private testBuilder?: (test: TestCaseBuilder) => void;
	private beforeBuilder?: (test: TestCaseBuilder) => void;
	private afterBuilder?: (test: TestCaseBuilder) => void;
	private _metadata: TestCaseMetadata = {};

	constructor(name: string, builder: (test: TestCaseBuilder) => void, metadata?: TestCaseMetadata) {
		this.name = name;
		this.testCaseId = generateId("tc_");
		this.testBuilder = builder;
		if (metadata) {
			this._metadata = { ...metadata };
		}
	}

	// =========================================================================
	// Metadata Fluent API
	// =========================================================================

	/**
	 * Set test case ID (maps to Allure TestOps ID)
	 */
	id(value: string): this {
		this._metadata.id = value;
		return this;
	}

	/**
	 * Set epic for BDD hierarchy
	 */
	epic(value: string): this {
		this._metadata.epic = value;
		return this;
	}

	/**
	 * Set feature for BDD hierarchy
	 */
	feature(value: string): this {
		this._metadata.feature = value;
		return this;
	}

	/**
	 * Set story for BDD hierarchy
	 */
	story(value: string): this {
		this._metadata.story = value;
		return this;
	}

	/**
	 * Set severity level
	 */
	severity(value: Severity): this {
		this._metadata.severity = value;
		return this;
	}

	/**
	 * Add multiple tags
	 */
	tags(...values: string[]): this {
		this._metadata.tags = [...(this._metadata.tags ?? []), ...values];
		return this;
	}

	/**
	 * Add a single tag
	 */
	tag(value: string): this {
		return this.tags(value);
	}

	/**
	 * Add an issue/bug tracker ID
	 */
	issue(id: string): this {
		this._metadata.issues = [...(this._metadata.issues ?? []), id];
		return this;
	}

	/**
	 * Set description in markdown format
	 */
	description(text: string): this {
		this._metadata.description = text;
		return this;
	}

	/**
	 * Add a custom label
	 */
	label(name: string, value: string): this {
		this._metadata.labels = { ...this._metadata.labels, [name]: value };
		return this;
	}

	/**
	 * Get metadata for reporters
	 */
	getMetadata(): TestCaseMetadata {
		return { ...this._metadata };
	}

	/**
	 * Define before hook (setup)
	 */
	before(handler: (test: TestCaseBuilder) => void): this {
		this.beforeBuilder = handler;
		return this;
	}

	/**
	 * Define after hook (cleanup)
	 */
	after(handler: (test: TestCaseBuilder) => void): this {
		this.afterBuilder = handler;
		return this;
	}

	/**
	 * Build all steps using the provided builder
	 */
	buildSteps(builder: TestCaseBuilder): Step[] {
		const steps: Step[] = [];

		// Build before steps
		if (this.beforeBuilder) {
			builder.setPhase("before");
			this.beforeBuilder(builder);
		}

		// Build test steps
		if (this.testBuilder) {
			builder.setPhase("test");
			this.testBuilder(builder);
		}

		// Build after steps
		if (this.afterBuilder) {
			builder.setPhase("after");
			this.afterBuilder(builder);
		}

		// Get all steps (pure data, no action functions)
		steps.push(...builder.getSteps());

		return steps;
	}

	/**
	 * Execute the test case using three-phase execution
	 */
	async execute(
		builder: TestCaseBuilder,
		options?: {
			failFast?: boolean;
			abortSignal?: AbortSignal;
			onStepComplete?: (result: TestStepResult, index: number) => void;
			/** Called after steps are built but before execution, allows processing pending components */
			onBeforeExecute?: () => Promise<void>;
		}
	): Promise<TestCaseResult> {
		const startTime = Date.now();

		try {
			// Set test case context for hook isolation
			builder.setTestCaseId(this.testCaseId);

			// Build all steps (pure data)
			const allSteps = this.buildSteps(builder);

			// Allow caller to process pending components before execution
			if (options?.onBeforeExecute) {
				await options.onBeforeExecute();
			}

			// Execute steps using three-phase model
			const stepResults = await executeSteps(allSteps, this.testCaseId, {
				failFast: options?.failFast ?? true,
				abortSignal: options?.abortSignal,
				onStepComplete: options?.onStepComplete
					? (result, index) => {
							options.onStepComplete?.(this.toStepResult(result, index), index);
						}
					: undefined,
			});

			const endTime = Date.now();
			const summary = summarizeStepResults(stepResults);

			// Find first error
			const firstError = stepResults.find((r) => !r.passed)?.error;

			return {
				name: this.name,
				passed: summary.allPassed,
				duration: endTime - startTime,
				startTime,
				endTime,
				steps: stepResults.map((r, i) => this.toStepResult(r, i)),
				passedSteps: summary.passed,
				failedSteps: summary.failed,
				totalSteps: summary.total,
				error: firstError?.message,
				stackTrace: firstError?.stack,
				testCaseMetadata: this.getMetadata(),
			};
		} catch (error) {
			const endTime = Date.now();
			const err = error instanceof Error ? error : new Error(String(error));

			return {
				name: this.name,
				passed: false,
				duration: endTime - startTime,
				startTime,
				endTime,
				steps: [],
				passedSteps: 0,
				failedSteps: 1,
				totalSteps: 0,
				error: err.message,
				stackTrace: err.stack,
				testCaseMetadata: this.getMetadata(),
			};
		}
	}

	/**
	 * Convert step execution result to step result
	 */
	private toStepResult(
		result: {
			step: { type: string; componentName?: string; description?: string; metadata?: Record<string, unknown> };
			passed: boolean;
			duration: number;
			error?: Error;
		},
		index: number
	): TestStepResult {
		return {
			stepNumber: index + 1,
			type: result.step.type,
			description: result.step.description || result.step.type,
			componentName: result.step.componentName,
			passed: result.passed,
			duration: result.duration,
			error: result.error?.message,
			stackTrace: result.error?.stack,
			metadata: result.step.metadata,
		};
	}
}

/**
 * Factory function for creating test cases
 *
 * @param name - Test case name
 * @param builder - Function that defines test steps
 * @param metadata - Optional metadata for reporters (Allure labels, tags, etc.)
 *
 * @example
 * // Basic usage
 * const tc = testCase("Get user", (test) => {
 *   test.use(apiClient).request("getUser", { id: 1 });
 * });
 *
 * @example
 * // With metadata object
 * const tc = testCase("Get user", (test) => { ... }, {
 *   epic: "User Management",
 *   feature: "User API",
 *   tags: ["api", "smoke"],
 * });
 *
 * @example
 * // With fluent API
 * const tc = testCase("Get user", (test) => { ... })
 *   .epic("User Management")
 *   .feature("User API")
 *   .tags("api", "smoke")
 *   .severity("critical");
 */
export function testCase(
	name: string,
	builder: (test: TestCaseBuilder) => void,
	metadata?: TestCaseMetadata
): TestCase {
	return new TestCase(name, builder, metadata);
}
