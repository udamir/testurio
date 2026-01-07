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

// =============================================================================
// Path Template Types
// =============================================================================

/**
 * Expand path template to accept concrete values
 * Replaces {param} segments with ${string}
 *
 * @example
 * ExpandPath<"/users/{id}"> = `/users/${string}`
 * ExpandPath<"/users/{id}/posts/{postId}"> = `/users/${string}/posts/${string}`
 * ExpandPath<"/health"> = "/health"
 */
export type ExpandPath<T extends string> = T extends `${infer Prefix}{${infer _Param}}/${infer Rest}`
	? `${Prefix}${string}/${ExpandPath<Rest>}`
	: T extends `${infer Prefix}{${infer _Param}}`
		? `${Prefix}${string}`
		: T;

/**
 * Check if path has parameters
 */
export type HasPathParams<T extends string> = T extends `${string}{${string}}${string}` ? true : false;

/**
 * Transform HTTP request type to expand path templates
 */
export type ExpandHttpRequest<T> = T extends { path: infer P extends string } ? Omit<T, "path"> & { path: ExpandPath<P> } : T;

/**
 * Extract path parameter names as union type
 */
export type ExtractPathParamNames<T extends string> = T extends `${string}{${infer Param}}/${infer Rest}`
	? Param | ExtractPathParamNames<Rest>
	: T extends `${string}{${infer Param}}`
		? Param
		: never;

/**
 * Extract path parameters as typed object
 */
export type ExtractPathParams<T extends string> = ExtractPathParamNames<T> extends never
	? Record<string, never>
	: { [K in ExtractPathParamNames<T>]: string };

/**
 * Make headers flexible - preserve user-defined header keys for autocomplete,
 * but also allow any string key at runtime (HTTP headers are dynamic).
 *
 * @example
 * ```typescript
 * type T = WithFlexibleHeaders<{ headers?: { Authorization: string } }>;
 * //   ^? { headers?: { Authorization: string } & Record<string, string | undefined> }
 * ```
 */
export type WithFlexibleHeaders<T> = T extends { headers?: infer H }
	? Omit<T, "headers"> & { headers?: H & Record<string, string | undefined> }
	: T;

/**
 * Add required params to request based on path template.
 * Used for server handlers where params are always populated by the adapter.
 * Also makes headers flexible to allow any string key alongside defined keys.
 *
 * @example
 * ```typescript
 * type T = WithRequiredParams<{ method: "GET"; path: "/users/{id}" }>;
 * //   ^? { method: "GET"; path: `/users/${string}`; params: { id: string } }
 * ```
 */
export type WithRequiredParams<T> = T extends { path: infer P extends string }
	? ExtractPathParamNames<P> extends never
		? WithFlexibleHeaders<ExpandHttpRequest<T>>
		: WithFlexibleHeaders<ExpandHttpRequest<T>> & { params: ExtractPathParams<P> }
	: WithFlexibleHeaders<T>;

/**
 * Transform an HTTP service definition for type-safe path handling.
 * - `request`: Client perspective - expanded path, no params
 * - `serverRequest`: Server perspective - expanded path, required params
 *
 * This transformation happens at the protocol level, keeping
 * component types protocol-agnostic.
 *
 * @example
 * ```typescript
 * interface MyApi {
 *   getUser: {
 *     request: { method: "GET"; path: "/users/{id}" };
 *     response: { code: 200; body: User };
 *   };
 * }
 *
 * type Transformed = TransformHttpService<MyApi>;
 * // {
 * //   getUser: {
 * //     request: { method: "GET"; path: `/users/${string}` };
 * //     serverRequest: { method: "GET"; path: `/users/${string}`; params: { id: string } };
 * //     response: { code: 200; body: User };
 * //   };
 * // }
 * ```
 */
export type TransformHttpService<S extends HttpOperations> = {
	[K in keyof S]: S[K] extends { request: infer R; response: infer Res }
		? { request: ExpandHttpRequest<R>; serverRequest: WithRequiredParams<R>; response: Res }
		: S[K];
};

// =============================================================================
// HTTP Request/Response Types
// =============================================================================

/**
 * HTTP headers type - allows any string key (case-insensitive at runtime)
 */
export type HttpHeaders = Record<string, string | undefined>;

/**
 * HTTP-specific request options
 */
export interface HttpRequestOptions extends SyncRequestOptions {
	/** HTTP method (GET, POST, PUT, DELETE, etc.) */
	method: string;
	/** URL path */
	path: string;
	/** Request headers (any string key, case-insensitive at runtime) */
	headers?: HttpHeaders;
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
	headers?: HttpHeaders;
}

/**
 * HTTP Request type for sync protocols (runtime type)
 */
export interface HttpRequest<TBody = unknown> {
	/** HTTP method (GET, POST, PUT, DELETE, etc.) */
	method: string;
	/** Request path */
	path: string;
	/** Extracted path parameters (e.g., { id: "123" } from /users/{id}) */
	params?: Record<string, string>;
	/** Request headers (any string key, case-insensitive at runtime) */
	headers?: HttpHeaders;
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
	/** Response headers (any string key, case-insensitive at runtime) */
	headers?: HttpHeaders;
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
