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
	ClientAdapterConfig,
	ClientAdapter,
	ServerAdapterConfig,
	ServerAdapter,
	ProtocolCharacteristics,
	SchemaDefinition,
	ISyncProtocol,
	SyncResponse,
} from "../base";
import { BaseSyncProtocol, generateId } from "../base";
import type {
	HttpAdapterTypes,
	HttpRequest,
	HttpRequestOptions,
	HttpResponse,
	HttpServiceDefinition,
} from "./http.types";

/**
 * HTTP adapter options
 */
export interface HttpProtocolOptions {
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
export class HttpAdapter<S extends HttpServiceDefinition = HttpServiceDefinition>
	extends BaseSyncProtocol<HttpRequest, HttpResponse>
	implements ISyncProtocol<HttpRequestOptions>
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

	public server: ServerAdapter<http.Server> = { isRunning: false };
	public client: ClientAdapter<string> = { isConnected: false };
	private pendingRequests = new Map<string, http.ServerResponse>();

	constructor(private options: HttpProtocolOptions = {}) {
		super();
	}

	/**
	 * Get adapter options
	 */
	getOptions(): HttpProtocolOptions {
		return this.options;
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
	async startServer(config: ServerAdapterConfig): Promise<void> {
		const server = http.createServer(async (req, res) => {
			
			const [path = "", query = ""] = req.url?.split("?") || [];
			const body = await this.readRequestBody(req);
			const messageType = `${req.method} ${path}`;
			const traceId = generateId(messageType);
			this.pendingRequests.set(traceId, res);
			
			const payload = { method: req.method || "GET", path, query, headers: req.headers, body };

			const response = await this.requestHandler?.({ type: messageType, payload, traceId })
			if (response) {
				this.respond(traceId, response.payload)
				return;
			}
			
		});

		server.on("error", (err) => {
			throw new Error(err.message);
		});

		server.listen(config.listenAddress.port, config.listenAddress.host, () => {
			this.server.isRunning = true;
			this.server.ref = server;
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
				} else {
					const bodyStr = Buffer.concat(chunks).toString("utf-8");
					try {
						resolve(JSON.parse(bodyStr));
					} catch {
						resolve(bodyStr);
					}
				}
			});

			req.on("error", () => {
				resolve(undefined);
			});
		});
	}

	public respond(traceId: string, params: HttpResponse) {
		const res = this.pendingRequests.get(traceId);
		if (!res) {
			return;
		}
		res.writeHead(params.code || 200, { ...params.headers });
		res.end(JSON.stringify(params.body ?? {}));
		this.pendingRequests.delete(traceId);
	}

	/**
	 * Stop an HTTP server
	 */
	async stopServer(): Promise<void> {
		const server = this.server.ref;
		if (!server) {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(err);
				} else {
					this.server.isRunning = false;
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
	async createClient(config: ClientAdapterConfig<HttpProtocolOptions>): Promise<void> {
		const protocol = config.tls?.enabled ? "https" : "http";
		const baseUrl = `${protocol}://${config.targetAddress.host}:${config.targetAddress.port}`;

		this.client.isConnected = true;
		this.client.ref = baseUrl;
	}

	/**
	 * Close an HTTP client
	 */
	async closeClient(): Promise<void> {
		const handle = this.client;
		if (!handle) {
			throw new Error("Client not found");
		}

		handle.isConnected = false;
	}

	/**
	 * Make a real HTTP request using fetch
	 * @param messageType - Operation ID (not used directly, method/path come from options)
	 * @param options - HTTP request options (method, path, payload, headers)
	 */
	async request<TRes = unknown>(
		_messageType: string,
		options?: HttpRequestOptions,
	): Promise<SyncResponse<TRes>> {
		if (!this.client.isConnected) {
			throw new Error("Client is not connected");
		}

		if (!options?.method || !options?.path) {
			throw new Error("HTTP request requires method and path in options");
		}

		const fetchOptions: RequestInit = {
			method: options.method,
			headers: {
				"Content-Type": "application/json",
				...options.headers
			},
		};

		if (options.body) {
			fetchOptions.body = JSON.stringify(options.body);
		}

		try {
			const response = await fetch(`${this.client.ref}${options.path}`, fetchOptions);
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
