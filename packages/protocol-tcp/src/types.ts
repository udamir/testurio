/**
 * TCP Protocol Types
 *
 * Type definitions for TCP protocol.
 */

import type { Message } from "testurio";

// =============================================================================
// TCP Service Definition
// =============================================================================

/**
 * TCP Service definition for bidirectional messaging.
 * Uses separate clientMessages and serverMessages maps.
 * 
 * @example
 * ```typescript
 * interface MyTcpService extends TcpServiceDefinition {
 *   clientMessages: {
 *     OrderRequest: { orderId: string; quantity: number };
 *     StatusQuery: { requestId: string };
 *   };
 *   serverMessages: {
 *     OrderResponse: { orderId: string; status: string };
 *     StatusUpdate: { requestId: string; progress: number };
 *   };
 * }
 * ```
 */
export interface TcpServiceDefinition {
	/** Messages that can be sent from client to server */
	clientMessages: Record<string, unknown>;
	/** Messages that can be sent from server to client */
	serverMessages: Record<string, unknown>;
}

// =============================================================================
// TCP Protocol Options
// =============================================================================

/**
 * TCP protocol options
 */
export interface TcpProtocolOptions {
	/** Protocol buffer schema path */
	schema?: string;
	/** Connection timeout in milliseconds */
	timeout?: number;
	/** Message delimiter (default: "\n") */
	delimiter?: string;
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
