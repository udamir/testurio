/**
 * HTTP Protocol Adapters (v3 Design)
 *
 * Server and client adapters for HTTP protocol.
 */

import * as http from "node:http";
import type { ISyncClientAdapter, ISyncServerAdapter } from "../base";
import { generateId } from "../base";
import type { HttpRequest, HttpRequestOptions, HttpResponse } from "./http.types";

interface RoutePattern {
	method: string;
	regex: RegExp;
	paramNames: string[];
}

type Route = { method: string; path: string };

/**
 * HTTP Server Adapter
 * Wraps http.Server instance, owned by component
 */
export class HttpServerAdapter implements ISyncServerAdapter {
	private server: http.Server;
	private pendingRequests = new Map<string, http.ServerResponse>();
	private requestHandler?: (messageType: string, request: HttpRequest) => Promise<HttpResponse | null>;
	private compiledRoutes: RoutePattern[];

	constructor(server: http.Server, routes: Route[]) {
		this.server = server;
		// Compile routes once at construction (routes are complete at design-time)
		this.compiledRoutes = routes.map((r) => {
			const { regex, paramNames } = HttpServerAdapter.compilePath(r.path);
			return { method: r.method.toUpperCase(), regex, paramNames };
		});
	}

	/**
	 * Create and start HTTP server adapter
	 */
	static async create(host: string, port: number, routes: Route[]): Promise<HttpServerAdapter> {
		return new Promise((resolve, reject) => {
			const server = http.createServer();
			const adapter = new HttpServerAdapter(server, routes);

			server.on("error", (err) => {
				reject(new Error(err.message));
			});

			server.on("request", async (req, res) => {
				await adapter.handleRequest(req, res);
			});

			server.listen(port, host, () => {
				resolve(adapter);
			});
		});
	}

	/**
	 * Compile path pattern to regex with capture groups
	 */
	private static compilePath(path: string): { regex: RegExp; paramNames: string[] } {
		const paramNames: string[] = [];
		const regexStr = path
			.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			.replace(/\\{([^}]+)\\}/g, (_, name: string) => {
				paramNames.push(name);
				return "([^/]+)";
			});
		return { regex: new RegExp(`^${regexStr}$`), paramNames };
	}

	/**
	 * Extract path params from request using registered routes
	 */
	private extractParams(method: string, path: string): Record<string, string> | undefined {
		for (const route of this.compiledRoutes) {
			if (route.method !== method.toUpperCase()) continue;
			const match = route.regex.exec(path);
			if (match && route.paramNames.length > 0) {
				const params: Record<string, string> = {};
				route.paramNames.forEach((name, i) => {
					params[name] = match[i + 1];
				});
				return params;
			}
		}
		return undefined;
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const [path = "", query = ""] = req.url?.split("?") || [];
		const method = req.method || "GET";
		const body = await this.readRequestBody(req);
		const messageType = `${method} ${path}`;
		const traceId = generateId(messageType);
		this.pendingRequests.set(traceId, res);

		// Extract params at parsing time
		const params = this.extractParams(method, path);

		const payload: HttpRequest = {
			method,
			path,
			query,
			headers: req.headers,
			body,
			params,
		};

		const response = await this.requestHandler?.(messageType, payload);
		if (response) {
			this.respond(traceId, response);
			return;
		}

		// No handler processed the request - send 404
		this.respond(traceId, {
			code: 404,
			headers: {},
			body: { error: "Not Found" },
		});
	}

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

	private respond(traceId: string, params: HttpResponse): void {
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

	onRequest<TReq = unknown, TRes = unknown>(
		handler: (messageType: string, request: TReq) => Promise<TRes | null>
	): void {
		this.requestHandler = handler as (messageType: string, request: HttpRequest) => Promise<HttpResponse | null>;
	}

	async stop(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			this.server.close((err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});

		// Delay to allow OS to release the port
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/**
 * HTTP Client Adapter
 * Wraps fetch-based HTTP client, owned by component
 */
export class HttpClientAdapter implements ISyncClientAdapter {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Create HTTP client adapter
	 */
	static async create(host: string, port: number, tls?: boolean): Promise<HttpClientAdapter> {
		const protocol = tls ? "https" : "http";
		const baseUrl = `${protocol}://${host}:${port}`;
		return new HttpClientAdapter(baseUrl);
	}

	async request<TReq = unknown, TRes = unknown>(_messageType: string, data: TReq, timeout?: number): Promise<TRes> {
		const options = data as HttpRequestOptions;

		if (!options?.method || !options?.path) {
			throw new Error("HTTP request requires method and path in options");
		}

		const fetchOptions: RequestInit = {
			method: options.method,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
		};

		if (options.body) {
			fetchOptions.body = JSON.stringify(options.body);
		}

		// Apply request timeout if specified
		const requestTimeout = options.timeout ?? timeout;
		if (requestTimeout && requestTimeout > 0) {
			fetchOptions.signal = AbortSignal.timeout(requestTimeout);
		}

		try {
			const response = await fetch(`${this.baseUrl}${options.path}`, fetchOptions);

			let body: unknown;
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				body = await response.json();
			} else {
				body = await response.text();
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
			} as TRes;
		} catch (error) {
			if (error instanceof Error) {
				// Check for abort/timeout errors
				if (error.name === "TimeoutError" || error.name === "AbortError") {
					throw new Error(`Request timeout after ${requestTimeout}ms`);
				}
				throw new Error(error.message);
			}
			throw new Error("Request failed");
		}
	}

	async close(): Promise<void> {
		// HTTP client is stateless, nothing to close
	}
}
