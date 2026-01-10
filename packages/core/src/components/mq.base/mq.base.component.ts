/**
 * Base MQ Component
 *
 * Base class for message queue components (Publisher, Subscriber).
 * Provides lifecycle management and error tracking.
 *
 * Unlike other components, MQ components use adapters directly (not protocols).
 */

import type { ITestCaseBuilder } from "../../execution";

/**
 * Component state
 */
export type MQComponentState = "created" | "starting" | "started" | "stopping" | "stopped" | "error";

/**
 * Base class for MQ components
 *
 * @template TStepBuilder - Step builder type returned by createStepBuilder
 */
export abstract class BaseMQComponent<TStepBuilder = unknown> {
	protected state: MQComponentState = "created";
	protected error?: Error;
	protected unhandledErrors: Error[] = [];

	/** Component name */
	readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	// =========================================================================
	// Component State
	// =========================================================================

	getState(): MQComponentState {
		return this.state;
	}

	isStarted(): boolean {
		return this.state === "started";
	}

	isStopped(): boolean {
		return this.state === "stopped";
	}

	/**
	 * Track an unhandled error that occurred during async operations
	 */
	protected trackUnhandledError(error: Error): void {
		this.unhandledErrors.push(error);
	}

	/**
	 * Get all tracked unhandled errors
	 */
	getUnhandledErrors(): Error[] {
		return [...this.unhandledErrors];
	}

	/**
	 * Clear tracked unhandled errors
	 */
	clearUnhandledErrors(): void {
		this.unhandledErrors = [];
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async start(): Promise<void> {
		if (this.state !== "created" && this.state !== "stopped") {
			throw new Error(`Cannot start component ${this.name} in state ${this.state}`);
		}

		this.state = "starting";

		try {
			await this.doStart();
			this.state = "started";
		} catch (error) {
			this.state = "error";
			this.error = error instanceof Error ? error : new Error(String(error));
			throw error;
		}
	}

	async stop(): Promise<void> {
		if (this.state === "stopped") {
			return;
		}

		if (this.state !== "started" && this.state !== "error") {
			throw new Error(`Cannot stop component ${this.name} in state ${this.state}`);
		}

		this.state = "stopping";

		try {
			await this.doStop();
			this.state = "stopped";
		} catch (error) {
			this.state = "error";
			this.error = error instanceof Error ? error : new Error(String(error));
			throw error;
		}
	}

	protected abstract doStart(): Promise<void>;
	protected abstract doStop(): Promise<void>;
	abstract createStepBuilder(builder: ITestCaseBuilder): TStepBuilder;
}
