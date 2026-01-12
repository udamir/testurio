/**
 * Base Component
 *
 * Base class for all test components.
 * Includes hook management (registration and execution) and lifecycle management.
 *
 * This class is message-agnostic - it works with any message type.
 * Protocol-specific components should extend ServiceComponent instead.
 * MQ components should extend MQComponent instead.
 */

import type { ITestCaseBuilder } from "../../execution";
import type { Hook } from "./base.types";
import { DropMessageError } from "./base.utils";

/**
 * Component state
 */
export type ComponentState = "created" | "starting" | "started" | "stopping" | "stopped" | "error";

/**
 * Base Component class
 *
 * Provides:
 * - Hook management (message-agnostic)
 * - Lifecycle management (start/stop)
 * - Error tracking
 *
 * Does NOT include protocol or adapter - those belong in subclasses:
 * - ServiceComponent<P> - for protocol-based components (HTTP, gRPC, WS, TCP)
 * - MQComponent - for adapter-based components (Kafka, RabbitMQ, Redis)
 *
 * @typeParam TStepBuilder - Step builder type returned by createStepBuilder
 */
export abstract class BaseComponent<TStepBuilder = unknown> {
	protected state: ComponentState = "created";
	protected error?: Error;
	protected hooks: Hook[] = [];
	protected unhandledErrors: Error[] = [];

	/**
	 * Current test case context for hook isolation.
	 * Set by TestCaseBuilder.use() before hooks are registered.
	 */
	protected currentTestCaseId?: string;

	/** Component name */
	readonly name: string;

	constructor(name: string) {
		this.name = name;
	}

	// =========================================================================
	// Component State
	// =========================================================================

	getState(): ComponentState {
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
	// Hook Management (Message-Agnostic)
	// =========================================================================

	/**
	 * Set current test case context for hook isolation.
	 * Called by TestCaseBuilder.use() to tag subsequent hooks with testCaseId.
	 */
	setTestCaseContext(testCaseId?: string): void {
		this.currentTestCaseId = testCaseId;
	}

	/**
	 * Register a hook for message interception.
	 * The hook's `isMatch` function determines which messages it handles.
	 * Automatically injects testCaseId from current context if not already set.
	 */
	registerHook<TMessage>(hook: Hook<TMessage>): void {
		const hookWithContext = {
			...hook,
			testCaseId: hook.testCaseId ?? this.currentTestCaseId,
		};
		this.hooks.push(hookWithContext as Hook);
	}

	/**
	 * Find a hook that matches the given message.
	 * Uses the hook's `isMatch` function for matching.
	 * Errors thrown by `isMatch` are treated as no match.
	 */
	findMatchingHook<TMessage>(message: TMessage): Hook<TMessage> | null {
		for (const hook of this.hooks) {
			try {
				if (hook.isMatch(message)) {
					return hook as Hook<TMessage>;
				}
			} catch {
				// Matcher error = no match
			}
		}
		return null;
	}

	/**
	 * Execute a hook's handlers on a message.
	 * Returns the processed message, or null if dropped.
	 */
	async executeHook<TMessage>(hook: Hook<TMessage>, message: TMessage): Promise<TMessage | null> {
		try {
			let current = message;
			for (const handler of hook.handlers) {
				current = (await handler.execute(current)) as TMessage;
			}
			return current;
		} catch (error) {
			// DropMessageError is expected - return null to indicate message was dropped
			if (error instanceof DropMessageError) {
				return null;
			}
			// Track and re-throw other errors (e.g., assertion failures)
			if (error instanceof Error) {
				this.trackUnhandledError(error);
			}
			throw error;
		}
	}

	/**
	 * Find and execute a matching hook for the given message.
	 * Returns the processed message, or the original if no hook matches.
	 */
	async executeMatchingHook<TMessage>(message: TMessage): Promise<TMessage | null> {
		const hook = this.findMatchingHook(message);
		return hook ? this.executeHook(hook, message) : message;
	}

	/**
	 * Clear test case hooks.
	 * If testCaseId provided, only clears hooks for that test case.
	 * Otherwise clears all non-persistent hooks (backwards compatible).
	 */
	clearTestCaseHooks(testCaseId?: string): void {
		if (testCaseId) {
			// Only clear hooks belonging to this specific test case
			this.hooks = this.hooks.filter((hook) => hook.persistent || hook.testCaseId !== testCaseId);
		} else {
			// Backwards compatible - clear all non-persistent hooks
			this.hooks = this.hooks.filter((hook) => hook.persistent);
		}
	}

	clearHooks(): void {
		this.hooks = [];
	}

	getAllHooks(): Hook[] {
		return [...this.hooks];
	}

	getHookById(id: string): Hook | undefined {
		return this.hooks.find((hook) => hook.id === id);
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
