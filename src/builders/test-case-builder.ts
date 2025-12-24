/**
 * Test Case Builder
 *
 * Main builder for creating test cases with fluent API.
 */

import { Client, MockComponent } from "../components";
import { ProxyComponent, type ProxyComponentConfig } from "../components/proxy";
import type { Component } from "../components/component";
import type { MockComponentConfig } from "../components/mock";
import type { ClientComponentConfig } from "../components/client";
import type { CreateComponentOptions, TestPhase, TestStep } from "../types";
import {
	MockConfig,
	ClientConfig,
	ProxyConfig,
	type ComponentConfig,
} from "../config/components";
import { AsyncClientStepBuilder } from "./async-client-step-builder";
import { AsyncMockStepBuilder } from "./async-mock-step-builder";
import { AsyncProxyStepBuilder } from "./async-proxy-step-builder";
import { SyncClientStepBuilder } from "./sync-client-step-builder";
import { SyncMockStepBuilder } from "./sync-mock-step-builder";
import { SyncProxyStepBuilder } from "./sync-proxy-step-builder";

/**
 * Test Case Builder
 *
 * Provides fluent API for building test cases.
 */
/**
 * Pending component to be created
 */
export interface PendingComponent {
	config: ComponentConfig;
	options: CreateComponentOptions;
}

/**
 * Component factory function type
 */
export type ComponentFactory = (config: ComponentConfig) => Component;

export class TestCaseBuilder<
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	private steps: TestStep[] = [];
	private currentPhase: TestPhase = "test";
	private pendingComponents: PendingComponent[] = [];
	private componentFactory?: ComponentFactory;

	constructor(
		private components: Map<string, Component>,
		public context: TContext,
	) {}

	/**
	 * Set component factory for dynamic component creation
	 */
	setComponentFactory(factory: ComponentFactory): void {
		this.componentFactory = factory;
	}

	/**
	 * Create a mock component dynamically and return its step builder
	 * 
	 * @param mockOptions - Mock component options (name, listenAddress, protocol, etc.)
	 * @param createOptions - Creation options (scope: "scenario" | "testCase")
	 * @returns Mock step builder for the created component
	 */
	createMock(mockOptions: MockComponentConfig, createOptions: CreateComponentOptions = {}): SyncMockStepBuilder {
		const config = new MockConfig(mockOptions);
		this.createComponentInternal(config, createOptions);
		return this.mock(config.name);
	}

	/**
	 * Create a client component dynamically and return its step builder
	 * 
	 * @param clientOptions - Client component options (name, targetAddress, protocol, etc.)
	 * @param createOptions - Creation options (scope: "scenario" | "testCase")
	 * @returns Client step builder for the created component
	 */
	createClient(clientOptions: ClientComponentConfig, createOptions: CreateComponentOptions = {}): SyncClientStepBuilder<TContext> {
		const config = new ClientConfig(clientOptions);
		this.createComponentInternal(config, createOptions);
		return this.client(config.name);
	}

	/**
	 * Create a proxy component dynamically and return its step builder
	 * 
	 * @param proxyOptions - Proxy component options (name, listenAddress, targetAddress, protocol, etc.)
	 * @param createOptions - Creation options (scope: "scenario" | "testCase")
	 * @returns Proxy step builder for the created component
	 */
	createProxy(proxyOptions: ProxyComponentConfig, createOptions: CreateComponentOptions = {}): SyncProxyStepBuilder {
		const config = new ProxyConfig(proxyOptions);
		this.createComponentInternal(config, createOptions);
		return this.proxy(config.name);
	}

	/**
	 * Internal method to create a component
	 */
	private createComponentInternal(config: ComponentConfig, options: CreateComponentOptions): void {
		if (!this.componentFactory) {
			throw new Error("Component factory not available - createMock/createClient/createProxy can only be used in init() or testCase()");
		}
		// Create component immediately so it's available for subsequent builder calls
		this.componentFactory(config);
		// Queue for starting later
		this.pendingComponents.push({ config, options });
	}

	/**
	 * Get pending components to be created
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
		const client = this.getClient(name);
		return new SyncClientStepBuilder<TContext>(client, this);
	}

	/**
	 * Get sync mock step builder (for HTTP/REST)
	 */
	mock(name: string): SyncMockStepBuilder {
		const mock = this.getMock(name);
		return new SyncMockStepBuilder(mock);
	}

	/**
	 * Get sync proxy step builder (for HTTP/REST)
	 */
	proxy(name: string): SyncProxyStepBuilder {
		const proxy = this.getProxy(name);
		return new SyncProxyStepBuilder(proxy);
	}

	/**
	 * Get async client step builder (for TCP/WebSocket/gRPC stream)
	 * With optional message type mapping for type safety
	 */
	asyncClient<M extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
	): AsyncClientStepBuilder<M, TContext> {
		const client = this.getClient(name);
		return new AsyncClientStepBuilder<M, TContext>(client, this);
	}

	/**
	 * Get async mock step builder (for TCP/WebSocket/gRPC stream)
	 */
	asyncMock<M extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
	): AsyncMockStepBuilder<M, TContext> {
		const mock = this.getMock(name);
		return new AsyncMockStepBuilder<M, TContext>(mock, this);
	}

	/**
	 * Get async proxy step builder (for TCP/WebSocket/gRPC stream)
	 */
	asyncProxy<M extends Record<string, unknown> = Record<string, unknown>>(
		name: string,
	): AsyncProxyStepBuilder<M, TContext> {
		const proxy = this.getProxy(name);
		return new AsyncProxyStepBuilder<M, TContext>(proxy, this);
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
	 * Get client component
	 */
	private getClient(name: string): Client {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof Client)) {
			throw new Error(`Component ${name} is not a client`);
		}
		return component;
	}

	/**
	 * Get mock component
	 */
	private getMock(name: string): MockComponent {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof MockComponent)) {
			throw new Error(`Component ${name} is not a mock`);
		}
		return component;
	}

	/**
	 * Get proxy component
	 */
	private getProxy(name: string): ProxyComponent {
		const component = this.components.get(name);
		if (!component) {
			throw new Error(`Component not found: ${name}`);
		}
		if (!(component instanceof ProxyComponent)) {
			throw new Error(`Component ${name} is not a proxy`);
		}
		return component;
	}
}
