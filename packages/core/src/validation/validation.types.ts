/**
 * Validation Types
 *
 * Generic schema interface and type inference utilities for runtime validation.
 * No Zod dependency — any object with a `.parse()` method works.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */

// ─── Schema Interface ───

/**
 * Generic schema interface compatible with Zod, Valibot, ArkType, etc.
 * Any object with a `.parse()` method that throws on invalid input.
 */
export interface SchemaLike<TOutput = unknown> {
	parse(data: unknown): TOutput;
}

// ─── Schema Input Types (carry SchemaLike values) ───

/**
 * Schema input for sync protocols (HTTP, gRPC Unary).
 * Maps operation IDs to optional request/response schemas.
 */
export type SyncSchemaInput = Record<
	string,
	{
		request?: SchemaLike;
		response?: SchemaLike;
	}
>;

/**
 * Schema input for async protocols (WebSocket, TCP, gRPC Stream).
 * Maps message/event types to schemas.
 */
export type AsyncSchemaInput = {
	clientMessages?: Record<string, SchemaLike>;
	serverMessages?: Record<string, SchemaLike>;
};

/**
 * Schema input for MQ operations (Publisher, Subscriber).
 * Maps topic names to payload schemas.
 */
export type MQSchemaInput = Record<string, SchemaLike>;

// ─── Type Inference Utilities ───

/**
 * Infer async messages type from schema input.
 * Extracts TOutput from each SchemaLike<TOutput>.
 */
export type InferAsyncMessages<S extends AsyncSchemaInput> = {
	clientMessages: {
		[K in keyof S["clientMessages"]]: S["clientMessages"][K] extends SchemaLike<infer T> ? T : unknown;
	};
	serverMessages: {
		[K in keyof S["serverMessages"]]: S["serverMessages"][K] extends SchemaLike<infer T> ? T : unknown;
	};
};

/**
 * Infer sync service definition from schema input.
 * Extracts request/response types from each SchemaLike.
 */
export type InferSyncService<S extends SyncSchemaInput> = {
	[K in keyof S]: {
		request: S[K] extends { request: SchemaLike<infer R> } ? R : unknown;
		response: S[K] extends { response: SchemaLike<infer R> } ? R : unknown;
	};
};

/**
 * Infer MQ topics type from schema input.
 * Extracts payload types from each SchemaLike.
 */
export type InferMQTopics<S extends MQSchemaInput> = {
	[K in keyof S]: S[K] extends SchemaLike<infer T> ? T : unknown;
};

// ─── Default Types for Loose Mode ───

/**
 * Default async messages type with index signatures for loose mode.
 * Used when no generic and no schema is provided.
 */
export type DefaultAsyncType = {
	clientMessages: Record<string, unknown>;
	serverMessages: Record<string, unknown>;
};

/**
 * Default sync operations type with index signature for loose mode.
 * Used when no generic and no schema is provided.
 */
export type DefaultSyncType = Record<string, { request: unknown; response: unknown }>;

// ─── Protocol Type Resolution ───

/**
 * Resolve async protocol type from generic parameter.
 *
 * Handles three cases:
 * 1. S = never (default, no schema) → DefaultAsyncType (loose mode with index signatures)
 * 2. S = AsyncSchemaInput (has SchemaLike values) → InferAsyncMessages<S>
 * 3. S = explicit type (backward compat) → S as-is
 */
export type ResolveAsyncType<S> = [S] extends [never]
	? DefaultAsyncType
	: S extends AsyncSchemaInput
		? InferAsyncMessages<S>
		: S;

/**
 * Resolve sync protocol type from generic parameter.
 *
 * Same three-case pattern as ResolveAsyncType.
 */
export type ResolveSyncType<S> = [S] extends [never]
	? DefaultSyncType
	: S extends SyncSchemaInput
		? InferSyncService<S>
		: S;
