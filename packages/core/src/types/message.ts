/**
 * Message Types
 *
 * Core message and matcher types for the test framework.
 */

/**
 * Generic message type for async protocols
 */
export interface Message {
	/** Message type/name */
	type: string;

	/** Message payload */
	payload: unknown;

	/** Optional trace ID for correlation */
	traceId?: string;

	/** Message metadata */
	metadata?: MessageMetadata;
}

/**
 * Message metadata
 */
export interface MessageMetadata {
	timestamp?: number; // Timestamp when message was created/received
	direction?: "inbound" | "outbound"; // Message direction (inbound/outbound)
	componentName?: string; // Component that sent/received the message
	[key: string]: unknown; // Additional metadata
}

/**
 * HTTP Request type for sync protocols
 */
export interface HttpRequest<TPayload = unknown> {
	method: string; // HTTP method
	path: string; // Request path
	headers?: Record<string, string>; // Request headers
	query?: Record<string, string>; // Query parameters
	payload?: TPayload; // Request body/payload
	requestId?: string; // Request ID for correlation
}

/**
 * Generic sync response type for all sync protocols
 * Protocol-specific adapters interpret these fields appropriately.
 */
export interface SyncResponse<TPayload = unknown> {
	status?: number; // Status code (HTTP status, gRPC status code, etc.)
	headers?: Record<string, string>; // Response headers/metadata
	payload?: TPayload; // Response body/payload
	body?: TPayload; // Response body (alias for payload, for convenience)
	requestId?: string; // Request ID for correlation
}

/**
 * HTTP Response type for sync protocols
 * @deprecated Use SyncResponse instead for protocol-agnostic code
 */
export interface HttpResponse<TPayload = unknown> extends SyncResponse<TPayload> {
	status: number; // HTTP status code (required for HTTP)
}

/**
 * Message matcher types
 */
export type MessageMatcher =
	| TraceIdMatcher
	| MessageTypeMatcher
	| FunctionMatcher
	| RequestIdMatcher;

/**
 * Match by trace ID
 */
export interface TraceIdMatcher {
	type: "traceId";
	value: string;
}

/**
 * Match by message type (single or multiple)
 */
export interface MessageTypeMatcher {
	type: "messageType";
	value: string | string[];
}

/**
 * Match by custom function
 */
export interface FunctionMatcher {
	type: "function";
	fn: (msg: Message) => boolean;
}

/**
 * Match by request ID (for sync protocols)
 */
export interface RequestIdMatcher {
	type: "requestId";
	value: string;
}

/**
 * Interaction status
 */
export type InteractionStatus = "pending" | "completed" | "failed" | "timeout";

/**
 * Interaction record for recording message flows
 */
export interface Interaction {
	id: string; // Unique interaction ID
	serviceName: string; // Service/component name
	messageType: string; // Message type or HTTP method+path
	protocol: string; // Protocol type
	direction: "downstream" | "upstream"; // Direction (downstream = client->server, upstream = server->client)
	traceId?: string; // Trace ID for correlation
	requestTimestamp: number; // Request timestamp
	responseTimestamp?: number; // Response timestamp (if completed)
	requestPayload?: unknown; // Request payload (if recorded)
	responsePayload?: unknown; // Response payload (if recorded)
	status: InteractionStatus; // Interaction status
	duration?: number; // Duration in milliseconds
	error?: string; // Error message (if failed)
}

/**
 * Filter for querying interactions
 */
export interface InteractionFilter {
	serviceName?: string; // Filter by service name
	messageType?: string; // Filter by message type
	traceId?: string; // Filter by trace ID
	direction?: "downstream" | "upstream"; // Filter by direction
	status?: InteractionStatus; // Filter by status
	protocol?: string; // Filter by protocol
	startTime?: number; // Filter by time range (start timestamp)
	endTime?: number; // Filter by time range (end timestamp)
	filter?: (interaction: Interaction) => boolean; // Custom filter function
}
