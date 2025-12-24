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
	HttpOptions,
	HttpRequest,
	HttpResponse,
	ProtocolCharacteristics,
	SchemaDefinition,
} from "../types";
import { BaseProtocolAdapter, generateHandleId } from "./base-adapter";
import type {
	AdapterClientHandle,
	AdapterServerHandle,
	AdapterClientConfig,
	ServerConfig,
} from "./types";

/**
 * HTTP-specific server handle
 */
interface HttpServerHandle extends AdapterServerHandle {
	_internal: {
		server: http.Server;
		isProxy: boolean;
		targetAddress?: { host: string; port: number };
	};
}

/**
 * HTTP-specific client handle
 */
interface HttpClientHandle extends AdapterClientHandle {
	_internal: {
		baseUrl: string;
		headers: Record<string, string>;
		timeout: number;
	};
}

/**
 * HTTP Protocol Adapter
 *
 * Provides HTTP client and server functionality for testing.
 * Uses real HTTP servers and fetch for actual network communication.
 */
export class HttpAdapter extends BaseProtocolAdapter {
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
	async startServer(config: ServerConfig): Promise<HttpServerHandle> {
		const id = generateHandleId("http-server");
		const isProxy = !!config.targetAddress;

		return new Promise((resolve, reject) => {
			const server = http.createServer(async (req, res) => {
				await this.handleIncomingRequest(id, isProxy, config.targetAddress, req, res);
			});

			server.on("error", (err) => {
				reject(err);
			});

			server.listen(config.listenAddress.port, config.listenAddress.host, () => {
				const handle: HttpServerHandle = {
					id,
					type: this.type,
					address: config.listenAddress,
					isRunning: true,
					_internal: {
						server,
						isProxy,
						targetAddress: config.targetAddress,
					},
				};

				this.servers.set(id, handle);
				resolve(handle);
			});
		});
	}

	/**
	 * Handle incoming HTTP request on a server
	 */
	private async handleIncomingRequest(
		serverId: string,
		isProxy: boolean,
		targetAddress: { host: string; port: number } | undefined,
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
			payload: body,
			query: {},
		};

		// Try hook-based handlers first (declarative API)
		// Each component owns its own HookRegistry, so no componentName lookup needed
		if (this.hookRegistry) {
			const messageType = `${method} ${path}`;
			const message = {
				type: messageType,
				payload: httpRequest,
				traceId: httpRequest.requestId,
				metadata: {
					method,
					path,
				},
			};

			const hookResult = await this.hookRegistry.executeHooks(message);

			if (hookResult && hookResult.type === "response") {
				const response = hookResult.payload as HttpResponse;
				this.sendResponse(res, response);
				return;
			}
		}

		// Fall back to imperative handler (legacy API)
		const handler = this.getRequestHandler(serverId, method, path);

		if (handler) {
			try {
				const result = await handler(httpRequest, {
					timestamp: Date.now(),
					direction: "inbound",
				});

				if (this.isHttpResponse(result)) {
					this.sendResponse(res, result);
				} else {
					this.sendResponse(res, {
						status: 200,
						headers: {},
						body: result,
					});
				}
				return;
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
		const body = response.body ?? response.payload;
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
				request.payload,
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
	async stopServer(server: AdapterServerHandle): Promise<void> {
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
			options?.baseURL ||
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
	async closeClient(client: AdapterClientHandle): Promise<void> {
		const handle = this.clients.get(client.id);
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		handle.isConnected = false;
		this.cleanupClient(client.id);
	}

	/**
	 * Make a real HTTP request using fetch
	 */
	async request<TReq = unknown, TRes = unknown>(
		client: AdapterClientHandle,
		method: string,
		path: string,
		payload?: TReq,
		headers?: Record<string, string>,
	): Promise<TRes> {
		const handle = this.clients.get(client.id) as HttpClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		const url = `${handle._internal.baseUrl}${path}`;
		const requestHeaders = { ...handle._internal.headers, ...headers };

		const response = await this.makeHttpRequest<TReq, TRes>(
			method.toUpperCase(),
			url,
			payload,
			requestHeaders,
		);

		return (response.body ?? response.payload) as TRes;
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

	/**
	 * Check if a value is an HttpResponse
	 */
	private isHttpResponse(value: unknown): value is HttpResponse {
		return (
			typeof value === "object" &&
			value !== null &&
			"status" in value &&
			typeof (value as HttpResponse).status === "number"
		);
	}
}

/**
 * Create HTTP adapter factory
 */
export function createHttpAdapter(): HttpAdapter {
	return new HttpAdapter();
}
