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
	/** Message delimiter (default: "\n") - only used when lengthFieldLength is 0 */
	delimiter?: string;
	/**
	 * Length field size for binary framing (0 = no length prefix).
	 * - 0: No length prefix, use delimiter for text protocols (default)
	 * - 1: 1-byte length prefix (max 255 bytes)
	 * - 2: 2-byte length prefix (max 65KB)
	 * - 4: 4-byte length prefix (max 4GB) - recommended for binary
	 * - 8: 8-byte length prefix (max 16EB)
	 */
	lengthFieldLength?: 0 | 1 | 2 | 4 | 8;
	/** Maximum message length */
	maxLength?: number;
	/** Use TLS */
	tls?: boolean;
	/** Server name for TLS verification */
	serverName?: string;
	/** Skip TLS certificate verification */
	insecureSkipVerify?: boolean;
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

// =============================================================================
// Tcp Client/Server Types
// =============================================================================

export type DataEncoding = "utf-8" | "binary";

export interface ISocket {
	readonly id: string;
	readonly remoteAddress: string;
	readonly remotePort: number;
	readonly connected: boolean;
	send(data: Uint8Array): Promise<void>;
	write(data: Uint8Array): Promise<void>;
	close(): void;
}
