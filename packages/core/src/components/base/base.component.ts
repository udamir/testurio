/**
 * Base Component
 *
 * Base class for all test components (Client, Mock, Proxy).
 */

import type { IBaseProtocol } from "../../protocols/base";
import type { ITestCaseBuilder } from "../../execution";
import { HookRegistry } from "./base.hooks";
import type { Hook } from "./base.types";

/**
 * Component state
 */
export type ComponentState =
	| "created"
	| "starting"
	| "started"
	| "stopping"
	| "stopped"
	| "error";

/**
 * Component lifecycle events
 */
export interface ComponentLifecycleEvents {
	onStart?: () => Promise<void> | void;
	onStop?: () => Promise<void> | void;
	onError?: (error: Error) => Promise<void> | void;
}

/**
 * Base Component class
 *
 * Each component owns its own HookRegistry for isolation.
 *
 * @typeParam P - Protocol type
 * @typeParam TStepBuilder - Step builder type returned by createStepBuilder
 */
export abstract class BaseComponent<
	P extends IBaseProtocol = IBaseProtocol,
	TStepBuilder = unknown,
> {
	protected state: ComponentState = "created";
	protected error?: Error;
	protected hookRegistry: HookRegistry;
	/** Unhandled errors from async handlers */
	protected unhandledErrors: Error[] = [];

	/** Component name */
	readonly name: string;
	/** Protocol instance */
	readonly protocol: P;

	constructor(name: string, protocol: P) {
		this.name = name;
		this.protocol = protocol;
		this.hookRegistry = new HookRegistry();
	}

	/**
	 * Get component state
	 */
	getState(): ComponentState {
		return this.state;
	}

	/**
	 * Check if component is started
	 */
	isStarted(): boolean {
		return this.state === "started";
	}

	/**
	 * Check if component is stopped
	 */
	isStopped(): boolean {
		return this.state === "stopped";
	}

	/**
	 * Check if component has error
	 */
	hasError(): boolean {
		return this.state === "error";
	}

	/**
	 * Get component error
	 */
	getError(): Error | undefined {
		return this.error;
	}

	/**
	 * Get unhandled errors from async handlers
	 */
	getUnhandledErrors(): Error[] {
		return [...this.unhandledErrors];
	}

	/**
	 * Check if there are unhandled errors
	 */
	hasUnhandledErrors(): boolean {
		return this.unhandledErrors.length > 0;
	}

	/**
	 * Clear unhandled errors
	 */
	clearUnhandledErrors(): void {
		this.unhandledErrors = [];
	}

	/**
	 * Track an unhandled error from async handler
	 * Called by subclasses when async handlers throw
	 */
	protected trackUnhandledError(error: Error): void {
		this.unhandledErrors.push(error);
	}

	/**
	 * Register a hook
	 */
	registerHook(hook: Hook): void {
		this.hookRegistry.registerHook(hook);
	}

	/**
	 * Start the component
	 */
	async start(): Promise<void> {
		if (this.state !== "created" && this.state !== "stopped") {
			throw new Error(
				`Cannot start component ${this.name} in state ${this.state}`,
			);
		}

		this.state = "starting";

		try {
			await this.doStart();
			this.state = "started";
		} catch (error) {
			this.state = "error";
			this.error = error as Error;
			throw error;
		}
	}

	/**
	 * Stop the component
	 */
	async stop(): Promise<void> {
		if (this.state === "stopped") {
			return;
		}

		if (this.state !== "started" && this.state !== "error") {
			throw new Error(
				`Cannot stop component ${this.name} in state ${this.state}`,
			);
		}

		this.state = "stopping";

		try {
			await this.doStop();
			this.state = "stopped";
		} catch (error) {
			this.state = "error";
			this.error = error as Error;
			throw error;
		}
	}

	/**
	 * Subclass-specific start logic
	 */
	protected abstract doStart(): Promise<void>;

	/**
	 * Subclass-specific stop logic
	 */
	protected abstract doStop(): Promise<void>;

	/**
	 * Create a step builder for this component.
	 * Used by test.use(component) for type-safe component access.
	 *
	 * Built-in components (Client, Server) implement this
	 * to return their specific step builders.
	 *
	 * Custom components can override this to provide their own step builders.
	 *
	 * @param builder - The test case builder instance
	 * @returns A step builder appropriate for this component type
	 */
	abstract createStepBuilder<TContext extends Record<string, unknown>>(
		builder: ITestCaseBuilder<TContext>,
	): TStepBuilder;
}
