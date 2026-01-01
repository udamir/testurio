/**
 * Base Component Types
 *
 * Types for hook system, handlers, and builders.
 */

import type { Message } from "../../protocols/base";
import type { TestPhase } from "../../execution/execution.types";

// =============================================================================
// Payload Matchers
// =============================================================================

/**
 * Match by trace ID (for correlating request/response)
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
 * Payload matcher - matches by traceId or custom function
 */
export type PayloadMatcher =
	| TraceIdPayloadMatcher
	| FunctionPayloadMatcher;

// =============================================================================
// Hook Types
// =============================================================================

/**
 * Hook - represents a registered message interceptor
 *
 * Matching is two-level:
 * 1. Message type(s) - protocol level, filters which messages trigger this hook
 * 2. Payload matcher - hook level, filters by traceId or custom function
 */
export interface Hook<T = unknown> {
	id: string;
	componentName: string;
	phase: TestPhase;
	options?: Record<string, unknown>;
	messageTypes: string | string[];
	matcher?: PayloadMatcher;
	handlers: HookHandler<T>[];
	persistent: boolean;
	timeout?: number;
	metadata?: Record<string, unknown>;
}

/**
 * Hook handler - single handler in the chain
 */
export interface HookHandler<T, R = T> {
	type: HookHandlerType;
	execute: (message: Message<T>) => Promise<Message<R>>;
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
 * Sync hook builder for sync protocols
 * @template TPayload - Request payload type (what comes in)
 * @template TResponse - Response type (what mockResponse should return)
 */
export interface SyncHookBuilder<TPayload = unknown, TResponse = unknown>
	extends BaseHookBuilder<TPayload> {
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this;
	mockResponse(
		handler: (
			payload: TPayload,
		) => TResponse | Promise<TResponse>,
	): this;
}

// =============================================================================
// Hook Execution Types
// =============================================================================

/**
 * Hook match result
 */
export interface HookMatchResult<T> {
	hook: Hook<T>;
	message: Message<T>;
	score: number;
}

/**
 * Hook execution context
 */
export interface HookExecutionContext<T> {
	hook: Hook<T>;
	originalMessage: Message<T>;
	currentMessage: Message<T>;
	handlerIndex: number;
	totalHandlers: number;
	abortSignal?: AbortSignal;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult<T> {
	hook: Hook<T>;
	success: boolean;
	originalMessage: Message<T>;
	transformedMessage: Message<T> | null;
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
