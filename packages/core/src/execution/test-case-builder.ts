/**
 * Test Case Builder
 *
 * Main builder for creating test cases with fluent API.
 * This builder is agnostic to component types - it works with any Component
 * and relies on the component's createStepBuilder method for type inference.
 */

import type { Component, CreateComponentOptions, ITestCaseContext } from "../components/base";
import type { Step } from "../components/base/step.types";
import type { TestPhase } from "./execution.types";

/**
 * Pending component to be started
 */
export interface PendingComponent {
	component: Component;
	options: CreateComponentOptions;
}

/**
 * Test Case Builder
 *
 * Provides fluent API for building test cases.
 * Implements ITestCaseContext for step registration.
 */
export class TestCaseBuilder implements ITestCaseContext {
	private steps: Step[] = [];
	private currentPhase: TestPhase = "test";
	private pendingComponents: PendingComponent[] = [];
	private componentRegistry?: Map<string, Component>;

	/**
	 * Test case ID for hook isolation.
	 * Set by TestCase.execute() before building steps.
	 */
	private _testCaseId?: string;

	constructor(private components: Map<string, Component>) {}

	/**
	 * Set the test case ID for hook isolation.
	 * Called by TestCase.execute() before building steps.
	 */
	setTestCaseId(testCaseId: string): void {
		this._testCaseId = testCaseId;
	}

	/**
	 * Get the current test case ID.
	 */
	get testCaseId(): string | undefined {
		return this._testCaseId;
	}

	/**
	 * Get current phase (ITestCaseContext implementation)
	 */
	get phase(): string {
		return this.currentPhase;
	}

	/**
	 * Set component registry for dynamic component registration
	 */
	setComponentRegistry(registry: Map<string, Component>): void {
		this.componentRegistry = registry;
	}

	/**
	 * Get pending components to be started
	 */
	getPendingComponents(): PendingComponent[] {
		return [...this.pendingComponents];
	}

	/**
	 * Clear pending components after they've been processed
	 */
	clearPendingComponents(): void {
		this.pendingComponents = [];
	}

	/**
	 * Set current phase (for internal use)
	 */
	setPhase(phase: TestPhase): void {
		this.currentPhase = phase;
	}

	/**
	 * Get all registered steps
	 */
	getSteps(): Step[] {
		return [...this.steps];
	}

	/**
	 * Register a step (ITestCaseContext implementation)
	 * Accepts Step object (pure data, no action function)
	 */
	registerStep(step: Step): void {
		this.steps.push(step);
	}

	/**
	 * Use a component and get its typed step builder.
	 *
	 * If the component is not already registered, it will be auto-registered
	 * with testCase scope (automatically cleaned up after the test case completes).
	 *
	 * Works with any Component type - built-in (Client, Server, AsyncClient, AsyncServer)
	 * or custom components (like DataSource).
	 *
	 * @example
	 * ```typescript
	 * // Pre-registered component (in scenario.components)
	 * const tc = testCase("test", (test) => {
	 *   const api = test.use(apiClient);
	 *   api.request("getUsers", { method: "GET", path: "/users" });
	 * });
	 *
	 * // Dynamic component (auto-registered with testCase scope)
	 * const tc = testCase("test", (test) => {
	 *   const server = test.use(new Server("backend", { ... }));
	 *   const api = test.use(new Client("api", { ... }));
	 *   api.request("test", { method: "GET", path: "/test" });
	 *   server.onRequest("test").mockResponse(() => ({ ... }));
	 * });
	 *
	 * // DataSource component
	 * const tc = testCase("test", (test) => {
	 *   const redis = test.use(cache);
	 *   redis.exec(async (client) => client.get("key"))
	 *     .assert((val) => val !== null);
	 * });
	 * ```
	 */
	use<TStepBuilder>(component: Component<TStepBuilder>): TStepBuilder {
		// Auto-register component if not already registered (with testCase scope)
		if (!this.components.has(component.name)) {
			if (this.componentRegistry) {
				this.componentRegistry.set(component.name, component);
			}
			this.components.set(component.name, component);
			// Queue for starting with testCase scope (auto-cleanup)
			this.pendingComponents.push({
				component,
				options: { scope: "testCase" },
			});
		}

		// Return the step builder from the component
		return component.createStepBuilder(this);
	}
}
