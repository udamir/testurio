/**
 * HTTP Protocol
 *
 * Protocol for HTTP/REST supporting:
 * - Client requests (GET, POST, PUT, DELETE, etc.)
 * - Mock servers (real HTTP servers)
 * - Proxy servers (real HTTP proxy)
 */

import * as http from "node:http";
import type {
	ClientProtocolConfig,
	ClientProtocol,
	ServerProtocolConfig,
	ServerProtocol,
	SchemaDefinition,
	ISyncProtocol,
} from "../base";
import { BaseSyncProtocol, generateId } from "../base";
import type {
	HttpOperation,
	HttpRequest,
	HttpRequestOptions,
	HttpResponse,
	HttpServiceDefinition,
} from "./http.types";

/**
 * HTTP protocol options
 */
export interface HttpProtocolOptions {
	/** OpenAPI schema path for validation */
	schema?: string | string[];
}

/**
 * HTTP Protocol
 *
 * Provides HTTP client and server functionality for testing.
 * Uses real HTTP servers and fetch for actual network communication.
 *
 * @template S - HTTP service definition (operation ID -> { request, responses })
 */
export class HttpProtocol<T extends  { [K in keyof T]?: HttpOperation } = HttpServiceDefinition>
	extends BaseSyncProtocol<T, HttpRequest, HttpResponse>
	implements ISyncProtocol<T, HttpRequest, HttpResponse>
{

	readonly type = "http";

	public server: ServerProtocol<http.Server> = { isRunning: false };
	public client: ClientProtocol<string> = { isConnected: false };
	private pendingRequests = new Map<string, http.ServerResponse>();

	constructor(private options: HttpProtocolOptions = {}) {
		super();
	}

	/**
	 * Get protocol options
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
	async startServer(config: ServerProtocolConfig): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = http.createServer(async (req, res) => {
				const [path = "", query = ""] = req.url?.split("?") || [];
				const body = await this.readRequestBody(req);
				const messageType = `${req.method} ${path}`;
				const traceId = generateId(messageType);
				this.pendingRequests.set(traceId, res);

				const payload: HttpRequest = {
					method: req.method || "GET",
					path,
					query,
					headers: req.headers,
					body,
				};

				const response = await this.requestHandler?.(messageType, payload);
				if (response) {
					this.respond(traceId, response);
					return;
				}

				// No handler processed the request - send 404
				this.respond(traceId, { code: 404, headers: {}, body: { error: "Not Found" } });
			});

			server.on("error", (err) => {
				reject(new Error(err.message));
			});

			server.listen(config.listenAddress.port, config.listenAddress.host, () => {
				this.server.isRunning = true;
				this.server.ref = server;
				resolve();
			});
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
		res.writeHead(params.code || 200, {
			"content-type": "application/json",
			...params.headers,
		});
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
	async createClient(config: ClientProtocolConfig<HttpProtocolOptions>): Promise<void> {
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
	 * @returns HTTP response with code, headers, and body
	 */
	async request<TResBody = unknown>(
		_messageType: string,
		options?: HttpRequestOptions,
	): Promise<HttpResponse<TResBody>> {
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

			let body: TResBody;
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				body = (await response.json()) as TResBody;
			} else {
				body = (await response.text()) as TResBody;
			}

			// Convert response headers to Record<string, string>
			const headers: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				headers[key] = value;
			});

			return {
				code: response.status,
				headers,
				body,
			};
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : "Request failed");
		}
	}
}
