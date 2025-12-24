/**
 * Base Component
 *
 * Base class for all test components (Client, Mock, Proxy).
 */

import { HookRegistry } from "../hooks";
import type { AuthConfig, Message, TlsConfig } from "../types";

/**
 * Base component configuration
 */
export interface BaseComponentConfig {
	/** Component name (unique identifier) */
	name: string;
	/** TLS configuration */
	tls?: TlsConfig;
	/** Authentication configuration */
	auth?: AuthConfig;
	/** Auto-start component during scenario.init() */
	autoStart?: boolean;
	/** Auto-stop component during scenario.stop() */
	autoStop?: boolean;
	/** Component-specific metadata */
	metadata?: Record<string, unknown>;
}

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
 */
export abstract class Component<
	TConfig extends BaseComponentConfig = BaseComponentConfig,
> {
	protected state: ComponentState = "created";
	protected error?: Error;
	protected hookRegistry: HookRegistry;

	constructor(protected config: TConfig) {
		// Each component creates and owns its own HookRegistry
		this.hookRegistry = new HookRegistry();
	}

	/**
	 * Get component name
	 */
	get name(): string {
		return this.config.name;
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
	 * Get hook registry (for builders to access)
	 */
	getHookRegistry(): HookRegistry {
		return this.hookRegistry;
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
	 * Process incoming message through hook chain
	 */
	protected async processMessage(message: Message): Promise<Message | null> {
		return this.hookRegistry.executeHooks(message);
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
	 * Used by test.component<T>(name) for generic component access.
	 *
	 * Built-in components (Client, Server) implement this
	 * to return their specific step builders.
	 *
	 * Custom components can override this to provide their own step builders.
	 *
	 * @param builder - The test case builder instance
	 * @returns A step builder appropriate for this component type
	 */
	abstract createStepBuilder(builder: unknown): unknown;
}
