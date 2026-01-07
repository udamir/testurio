/**
 * Base Component
 *
 * Base class for all test components (Client, Mock, Proxy).
 * Includes hook management (registration and execution).
 */

import type { ITestCaseBuilder } from "../../execution";
import type { IBaseProtocol, Message, MessageMatcher } from "../../protocols/base";
import type { Hook, PayloadMatcher } from "./base.types";

/**
 * Component state
 */
export type ComponentState = "created" | "starting" | "started" | "stopping" | "stopped" | "error";

/**
 * Base Component class
 *
 * @typeParam P - Protocol type
 * @typeParam TStepBuilder - Step builder type returned by createStepBuilder
 */
export abstract class BaseComponent<P extends IBaseProtocol = IBaseProtocol, TStepBuilder = unknown> {
	protected state: ComponentState = "created";
	protected error?: Error;
	protected hooks: Hook[] = [];
	protected unhandledErrors: Error[] = [];

	/** Component name */
	readonly name: string;
	/** Protocol instance */
	readonly protocol: P;

	constructor(name: string, protocol: P) {
		this.name = name;
		this.protocol = protocol;
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
	// Hook Management
	// =========================================================================

	registerHook<T>(hook: Hook<T>): void {
		this.hooks.push(hook as Hook);
	}

	findMatchingHook<T>(message: Message<T>): Hook<T> | null {
		for (const hook of this.hooks as Hook<T>[]) {
			if (this.matchHook(hook, message)) {
				return hook;
			}
		}
		return null;
	}

	async executeHook<T>(hook: Hook<T>, message: Message<T>): Promise<Message<T> | null> {
		try {
			let current = message;
			for (const handler of hook.handlers) {
				current = await handler.execute(current);
			}
			return current;
		} catch {
			return null;
		}
	}

	async executeMatchingHook<T>(message: Message<T>): Promise<Message<T> | null> {
		const hook = this.findMatchingHook(message);
		return hook ? this.executeHook(hook, message) : message;
	}

	private matchHook<T>(hook: Hook<T>, message: Message<T>): boolean {
		// Match message type
		const typeMatches =
			typeof hook.messageType === "function"
				? (hook.messageType as MessageMatcher<T>)(message.type, message.payload)
				: hook.messageType === message.type;

		if (!typeMatches) return false;
		if (!hook.payloadMatcher) return true;

		// Match payload
		const matcher = hook.payloadMatcher as PayloadMatcher;
		if (matcher.type === "traceId") {
			return message.traceId === matcher.value;
		}
		try {
			return matcher.fn(message.payload);
		} catch {
			return false;
		}
	}

	clearTestCaseHooks(): void {
		this.hooks = this.hooks.filter((hook) => hook.persistent);
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
