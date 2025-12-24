/**
 * Test Case Builder
 *
 * Main builder for creating test cases with fluent API.
 */

import { AsyncClient, AsyncServer, Client, Server } from "../components";
import type { Component } from "../components/component";
import type { CreateComponentOptions, TestPhase, TestStep } from "../types";
import { AsyncClientStepBuilder } from "./async-client-step-builder";
import { AsyncServerStepBuilder } from "./async-server-step-builder";
import { SyncClientStepBuilder } from "./sync-client-step-builder";
import { SyncServerStepBuilder } from "./sync-server-step-builder";

/**
 * Test Case Builder
 *
 * Provides fluent API for building test cases.
 */
/**
 * Pending component to be started
 */
export interface PendingComponent {
	component: Component;
	options: CreateComponentOptions;
}

export class TestCaseBuilder<
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	private steps: TestStep[] = [];
	private currentPhase: TestPhase = "test";
	private pendingComponents: PendingComponent[] = [];
	private componentRegistry?: Map<string, Component>;

	constructor(
		private components: Map<string, Component>,
		public context: TContext,
	) {}

	/**
	 * Set component registry for dynamic component registration
	 */
	setComponentRegistry(registry: Map<string, Component>): void {
		this.componentRegistry = registry;
	}

	/**
	 * Add a component dynamically and return its step builder
	 *
	 * @param component - Component instance to add
	 * @param options - Creation options (scope: "scenario" | "testCase")
	 * @returns The component for chaining
	 */
	addComponent<T extends Component>(
		component: T,
		options: CreateComponentOptions = {},
	): T {
		if (!this.componentRegistry) {
			throw new Error(
				"Component registry not available - addComponent can only be used in init() or testCase()",
			);
		}

		if (this.componentRegistry.has(component.name)) {
			throw new Error(`Component ${component.name} already exists`);
		}

		// Register component immediately so it's available for subsequent builder calls
		this.componentRegistry.set(component.name, component);
		this.components.set(component.name, component);

		// Queue for starting later
		this.pendingComponents.push({ component, options });

		return component;
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
	 * Get sync client step builder (for HTTP/REST)
	 * Default for most common use case
	 */
	client(name: string): SyncClientStepBuilder<TContext> {
		const client = this.getSyncClient(name);
		return new SyncClientStepBuilder<TContext>(client, this);
	}

	/**
	 * Get sync server step builder (for HTTP/REST)
	 * Works for both mock mode and proxy mode
	 */
	server(name: string): SyncServerStepBuilder {
		const server = this.getSyncServer(name);
		return new SyncServerStepBuilder(server);
	}

	/**
	 * Get async client step builder (for TCP/WebSocket/gRPC stream)
	 * With optional message type mapping for type safety
	 */
	asyncClient<M extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
	): AsyncClientStepBuilder<M, TContext> {
		const client = this.getAsyncClient(name);
		return new AsyncClientStepBuilder<M, TContext>(client, this);
	}

	/**
	 * Get async server step builder (for TCP/WebSocket/gRPC stream)
	 * Works for both mock mode and proxy mode
	 */
	asyncServer<M extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
	): AsyncServerStepBuilder<M, TContext> {
		const server = this.getAsyncServer(name);
		return new AsyncServerStepBuilder<M, TContext>(server, this);
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

	/**
	 * Get sync client component
	 */
	private getSyncClient(name: string): Client {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof Client)) {
			throw new Error(`Component ${name} is not a sync Client`);
		}
		return component;
	}

	/**
	 * Get sync server component
	 */
	private getSyncServer(name: string): Server {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof Server)) {
			throw new Error(`Component ${name} is not a sync Server`);
		}
		return component;
	}

	/**
	 * Get async client component (AsyncClient only)
	 */
	private getAsyncClient(name: string): AsyncClient {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof AsyncClient)) {
			throw new Error(`Component ${name} is not an AsyncClient. Use asyncClient() only with AsyncClient components.`);
		}
		return component;
	}

	/**
	 * Get async server component (AsyncServer only)
	 */
	private getAsyncServer(name: string): AsyncServer {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof AsyncServer)) {
			throw new Error(`Component ${name} is not an AsyncServer. Use asyncServer() only with AsyncServer components.`);
		}
		return component;
	}

	/**
	 * Get generic component step builder.
	 * Use for custom/non-builtin components or when you need the raw step builder.
	 */
	component<T>(name: string): T {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		return component.createStepBuilder(this) as T;
	}
}
