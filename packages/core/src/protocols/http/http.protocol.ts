/**
 * HTTP Protocol
 *
 * Protocol for HTTP/REST supporting:
 * - Client requests (GET, POST, PUT, DELETE, etc.)
 * - Mock servers (real HTTP servers)
 * - Proxy servers (real HTTP proxy)
 */

import type { InferSyncService, SyncSchemaInput } from "../../validation/validation.types";
import type {
	ClientProtocolConfig,
	ISyncClientAdapter,
	ISyncProtocol,
	ISyncServerAdapter,
	MessageMatcher,
	SchemaDefinition,
	ServerProtocolConfig,
} from "../base";
import { BaseSyncProtocol } from "../base";
import { HttpClientAdapter, HttpServerAdapter } from "./http.adapters";
import type {
	DefaultHttpOperations,
	HttpRequest,
	HttpResponse,
	TransformHttpService,
} from "./http.types";

/**
 * HTTP protocol options
 */
export interface HttpProtocolOptions<S = never> {
	/** OpenAPI schema path for validation */
	protoPath?: string | string[];
	/** Typed schema for validation and type inference */
	schema?: S extends SyncSchemaInput ? S : SyncSchemaInput;
}

/**
 * Resolve HTTP protocol type from generic parameter.
 *
 * Three cases:
 * 1. S = never → TransformHttpService<DefaultHttpOperations> (loose mode)
 * 2. S = SyncSchemaInput → InferSyncService<S> (schema inference)
 * 3. S = explicit type → TransformHttpService<S> (backward compat with path expansion)
 */
type ResolveHttpType<S> = [S] extends [never]
	? TransformHttpService<DefaultHttpOperations>
	: S extends SyncSchemaInput
		? InferSyncService<S>
		: TransformHttpService<S>;

/**
 * HTTP Protocol
 *
 * Provides HTTP client and server functionality for testing.
 * Uses real HTTP servers and fetch for actual network communication.
 *
 * The service definition is transformed at the protocol level to:
 * - Expand path templates (e.g., `/users/{id}` → `` `/users/${string}` ``)
 * - Add typed params based on path parameters
 *
 * This keeps component types protocol-agnostic while providing type-safe paths.
 *
 * @template S - Schema input, explicit service type, or never (loose mode)
 */
export class HttpProtocol<S = never>
	extends BaseSyncProtocol<ResolveHttpType<S>, HttpRequest, HttpResponse>
	implements ISyncProtocol<ResolveHttpType<S>, HttpRequest, HttpResponse>
{
	readonly type = "http";
	override readonly schema?: SyncSchemaInput;
	private routes: Array<{ method: string; path: string }> = [];

	constructor(private options: HttpProtocolOptions<S> = {} as HttpProtocolOptions<S>) {
		super();
		this.schema = options.schema as SyncSchemaInput | undefined;
	}

	/**
	 * Get protocol options
	 */
	getOptions(): HttpProtocolOptions<S> {
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
	 * Create and start HTTP server adapter (v3 API)
	 * Component owns the returned adapter
	 *
	 * Routes are already registered at design-time (test case definition)
	 * before server creation at run-time (scenario.run).
	 */
	async createServer(config: ServerProtocolConfig): Promise<ISyncServerAdapter> {
		return HttpServerAdapter.create(config.listenAddress.host, config.listenAddress.port, this.routes);
	}

	/**
	 * Create HTTP client adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createClient(config: ClientProtocolConfig): Promise<ISyncClientAdapter> {
		return HttpClientAdapter.create(config.targetAddress.host, config.targetAddress.port, config.tls?.enabled);
	}

	/**
	 * Create request matcher from options.
	 * Returns matcher function for HTTP method + path pattern matching.
	 * Also stores route for param extraction by adapter.
	 *
	 * @param operationId - Operation identifier (used as fallback)
	 * @param options - HTTP options with method and path
	 * @returns Matcher function or operationId string
	 */
	createMessageTypeMatcher(messageType: string, payload: HttpRequest): MessageMatcher<HttpRequest> | string {
		if (!payload?.method || !payload?.path) {
			// No options - use message type as string for exact match
			return messageType;
		}

		const method = payload.method.toUpperCase();
		const { regex } = this.compilePath(payload.path);

		// Store route for param extraction by adapter
		this.routes.push({ method, path: payload.path });

		return (_: string, request: HttpRequest): boolean => {
			// Match by method and path pattern
			return request.method.toUpperCase() === method && regex.test(request.path);
		};
	}

	/**
	 * Compile path pattern to regex
	 * Converts /users/{id} to regex with capture groups
	 */
	private compilePath(path: string): { regex: RegExp; paramNames: string[] } {
		const paramNames: string[] = [];

		// Escape special regex chars, then replace {param} with capture groups
		const regexStr = path
			.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
			.replace(/\\{([^}]+)\\}/g, (_, name: string) => {
				// Replace \{param\} with capture group
				paramNames.push(name);
				return "([^/]+)";
			});

		return { regex: new RegExp(`^${regexStr}$`), paramNames };
	}
}
