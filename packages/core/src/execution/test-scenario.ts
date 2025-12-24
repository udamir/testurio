/**
 * TestScenario Class
 *
 * Main orchestrator for test execution with component lifecycle management.
 * Component management is inlined for simplicity.
 */

import { TestCaseBuilder } from "../builders";
import { Client, Server, AsyncClient, AsyncServer } from "../components";
import type { Component } from "../components/component";
import {
	ConsoleReporter,
	InteractionRecorder,
	type TestReporter,
} from "../recording";
import type {
	Interaction,
	TestCaseResult,
	TestResult,
	TestStepResult,
} from "../types";
import type { TestCase } from "./test-case";

/**
 * Test scenario configuration
 */
export interface TestScenarioConfig {
	name: string;
	description?: string;
	components: Component[];
	timeout?: number;
	recording?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * TestScenario - orchestrates test execution
 */
export class TestScenario<
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	// ========== Instance Members ==========

	private config: TestScenarioConfig;
	private components = new Map<string, Component>();
	private context: TContext;
	private initHandler?: (test: TestCaseBuilder<TContext>) => void;
	private stopHandler?: (test: TestCaseBuilder<TContext>) => void;
	private interactions: Interaction[] = [];
	private initialized = false;
	private recorder: InteractionRecorder;
	private reporters: TestReporter[] = [];

	constructor(config: TestScenarioConfig) {
		this.config = config;
		this.context = {} as TContext;
		this.recorder = new InteractionRecorder();

		// Enable recording if configured
		if (!this.config.recording) {
			this.recorder.disable();
		}

		// Register components (already created externally)
		for (const component of config.components) {
			this.registerComponent(component);
		}
	}

	// ========== Component Management ==========

	/**
	 * Register a component
	 */
	private registerComponent(component: Component): void {
		if (this.components.has(component.name)) {
			throw new Error(`Component ${component.name} already exists`);
		}
		this.components.set(component.name, component);
	}

	/**
	 * Start all components
	 * Order: servers first, then clients
	 */
	private async startComponents(): Promise<void> {
		const all = Array.from(this.components.values());

		// Include both sync and async server/client types
		const servers = all.filter((c) => c instanceof Server || c instanceof AsyncServer);
		const clients = all.filter((c) => c instanceof Client || c instanceof AsyncClient);

		await Promise.all(servers.map((c) => c.start()));
		await Promise.all(clients.map((c) => c.start()));
	}

	/**
	 * Stop all components
	 * Order: clients first, then servers
	 */
	private async stopComponents(): Promise<void> {
		const all = Array.from(this.components.values());

		// Include both sync and async server/client types
		const clients = all.filter((c) => c instanceof Client || c instanceof AsyncClient);
		const servers = all.filter((c) => c instanceof Server || c instanceof AsyncServer);

		await Promise.all(clients.map((c) => c.stop().catch(() => {})));
		await Promise.all(servers.map((c) => c.stop().catch(() => {})));
	}

	/**
	 * Define init handler
	 */
	init(handler: (test: TestCaseBuilder<TContext>) => void): this {
		this.initHandler = handler;
		return this;
	}

	/**
	 * Define stop handler
	 */
	stop(handler: (test: TestCaseBuilder<TContext>) => void): this {
		this.stopHandler = handler;
		return this;
	}

	/**
	 * Get shared context
	 */
	getContext(): TContext {
		return this.context;
	}

	/**
	 * Get interaction recorder
	 */
	getRecorder(): InteractionRecorder {
		return this.recorder;
	}

	/**
	 * Add a reporter
	 */
	addReporter(reporter: TestReporter): this {
		this.reporters.push(reporter);
		return this;
	}

	/**
	 * Use console reporter
	 */
	useConsoleReporter(options?: { verbose?: boolean }): this {
		this.reporters.push(new ConsoleReporter(options));
		return this;
	}

	/**
	 * Run initialization
	 */
	private async runInit(): Promise<void> {
		if (this.initialized) return;

		// Start initial components (from constructor config)
		await this.startComponents();

		// Run init handler if defined
		if (this.initHandler) {
			const builder = this.createBuilder();
			builder.setPhase("init");
			this.initHandler(builder);

			// Process any dynamically created components (start them)
			// Note: Components created in init are always scenario-scoped
			await this.processPendingComponents(builder);

			// Execute init steps
			const steps = builder.getSteps();
			for (const step of steps) {
				await step.action();
			}
		}

		this.initialized = true;
	}

	/**
	 * Run cleanup
	 */
	private async runStop(): Promise<void> {
		// Run stop handler if defined
		if (this.stopHandler) {
			const builder = this.createBuilder();
			builder.setPhase("stop");
			this.stopHandler(builder);

			// Execute stop steps
			const steps = builder.getSteps();
			for (const step of steps) {
				try {
					await step.action();
				} catch (error) {
					// Continue with cleanup even if stop steps fail
				}
			}
		}

		// Stop all components (components dispose their own adapters and clear their hooks)
		await this.stopComponents();

		this.initialized = false;
	}

	/**
	 * Create a test case builder
	 */
	private createBuilder(): TestCaseBuilder<TContext> {
		const builder = new TestCaseBuilder<TContext>(
			this.components,
			this.context,
		);
		builder.setComponentRegistry(this.components);
		return builder;
	}

