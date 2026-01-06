/**
 * Base Protocol
 *
 * Abstract base classes for sync and async protocol.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type { AsyncMessages, Operations, SyncOperations } from "./base.types";

/**
 * Abstract base class with common protocol functionality
 *
 * Provides shared infrastructure for both sync and async protocols.
 * Not exported directly - use BaseSyncProtocol or BaseAsyncProtocol instead.
 */
export abstract class BaseProtocol<T extends Operations = Operations> {
	abstract readonly type: string;

	declare readonly $types: T;
}

/**
 * Base class for sync protocol (HTTP, gRPC Unary)
 *
 * Provides common functionality for request/response protocols.
 * Use this for protocols where each request gets exactly one response.
 *
 * @template T - Service definition type (operation name -> { request, response })
 * @template TReq - Raw request type for the protocol
 * @template TRes - Raw response type for the protocol
 */
export abstract class BaseSyncProtocol<
	T extends SyncOperations = SyncOperations,
	TReq = unknown,
	TRes = unknown,
> extends BaseProtocol<T> {
	/**
	 * Phantom type properties for type inference.
	 * These properties are never assigned at runtime - they exist only for TypeScript.
	 */

	declare readonly $request: TReq;
	declare readonly $response: TRes;
}

/**
 * Base class for async protocol (WebSocket, TCP, gRPC Stream)
 *
 * Provides common functionality for bidirectional message protocols.
 * Subclasses implement transport-specific operations.
 *
 * @template M - Message definition type
 */
export abstract class BaseAsyncProtocol<T extends AsyncMessages = AsyncMessages> extends BaseProtocol<T> {}
