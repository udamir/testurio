/**
 * Test Case Builder
 *
 * Main builder for creating test cases with fluent API.
 * This builder is agnostic to component types - it works with any Component
 * and relies on the component's createStepBuilder method for type inference.
 */

import type { BaseComponent } from "../components/base/base.component";
import type { CreateComponentOptions } from "../components/base/base.types";
import type { AnyProtocol } from "../protocols/base";
import type { TestPhase, TestStep } from "./execution.types";

/**
 * Test Case Builder
 *
 * Provides fluent API for building test cases.
 */
/**
 * Pending component to be started
 */
export interface PendingComponent {
	component: BaseComponent;
	options: CreateComponentOptions;
}

export class TestCaseBuilder<
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	private steps: TestStep[] = [];
	private currentPhase: TestPhase = "test";
	private pendingComponents: PendingComponent[] = [];
	private componentRegistry?: Map<string, BaseComponent>;

	constructor(
		private components: Map<string, BaseComponent>,
		public context: TContext,
	) {}

	/**
	 * Set component registry for dynamic component registration
	 */
	setComponentRegistry(registry: Map<string, BaseComponent>): void {
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

	get phase(): TestPhase {
		return this.currentPhase;
	}

	/**
	 * Get all registered steps
	 */
	getSteps(): TestStep[] {
		return [...this.steps];
	}

	/**
	 * Register a step
	 */
	registerStep(step: Omit<TestStep, "phase">): void {
		this.steps.push({
			...step,
			phase: this.currentPhase,
		});
	}

	/**
	 * Use a component and get its typed step builder.
	 *
	 * If the component is not already registered, it will be auto-registered
	 * with testCase scope (automatically cleaned up after the test case completes).
	 *
	 * Works with any Component type - built-in (Client, Server, AsyncClient, AsyncServer)
	 * or custom components that extend Component.
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
	 * ```
	 */
	use<A extends AnyProtocol, TStepBuilder>(component: BaseComponent<A, TStepBuilder>): TStepBuilder {
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

	/**
	 * Wait for a duration
	 */
	wait(ms: number): void {
		this.registerStep({
			type: "wait",
			description: `Wait ${ms}ms`,
			action: async () => {
				await new Promise((resolve) => setTimeout(resolve, ms));
			},
		});
	}

	/**
	 * Wait until a condition is met
	 */
	waitUntil(
		condition: () => boolean | Promise<boolean>,
		options?: { timeout?: number; interval?: number },
	): void {
		const timeout = options?.timeout || 5000;
		const interval = options?.interval || 100;

		this.registerStep({
			type: "waitUntil",
			description: "Wait until condition is met",
			timeout,
			action: async () => {
				const startTime = Date.now();

				while (Date.now() - startTime < timeout) {
					const result = await Promise.resolve(condition());
					if (result) {
						return;
					}
					await new Promise((resolve) => setTimeout(resolve, interval));
				}

				throw new Error(`Timeout waiting for condition after ${timeout}ms`);
			},
		});
	}
}
