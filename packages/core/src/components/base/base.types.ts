/**
 * Base Component Types
 *
 * Types for hook system, handlers, and builders.
 */

import type { ExtractMockEventResponse, Message, SyncResponse } from "../../protocols/base";
import type { TestPhase } from "../../execution/execution.types";

// =============================================================================
// Payload Matchers
// =============================================================================

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
 * Payload matcher - matches by traceId, requestId, or custom function
 */
export type PayloadMatcher =
	| TraceIdPayloadMatcher
	| RequestIdPayloadMatcher
	| FunctionPayloadMatcher;

// =============================================================================
// Hook Types
// =============================================================================

/**
 * Hook - represents a registered message interceptor
 *
 * Matching is two-level:
 * 1. Message type(s) - adapter level, filters which messages trigger this hook
 * 2. Payload matcher - hook level, filters by traceId or custom function
 */
export interface Hook {
	id: string;
	componentName: string;
	phase: TestPhase;
	options?: Record<string, unknown>;
	messageTypes: string | string[];
	matcher?: PayloadMatcher;
	handlers: HookHandler[];
	persistent: boolean;
	timeout?: number;
	metadata?: Record<string, unknown>;
}

/**
 * Hook handler - single handler in the chain
 */
export interface HookHandler {
	type: HookHandlerType;
	execute: (message: Message) => Promise<Message>;
	metadata?: Record<string, unknown>;
}

/**
 * Hook handler types
 */
export type HookHandlerType =
	| "assert"
	| "proxy"
	| "mock"
	| "delay"
	| "drop"
	| "custom";

// =============================================================================
// Hook Errors
// =============================================================================

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

// =============================================================================
// Hook Builder Interfaces
// =============================================================================

/**
 * Base hook builder interface (for both async and sync)
 */
export interface BaseHookBuilder<TPayload> {
	readonly hookId: string;
	assert(handler: (payload: TPayload) => boolean | Promise<boolean>): this;
	delay(ms: number | (() => number)): this;
	drop(): this;
}

/**
 * Async hook builder for async protocols
 */
export interface AsyncHookBuilder<
	TPayload,
	M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseHookBuilder<TPayload> {
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;
	mockEvent<K extends keyof M & string>(
		responseType: K,
		handler: (
			payload: TPayload,
		) => ExtractMockEventResponse<M, K> | Promise<ExtractMockEventResponse<M, K>>,
	): this;
}

/**
 * Sync hook builder for sync protocols
 */
export interface SyncHookBuilder<TPayload = unknown>
	extends BaseHookBuilder<TPayload> {
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;
	mockResponse<TResponse = unknown>(
		handler: (
			payload: TPayload,
		) => SyncResponse<TResponse> | Promise<SyncResponse<TResponse>>,
	): this;
}

// =============================================================================
// Hook Execution Types
// =============================================================================

/**
 * Hook match result
 */
export interface HookMatchResult {
	hook: Hook;
	message: Message;
	score: number;
}

/**
 * Hook execution context
 */
export interface HookExecutionContext {
	hook: Hook;
	originalMessage: Message;
	currentMessage: Message;
	handlerIndex: number;
	totalHandlers: number;
	abortSignal?: AbortSignal;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
	hook: Hook;
	success: boolean;
	originalMessage: Message;
	transformedMessage: Message | null;
	duration: number;
	error?: Error;
	metadata?: Record<string, unknown>;
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