	/**
	 * Process pending components from a builder
	 * Starts components (already registered during builder phase), returns list of test-case-scoped components for cleanup
	 */
	private async processPendingComponents(
		builder: TestCaseBuilder<TContext>,
	): Promise<Component[]> {
		const pending = builder.getPendingComponents();
		const testCaseComponents: Component[] = [];

		for (const { component, options } of pending) {
			// Start the component
			await component.start();

			// Track test-case-scoped components for cleanup
			if (options.scope === "testCase") {
				testCaseComponents.push(component);
			}
		}

		builder.clearPendingComponents();
		return testCaseComponents;
	}

	/**
	 * Stop and remove test-case-scoped components
	 */
	private async cleanupTestCaseComponents(
		components: Component[],
	): Promise<void> {
		for (const component of components) {
			try {
				await component.stop();
				this.components.delete(component.name);
			} catch {
				// Continue cleanup even if stop fails
			}
		}
	}

	/**
	 * Run test cases
	 *
	 * Execution modes:
	 * - Single TestCase: runs alone
	 * - Array of TestCase[]: runs sequentially within the array
	 * - Multiple args: runs in parallel across args
	 *
	 * Example:
	 *   run(test1, test2, test3)           // all 3 run in parallel
	 *   run([test1, test2], test3)         // test1 & test2 sequential, test3 in parallel with them
	 *   run([test1, test2], [test3, test4]) // two sequential groups running in parallel
	 */
	async run(
		...testCases: (TestCase<TContext> | TestCase<TContext>[])[]
	): Promise<TestResult> {
		const startTime = Date.now();
		const results: TestCaseResult[] = [];

		// Notify reporters of start
		for (const reporter of this.reporters) {
			reporter.onStart?.({ name: this.config.name, startTime });
		}

		try {
			// Initialize scenario
			await this.runInit();

			// Normalize: each arg becomes a group (array runs sequentially, single item is a group of 1)
			const parallelGroups = testCases.map((tc) =>
				Array.isArray(tc) ? tc : [tc],
			);

			// Execute all groups in parallel, within each group run sequentially
			const executeGroup = async (
				group: TestCase<TContext>[],
			): Promise<TestCaseResult[]> => {
				const results: TestCaseResult[] = [];
				for (const testCase of group) {
					const result = await this.executeTestCase(testCase);
					results.push(result);
				}
				return results;
			};

			// Create promises but don't await yet - this starts all groups in parallel
			const groupResults = await Promise.all(parallelGroups.map(executeGroup));

			// Flatten results
			for (const group of groupResults) {
				results.push(...group);
			}
		} catch (error) {
			// Test execution failed
		} finally {
			// Always run cleanup
			try {
				await this.runStop();
			} catch (error) {
				// Cleanup failed
			}
		}

		const endTime = Date.now();

		const result = this.createTestResult(results, startTime, endTime);

		// Notify reporters of completion
		for (const reporter of this.reporters) {
			reporter.onComplete(result);
		}

		return result;
	}

	/**
	 * Execute a single test case
	 */
	private async executeTestCase(
		testCase: TestCase<TContext>,
	): Promise<TestCaseResult> {
		// Notify reporters
		for (const reporter of this.reporters) {
			reporter.onTestCaseStart?.({ name: testCase.name });
		}

		const builder = this.createBuilder();
		let testCaseComponents: Component[] = [];

		const result = await testCase.execute(builder, {
			failFast: true,
			onBeforeExecute: async () => {
				// Process any dynamically created components before executing steps
				testCaseComponents = await this.processPendingComponents(builder);
			},
			onStepComplete: (stepResult: TestStepResult) => {
				// Notify reporters
				for (const reporter of this.reporters) {
					reporter.onStepComplete?.(stepResult);
				}
			},
		});

		// Cleanup test-case-scoped components
		if (testCaseComponents.length > 0) {
			await this.cleanupTestCaseComponents(testCaseComponents);
		}

		// Record interactions if enabled
		if (this.config.recording && result.interactions) {
			this.interactions.push(...result.interactions);
		}

		// Notify reporters
		for (const reporter of this.reporters) {
			reporter.onTestCaseComplete?.(result);
		}

		return result;
	}

	/**
	 * Create final test result
	 */
	private createTestResult(
		testCases: TestCaseResult[],
		startTime: number,
		endTime: number,
	): TestResult {
		const passedTests = testCases.filter((tc) => tc.passed).length;
		const failedTests = testCases.filter((tc) => !tc.passed).length;

		return {
			name: this.config.name,
			passed: failedTests === 0,
			duration: endTime - startTime,
			startTime,
			endTime,
			testCases,
			passedTests,
			failedTests,
			totalTests: testCases.length,
			interactions: this.config.recording ? this.interactions : undefined,
			summary: {
				totalTestCases: testCases.length,
				passedTestCases: passedTests,
				failedTestCases: failedTests,
				totalSteps: testCases.reduce((sum, tc) => sum + tc.totalSteps, 0),
				passedSteps: testCases.reduce((sum, tc) => sum + tc.passedSteps, 0),
				failedSteps: testCases.reduce((sum, tc) => sum + tc.failedSteps, 0),
				totalDuration: endTime - startTime,
				averageDuration:
					testCases.length > 0
						? Math.round((endTime - startTime) / testCases.length)
						: 0,
				totalInteractions: this.interactions.length,
				passRate: testCases.length > 0 ? passedTests / testCases.length : 1,
			},
		};
	}
}

/**
 * Factory function for creating test scenarios
 */
export function scenario<
	TContext extends Record<string, unknown> = Record<string, unknown>,
>(config: TestScenarioConfig): TestScenario<TContext> {
	return new TestScenario<TContext>(config);
}
