/**
 * Async Server Types
 *
 * Type extraction helpers for async server step builders.
 * Types are extracted from the protocol type which contains
 * the message definition via clientMessages/serverMessages.
 */

import type { ExtractClientPayload, ExtractServerPayload } from "../../protocols/base";

/**
 * Extract payload type for an incoming message (client → server).
 * @template A - Protocol type
 * @template K - Message type key
 */
export type ExtractMessagePayload<A, K> = ExtractClientPayload<A, K>;

/**
 * Extract payload type for an outgoing event (server → client).
 * @template A - Protocol type
 * @template K - Event type key
 */
export type ExtractEventPayload<A, K> = ExtractServerPayload<A, K>;

/**
 * Handler context for server handlers.
 * Provides access to connection information for targeted responses.
 */
export interface ServerHandlerContext {
	/** Connection ID of the client that triggered this handler */
	connectionId: string;
}

/**
 * Protocol-specific connection context.
 *
 * This is passed directly to onConnection matchers - NOT wrapped.
 * Protocol adapters define their own context types:
 * - GrpcProtocol: { metadata: Record<string, string | string[]> }
 * - WsProtocol: { path: string, query: Record<string, string>, headers: Record<string, string> }
 * - TcpProtocol: { remoteAddress: string, remotePort: number }
 *
 * The component passes through whatever the adapter provides - no wrapping.
 */
export type ConnectionContext<TProtocolContext = unknown> = TProtocolContext;
