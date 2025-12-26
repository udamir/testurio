/**
 * HTTP Protocol Adapter
 *
 * Adapter for HTTP/REST protocol supporting:
 * - Client requests (GET, POST, PUT, DELETE, etc.)
 * - Mock servers (real HTTP servers)
 * - Proxy servers (real HTTP proxy)
 */

import * as http from "node:http";
import type {
	AdapterClientConfig,
	AdapterClient,
	AdapterServerConfig,
	AdapterServer,
	PayloadMatcher,
	ProtocolCharacteristics,
	SchemaDefinition,
	SyncAdapter,
	SyncRequestCallback,
} from "../../base-adapter";
import { BaseSyncAdapter, generateHandleId } from "../../base-adapter";
import type {
	HttpAdapterTypes,
	HttpOptions,
	HttpRequest,
	HttpRequestOptions,
	HttpResponse,
	HttpServiceDefinition,
} from "./http.types";

/**
 * Match HTTP path with support for path parameters
 * Supports both {id} (OpenAPI) and :id (Express) formats
 * Examples:
 *   matchHttpPath('/users/123', '/users/{id}') => true
 *   matchHttpPath('/users/123', '/users/:id') => true
 *   matchHttpPath('/users/123/posts', '/users/{id}/posts') => true
 *   matchHttpPath('/users', '/users/{id}') => false
 */
export function matchHttpPath(
	actualPath: string,
	patternPath: string,
): boolean {
	// Exact match
	if (actualPath === patternPath) return true;

	// No path parameters - simple comparison
	if (!patternPath.includes("{") && !patternPath.includes(":")) {
		return actualPath === patternPath;
	}

	// Split paths into segments
	const actualSegments = actualPath.split("/").filter(Boolean);
	const patternSegments = patternPath.split("/").filter(Boolean);

	// Different number of segments - no match
	if (actualSegments.length !== patternSegments.length) {
		return false;
	}

	// Match each segment
	for (let i = 0; i < patternSegments.length; i++) {
		const patternSegment = patternSegments[i];
		const actualSegment = actualSegments[i];

		// Path parameter - matches anything
		// Support both {id} (OpenAPI) and :id (Express) formats
		if (
			(patternSegment.startsWith("{") && patternSegment.endsWith("}")) ||
			patternSegment.startsWith(":")
		) {
			continue;
		}

		// Literal segment - must match exactly
		if (patternSegment !== actualSegment) {
			return false;
		}
	}

	return true;
}

/**
 * Create HTTP endpoint matcher as a function matcher
 * Use this to match HTTP requests by method and path pattern
 */
export function createHttpEndpointMatcher(
	method: string,
	path: string,
): PayloadMatcher {
	return {
		type: "function",
		fn: (payload: unknown) => {
			const req = payload as HttpRequest;
			return req.method === method && matchHttpPath(req.path, path);
		},
	};
}

/**
 * HTTP-specific server handle
 */
interface HttpServerHandle extends AdapterServer {
	_internal: {
		server: http.Server;
		isProxy: boolean;
		targetAddress?: { host: string; port: number };
		onRequest?: SyncRequestCallback;
	};
}

/**
 * HTTP-specific client handle
 */
interface HttpClientHandle extends AdapterClient {
	_internal: {
		baseUrl: string;
		headers: Record<string, string>;
		timeout: number;
	};
}

/**
 * HTTP adapter options
 */
export interface HttpAdapterOptions {
	/** Default timeout for requests in milliseconds */
	timeout?: number;
	/** Default headers to include in all requests */
	headers?: Record<string, string>;
	/** OpenAPI schema path for validation */
	schema?: string | string[];
}

/**
 * HTTP Protocol Adapter
 *
 * Provides HTTP client and server functionality for testing.
 * Uses real HTTP servers and fetch for actual network communication.
 *
 * @template S - HTTP service definition (operation ID -> { request, responses })
 */
