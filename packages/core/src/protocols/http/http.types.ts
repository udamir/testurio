/**
 * HTTP Protocol Types
 *
 * Type definitions specific to the HTTP protocol.
 *
 * @example Service Definition
 * ```typescript
 * interface MyHttpService {
 *   getUsers: {
 *     request: { method: "GET"; path: "/users"; body?: never };
 *     response: { code: 200; body: User[] };
 *   };
 *   createUser: {
 *     request: { method: "POST"; path: "/users"; body: CreateUserPayload };
 *     response: { code: 201; body: User };
 *   };
 * }
 * ```
 *
 * @example Usage
 * ```typescript
 * const server = new Server('backend', {
 *   protocol: new HttpProtocol<MyHttpService>(),
 *   listenAddress: { host: 'localhost', port: 3000 },
 * });
 *
 * // In test case
 * backend.onRequest('getUsers').mockResponse(() => ({
 *   code: 200,
 *   body: [{ id: 1, name: 'John' }]
 * }));
 * ```
 */

import type { SyncOperation, SyncRequestOptions } from "../base";

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
 * HTTP protocol options (for client configuration)
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
	/** HTTP method (GET, POST, PUT, DELETE, etc.) */
	method: string;
	/** Request path */
	path: string;
	/** Extracted path parameters (e.g., { id: "123" } from /users/:id) */
	params?: Record<string, string>;
	/** Request headers */
	headers?: Record<string, string | string[] | undefined>;
	/** Query string (without leading ?) */
	query?: string;
	/** Request body */
	body?: TBody;
}

/**
 * HTTP Response type for sync protocols
 */
export interface HttpResponse<TBody = unknown> {
	/** HTTP status code */
	code: number;
	/** Response headers */
	headers?: Record<string, string>;
	/** Response body */
	body?: TBody;
}

/**
 * HTTP Service definition - maps operation IDs to HTTP operations
 * This is a constraint type for HttpProtocol generic parameter.
 */
export type HttpOperations<T = object> = {
	[K in keyof T]?: SyncOperation<HttpRequest, HttpResponse>;
};

/**
 * HTTP Protocol type marker
 *
 * Declares the types used by HttpProtocol for type inference.
 * Components use `$types` to extract request/response/service types.
 *
 * @template S - HTTP service definition (operation ID -> { request, response })
 *
 * @example
 * ```typescript
 * // HttpProtocol declares this internally:
 * declare readonly __types: HttpProtocolTypes<S>;
 *
 * // Components extract types via:
 * type Service = ProtocolService<HttpProtocol<MyService>>; // MyService
 * type Request = ExtractRequestData<HttpProtocol<MyService>, 'getUsers'>; // { method, path }
 * ```
 */
export interface HttpProtocolTypes<S extends HttpOperations = HttpOperations> {
	readonly request: HttpRequest;
	readonly response: HttpResponse;
	readonly options: HttpRequestOptions;
	/** Service definition for type-safe operations */
	readonly service: S;
}
