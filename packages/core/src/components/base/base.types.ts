/**
 * Base Component Types
 *
 * Types for hook system, handlers, and builders.
 *
 * The hook system is message-agnostic - it works with any message type
 * (Message<T> for protocols, QueueMessage for MQ, etc.)
 */

import type { TestPhase } from "../../execution";

// =============================================================================
// Hook Types (Message-Agnostic)
// =============================================================================

/**
 * Hook - represents a registered message interceptor
 *
 * The hook is generic over TMessage (the full message type, not just payload).
 * Matching is done via the `isMatch` function, which is defined at hook creation time.
 * This allows each component to define its own matching logic.
 *
 * @template TMessage - The message type this hook handles (e.g., Message<T>, QueueMessage)
 *
 * @example Protocol hook (Message<T>)
 * ```typescript
 * const hook: Hook<Message> = {
 *   id: "hook-1",
 *   isMatch: (msg) => msg.type === "orderRequest" && msg.traceId === "123",
 *   handlers: [...],
 * };
 * ```
 *
 * @example MQ hook (QueueMessage)
 * ```typescript
 * const hook: Hook<QueueMessage> = {
 *   id: "hook-2",
 *   isMatch: (msg) => msg.topic === "orders",
 *   handlers: [...],
 * };
 * ```
 */
export interface Hook<TMessage = unknown> {
	id: string;
	componentName: string;
	phase: TestPhase;

	/**
	 * Test case ID that owns this hook.
	 * Used to isolate hooks between parallel test cases.
	 * Hooks without testCaseId (e.g., init phase) are preserved across all test cases.
	 */
	testCaseId?: string;

	/**
	 * Matching function defined at hook creation time.
	 * Returns true if this hook should handle the given message.
	 */
	isMatch: (message: TMessage) => boolean;

	/**
	 * Handlers that process the message. Each handler receives TMessage
	 * and can return any message type (for transforms like mockResponse).
	 */
	handlers: HookHandler<TMessage, unknown>[];
	persistent: boolean;
	timeout?: number;
	metadata?: Record<string, unknown>;
}

/**
 * Hook handler - single handler in the chain
 *
 * @template TMessage - Input message type
 * @template TResult - Output message type (defaults to same as input)
 */
export interface HookHandler<TMessage, TResult = TMessage> {
	type: HookHandlerType;
	execute: (message: TMessage) => Promise<TResult>;
	metadata?: Record<string, unknown>;
}

/**
 * Hook handler types
 */
export type HookHandlerType = "assert" | "transform" | "proxy" | "mock" | "delay" | "drop" | "custom";

/**
 * Match by trace ID (for correlating request/response)
 */
export interface TraceIdMatcher {
	type: "traceId";
	value: string;
}

/**
 * Match by custom function
 */
export interface FunctionMatcher<T = unknown> {
	type: "function";
	fn: (payload: T) => boolean;
}

/**
 * Payload matcher - matches by traceId or custom function
 */
export type PayloadMatcher<T = unknown> = TraceIdMatcher | FunctionMatcher<T>;


// =============================================================================
// Hook Builder Interfaces
// =============================================================================

/**
 * Base hook builder interface (for both async and sync)
 */
export interface BaseHookBuilder<TPayload> {
	readonly hookId: string;
	/** Assert without description */
	assert(handler: (payload: TPayload) => boolean | Promise<boolean>): this;
	/** Assert with description for better error messages */
	assert(description: string, handler: (payload: TPayload) => boolean | Promise<boolean>): this;
	/** Delay without description */
	delay(ms: number | (() => number)): this;
	/** Delay with description */
	delay(description: string, ms: number | (() => number)): this;
	drop(): this;
}

/**
 * Sync hook builder for sync protocols
 * @template TPayload - Request payload type (what comes in)
 * @template TResponse - Response type (what mockResponse should return)
 */
export interface SyncHookBuilder<TPayload = unknown, TResponse = unknown> extends BaseHookBuilder<TPayload> {
	/** Proxy without description */
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;
	/** Proxy with description */
	proxy(description: string, handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;
	/** Mock response without description */
	mockResponse(handler: (payload: TPayload) => TResponse | Promise<TResponse>): this;
	/** Mock response with description */
	mockResponse(description: string, handler: (payload: TPayload) => TResponse | Promise<TResponse>): this;
}

// =============================================================================
// Component Interface
// =============================================================================

/**
 * Common component interface shared by all components
 * (BaseComponent, DataSource, and any future component types)
 *
 * This interface allows TestScenario and TestCaseBuilder to work with
 * any component type uniformly.
 */
export interface Component<TStepBuilder = unknown> {
	/** Component name (must be unique within scenario) */
	readonly name: string;

	/** Get current component state */
	getState(): string;

	/** Check if component is started */
	isStarted(): boolean;

	/** Check if component is stopped */
	isStopped(): boolean;

	/** Start the component */
	start(): Promise<void>;

	/** Stop the component */
	stop(): Promise<void>;

	/** Create a step builder for use in testCase */
	createStepBuilder(builder: unknown): TStepBuilder;

	/**
	 * Set test case context for hook isolation.
	 * Called by TestCaseBuilder.use() to tag subsequent hooks with testCaseId.
	 */
	setTestCaseContext(testCaseId?: string): void;

	/**
	 * Clear test case hooks.
	 * If testCaseId provided, only clears hooks for that test case.
	 * Otherwise clears all non-persistent hooks.
	 */
	clearTestCaseHooks(testCaseId?: string): void;

	/** Clear all hooks (for components with hooks) */
	clearHooks(): void;

	/** Get unhandled errors */
	getUnhandledErrors(): Error[];

	/** Clear unhandled errors */
	clearUnhandledErrors(): void;
}

// =============================================================================
// Component Options
// =============================================================================

/**
 * Options for dynamic component creation
 */
export interface CreateComponentOptions {
	scope?: "scenario" | "testCase";
}
