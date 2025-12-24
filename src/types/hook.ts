/**
 * Hook Types
 *
 * Types for hook system, handlers, and builders.
 */

import type { HttpResponse, Message } from "./message";
import type { TestPhase } from "./step";

/**
 * Hook - represents a registered message interceptor
 *
 * Matching is two-level:
 * 1. Message type(s) - adapter level, filters which messages trigger this hook
 * 2. Payload matcher - hook level, filters by traceId or custom function
 */
export interface Hook {
	id: string;                          // Hook unique ID
	componentName: string;               // Component name this hook is registered on
	phase: TestPhase;                    // Test phase this hook was registered in
	messageTypes: string | string[];     // Message type(s) this hook handles (adapter-level matching)
	matcher?: PayloadMatcher;            // Payload matcher (optional, for traceId or custom function matching)
	handlers: HookHandler[];             // Handler chain
	persistent: boolean;                 // Whether hook persists across test cases
	timeout?: number;                    // Hook timeout in milliseconds
	metadata?: Record<string, unknown>;  // Hook metadata
}

/**
 * Payload matcher - matches by traceId, requestId, custom function, or HTTP endpoint
 */
export type PayloadMatcher =
	| TraceIdPayloadMatcher
	| RequestIdPayloadMatcher
	| FunctionPayloadMatcher
	| HttpEndpointPayloadMatcher;

/**
 * Match by request ID (for correlating request/response)
 */
export interface RequestIdPayloadMatcher {
	type: "requestId";
	value: string;
}

/**
 * Match by trace ID in payload
 */
export interface TraceIdPayloadMatcher {
	type: "traceId";
	value: string;
}

/**
 * Match by custom function
 */
export interface FunctionPayloadMatcher {
	type: "function";
	fn: (payload: unknown) => boolean;
}

/**
 * Match by HTTP endpoint (method + path)
 * Used for sync HTTP protocols where message type is the endpoint
 */
export interface HttpEndpointPayloadMatcher {
	type: "httpEndpoint";
	method: string;
	path: string;
}

/**
 * Hook handler - single handler in the chain
 */
export interface HookHandler {
	type: HookHandlerType;                             // Handler type
	execute: (message: Message) => Promise<Message>;   // Handler execution function
	metadata?: Record<string, unknown>;                // Handler metadata
}

/**
 * Hook handler types
 */
export type HookHandlerType =
	| "assert"   // Assertion handler
	| "proxy"    // Proxy/forward handler
	| "mock"     // Mock/response handler
	| "delay"    // Delay handler
	| "drop"     // Drop message handler
	| "custom";  // Custom handler

/**
 * Special error to signal message should be dropped
 */
export class DropMessageError extends Error {
	constructor() {
		super("Message dropped by hook");
		this.name = "DropMessageError";
	}
}

/**
 * Hook execution error
 */
export class HookError extends Error {
	constructor(
		message: string,
		public readonly hookId: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = "HookError";
	}
}

/**
 * Timeout error
 */
export class TimeoutError extends Error {
	constructor(
		message: string,
		public readonly timeout: number,
	) {
		super(message);
		this.name = "TimeoutError";
	}
}

/**
 * Base hook builder interface (for both async and sync)
 *
 * Hook is already registered when builder is created.
 * All handler methods add handlers directly to the registered hook.
 */
export interface BaseHookBuilder<TPayload> {
	readonly hookId: string;  // Hook ID

	/**
	 * Add assertion handler
	 * @param handler - Assertion function returning boolean
	 */
	assert(handler: (payload: TPayload) => boolean | Promise<boolean>): this;

	/**
	 * Add delay handler
	 * @param ms - Delay in milliseconds or function returning delay
	 */
	delay(ms: number | (() => number)): this;

	/**
	 * Drop the message (stop propagation)
	 */
	drop(): this;
}

/**
 * Async hook builder for async protocols
 */
export interface AsyncHookBuilder<TPayload> extends BaseHookBuilder<TPayload> {
	/**
	 * Add proxy handler (forward message, optionally transform)
	 * @param handler - Optional transformation function
	 */
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;

	/**
	 * Add response handler (for mock servers)
	 * Creates a separate response message to be sent back to the client.
	 * @param responseType - The message type for the response
	 * @param handler - Response generation function
	 */
	mockEvent<TResponse = unknown>(
		responseType: string,
		handler: (payload: TPayload) => TResponse | Promise<TResponse>,
	): this;
}

/**
 * Sync hook builder for sync protocols
 */
export interface SyncHookBuilder<TPayload = unknown>
	extends BaseHookBuilder<TPayload> {
	/**
	 * Add proxy handler (forward message, optionally transform)
	 * @param handler - Optional transformation function
	 */
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;

	/**
	 * Add mock handler (return custom response)
	 * @param handler - Response generation function
	 */
	mockResponse<TResponse = unknown>(
		handler: (
			payload: TPayload,
		) => HttpResponse<TResponse> | Promise<HttpResponse<TResponse>>,
	): this;
}

/**
 * Hook match result
 */
export interface HookMatchResult {
	hook: Hook;      // Matched hook
	message: Message;  // Matched message
	score: number;   // Match score (for prioritization)
}

/**
 * Hook execution context
 */
export interface HookExecutionContext {
	hook: Hook;                  // Hook being executed
	originalMessage: Message;    // Original message
	currentMessage: Message;     // Current message (after transformations)
	handlerIndex: number;        // Handler index in the chain
	totalHandlers: number;       // Total handlers in the chain
	abortSignal?: AbortSignal;   // Abort signal for cancellation
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
	hook: Hook;                             // Hook that was executed
	success: boolean;                       // Whether execution succeeded
	originalMessage: Message;               // Original message
	transformedMessage: Message | null;     // Transformed message (or null if dropped)
	duration: number;                       // Execution duration in milliseconds
	error?: Error;                          // Error if execution failed
	metadata?: Record<string, unknown>;     // Additional metadata
}
