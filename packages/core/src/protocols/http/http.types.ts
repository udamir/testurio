/**
 * HTTP Adapter Types
 *
 * Type definitions specific to the HTTP adapter.
 */

import type { AdapterTypeMarker, SyncRequestOptions } from "../base";

/**
 * HTTP-specific request options
 */
export interface HttpRequestOptions extends SyncRequestOptions {
	/** HTTP method (GET, POST, PUT, DELETE, etc.) */
	method: string;
	/** URL path */
	path: string;
	/** Request headers */
	headers?: Record<string, string>;
	/** Request body (HTTP-specific alias for payload) */
	body?: unknown;
}

/**
 * HTTP adapter options (for client configuration)
 */
export interface HttpOptions {
	/** Base URL */
	baseUrl?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Default headers */
	headers?: Record<string, string>;
}

/**
 * HTTP Request type for sync protocols
 */
export interface HttpRequest<TBody = unknown> {
	method: string; // HTTP method
	path: string; // Request path
	headers?: Record<string, string | string[] | undefined>; // Request headers
	query?: string; // Query parameters
	body?: TBody; // Request body
	requestId?: string; // Request ID for correlation
}

/**
 * HTTP Response type for sync protocols
 */
export interface HttpResponse<TBody = unknown> {
	code: number; // HTTP status code (required for HTTP)
	headers?: Record<string, string>; // Response headers/metadata
	body?: TBody; // Response body
	requestId?: string; // Request ID for correlation
}

/**
 * HTTP Operation definition for type-safe HTTP adapters.
 * Maps operation IDs to request/response structures.
 */
export interface HttpOperation {
	/** Request definition */
	request: {
		/** HTTP method */
		method: string;
		/** URL path pattern */
		path: string;
		/** Request body type */
		body?: unknown;
		/** Request headers */
		headers?: Record<string, unknown>;
		/** Query parameters */
		query?: Record<string, unknown>;
		/** Path parameters */
		params?: Record<string, unknown>;
	};
	/** Response definitions keyed by status code */
	responses: Record<
		number,
		{
			body?: unknown;
			headers?: Record<string, unknown>;
			type?: string;
		}
	>;
}

/**
 * HTTP Service definition - maps operation IDs to HTTP operations
 */
export type HttpServiceDefinition = Record<string, HttpOperation>;

/**
 * HTTP Adapter type marker
 * @template S - HTTP service definition (operation ID -> { request, responses })
 */
export interface HttpAdapterTypes<
	S extends HttpServiceDefinition = HttpServiceDefinition,
> extends AdapterTypeMarker {
	readonly request: HttpRequest;
	readonly response: HttpResponse;
	readonly options: HttpRequestOptions;
	/** Service definition for type-safe operations */
	readonly service: S;
}