export class HttpAdapter<
		S extends HttpServiceDefinition = HttpServiceDefinition,
	>
	extends BaseSyncAdapter
	implements SyncAdapter<HttpRequestOptions>
{
	/**
	 * Phantom type property for type inference.
	 * This property is never assigned at runtime - it exists only for TypeScript.
	 * Used by components to infer request/response types.
	 */
	declare readonly __types: HttpAdapterTypes<S>;

	readonly type = "http";

	readonly characteristics: ProtocolCharacteristics = {
		type: "http",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: false,
		bidirectional: false,
	};

	private options: HttpAdapterOptions;

	constructor(options: HttpAdapterOptions = {}) {
		super();
		this.options = options;
	}

	/**
	 * Get adapter options
	 */
	getOptions(): HttpAdapterOptions {
		return this.options;
	}

	/**
	 * Resolve message type for HTTP protocol.
	 * Constructs "METHOD /path" format from options if provided.
	 *
	 * @param messageType - Operation identifier (e.g., "createUser")
	 * @param options - HTTP-specific options with method and path
	 * @returns Resolved message type (e.g., "POST /users")
	 */
	override resolveMessageType(
		messageType: string,
		options?: HttpRequestOptions,
	): string {
		if (options?.method && options?.path) {
			return `${options.method.toUpperCase()} ${options.path}`;
		}
		return messageType;
	}

	/**
	 * Load OpenAPI schema
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];

		// In a real implementation, this would load and parse OpenAPI specs
		return {
			type: "openapi",
			content: { paths: paths.join(",") },
			validate: true,
		};
	}

	/**
	 * Start a real HTTP server (mock or proxy)
	 */
	async startServer(config: AdapterServerConfig): Promise<HttpServerHandle> {
		const id = generateHandleId("http-server");
		const isProxy = !!config.targetAddress;
		const onRequestCallback = config.onRequest;

		return new Promise((resolve, reject) => {
			const server = http.createServer(async (req, res) => {
				await this.handleIncomingRequest(
					id,
					isProxy,
					config.targetAddress,
					onRequestCallback,
					req,
					res,
				);
			});

			server.on("error", (err) => {
				reject(err);
			});

			server.listen(
				config.listenAddress.port,
				config.listenAddress.host,
				() => {
					const handle: HttpServerHandle = {
						id,
						type: this.type,
						address: config.listenAddress,
						isRunning: true,
						_internal: {
							server,
							isProxy,
							targetAddress: config.targetAddress,
							onRequest: onRequestCallback,
						},
					};

					this.servers.set(id, handle);
					resolve(handle);
				},
			);
		});
	}

	/**
	 * Handle incoming HTTP request on a server
	 */
	private async handleIncomingRequest(
		_serverId: string,
		isProxy: boolean,
		targetAddress: { host: string; port: number } | undefined,
		onRequestCallback:
			| SyncRequestCallback
			| undefined,
		req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		// Parse request body
		const body = await this.readRequestBody(req);
		const method = req.method?.toUpperCase() || "GET";
		const path = req.url || "/";

		const httpRequest: HttpRequest = {
			method,
			path,
			headers: req.headers as Record<string, string>,
			body,
			query: {},
		};

		// HTTP message type format: "METHOD /path"
		const messageType = `${method} ${path}`;

		// Delegate to component callback for request handling
		if (onRequestCallback) {
			const message = {
				type: messageType,
				payload: httpRequest,
				traceId: httpRequest.requestId,
				metadata: {
					method,
					path,
				},
			};

			try {
				const result = await onRequestCallback(message);

				if (result && result.type === "response") {
					const response = result.payload as HttpResponse;
					this.sendResponse(res, response);
					return;
				}
			} catch (error) {
				this.sendResponse(res, {
					status: 500,
					headers: {},
					body: {
						error: error instanceof Error ? error.message : "Unknown error",
					},
				});
				return;
			}
		}

		// No handler - check if proxy mode
		if (isProxy && targetAddress) {
			await this.proxyRequest(httpRequest, targetAddress, res);
			return;
		}

		// No handler found
		this.sendResponse(res, {
			status: 404,
			headers: {},
			body: { error: `No handler for ${method} ${path}` },
		});
	}

	/**
	 * Read request body as JSON or string
	 */
	private readRequestBody(req: http.IncomingMessage): Promise<unknown> {
		return new Promise((resolve) => {
			const chunks: Buffer[] = [];

			req.on("data", (chunk: Buffer) => {
				chunks.push(chunk);
			});

			req.on("end", () => {
				if (chunks.length === 0) {
					resolve(undefined);
					return;
				}

				const bodyStr = Buffer.concat(chunks).toString("utf-8");
				try {
					resolve(JSON.parse(bodyStr));
				} catch {
					resolve(bodyStr);
				}
			});

			req.on("error", () => {
				resolve(undefined);
			});
		});
	}

	/**
	 * Send HTTP response
	 */
	private sendResponse(res: http.ServerResponse, response: HttpResponse): void {
		const body = response.body;
		const bodyStr = typeof body === "string" ? body : JSON.stringify(body);

		res.writeHead(response.status || 200, {
			"Content-Type": "application/json",
			...response.headers,
		});
		res.end(bodyStr);
	}

	/**
	 * Proxy request to target server
	 */
	private async proxyRequest(
		request: HttpRequest,
		targetAddress: { host: string; port: number },
		res: http.ServerResponse,
	): Promise<void> {
		const url = `http://${targetAddress.host}:${targetAddress.port}${request.path}`;

		try {
			const response = await this.makeHttpRequest(
				request.method,
				url,
				request.body,
				request.headers,
			);
			this.sendResponse(res, response);
		} catch (error) {
			this.sendResponse(res, {
				status: 502,
				headers: {},
				body: {
					error: error instanceof Error ? error.message : "Proxy error",
				},
			});
		}
	}

	/**
	 * Stop an HTTP server
	 */
	async stopServer(server: AdapterServer): Promise<void> {
		const handle = this.servers.get(server.id) as HttpServerHandle | undefined;
		if (!handle) {
			throw new Error(`Server ${server.id} not found`);
		}

		await new Promise<void>((resolve, reject) => {
			handle._internal.server.close((err) => {
				if (err) {
					reject(err);
				} else {
					handle.isRunning = false;
					this.cleanupServer(server.id);
					resolve();
				}
			});
		});

		// Delay to allow OS to release the port
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	/**
	 * Create an HTTP client
	 */
	async createClient(config: AdapterClientConfig): Promise<HttpClientHandle> {
		const id = generateHandleId("http-client");
		const options = config.options as HttpOptions | undefined;

		const protocol = config.tls?.enabled ? "https" : "http";
		const baseUrl =
			options?.baseUrl ||
			`${protocol}://${config.targetAddress.host}:${config.targetAddress.port}`;

		const handle: HttpClientHandle = {
			id,
			type: this.type,
			address: config.targetAddress,
			isConnected: true,
			_internal: {
				baseUrl,
				headers: options?.headers || {},
				timeout: options?.timeout || 30000,
			},
		};

		this.clients.set(id, handle);
		return handle;
	}

	/**
	 * Close an HTTP client
	 */
	async closeClient(client: AdapterClient): Promise<void> {
		const handle = this.clients.get(client.id);
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		handle.isConnected = false;
		this.cleanupClient(client.id);
	}

	/**
	 * Make a real HTTP request using fetch
	 * @param client - Client handle
	 * @param _messageType - Operation ID (not used directly, method/path come from options)
	 * @param options - HTTP request options (method, path, payload, headers)
	 */
	async request<TRes = unknown>(
		client: AdapterClient,
		_messageType: string,
		options?: HttpRequestOptions,
	): Promise<TRes> {
		const handle = this.clients.get(client.id) as HttpClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		if (!options?.method || !options?.path) {
			throw new Error("HTTP request requires method and path in options");
		}

		const url = `${handle._internal.baseUrl}${options.path}`;
		const requestHeaders = { ...handle._internal.headers, ...options.headers };

		// Use body as HTTP-specific alias for payload
		const requestBody = options.payload ?? options.body;

		const response = await this.makeHttpRequest<unknown, TRes>(
			options.method.toUpperCase(),
			url,
			requestBody,
			requestHeaders,
		);

		return response.body as TRes;
	}

	/**
	 * Make an actual HTTP request using fetch
	 */
	private async makeHttpRequest<TReq = unknown, TRes = unknown>(
		method: string,
		url: string,
		payload?: TReq,
		headers?: Record<string, string>,
	): Promise<HttpResponse<TRes>> {
		const fetchOptions: RequestInit = {
			method,
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
		};

		if (payload !== undefined && method !== "GET" && method !== "HEAD") {
			fetchOptions.body = JSON.stringify(payload);
		}

		try {
			const response = await fetch(url, fetchOptions);
			const responseHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});

			let body: TRes;
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				body = (await response.json()) as TRes;
			} else {
				body = (await response.text()) as TRes;
			}

			return {
				status: response.status,
				headers: responseHeaders,
				body,
			};
		} catch (error) {
			return {
				status: 503,
				headers: {},
				body: {
					error: error instanceof Error ? error.message : "Request failed",
				} as TRes,
			};
		}
	}
}

/**
 * Create HTTP adapter factory
 */
export function createHttpAdapter(): HttpAdapter {
	return new HttpAdapter();
}
