/**
 * WebSocket Protocol Types
 *
 * Type definitions for WebSocket protocol.
 */

import type { Message } from "testurio";

// =============================================================================
// WebSocket Service Definition
// =============================================================================

/**
 * WebSocket Service definition for bidirectional messaging.
 * Uses separate clientMessages and serverMessages maps.
 * 
 * @example
 * ```typescript
 * interface MyWsService extends WsServiceDefinition {
 *   clientMessages: {
 *     ping: { seq: number };
 *     subscribe: { channel: string };
 *   };
 *   serverMessages: {
 *     pong: { seq: number };
 *     subscribed: { channel: string; success: boolean };
 *   };
 * }
 * ```
 */
export interface WsServiceDefinition {
	/** Messages that can be sent from client to server */
	clientMessages: Record<string, unknown>;
	/** Messages that can be sent from server to client */
	serverMessages: Record<string, unknown>;
}

// =============================================================================
// WebSocket Protocol Options
// =============================================================================

/**
 * WebSocket protocol options
 */
export interface WsProtocolOptions {
	/** Connection timeout in milliseconds */
	timeout?: number;
	/** Subprotocols to use */
	protocols?: string | string[];
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Pending message resolver for waitForMessage
 */
export interface PendingMessage {
	resolve: (message: Message) => void;
	reject: (error: Error) => void;
	messageType: string | string[];
	matcher?: string | ((payload: unknown) => boolean);
	timeout: NodeJS.Timeout;
}
