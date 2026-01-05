/**
 * HTTP Protocol
 *
 * Protocol for HTTP/REST supporting:
 * - Client requests (GET, POST, PUT, DELETE, etc.)
 * - Mock servers (real HTTP servers)
 * - Proxy servers (real HTTP proxy)
 */

import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	SchemaDefinition,
	ISyncProtocol,
	ISyncServerAdapter,
	ISyncClientAdapter,
} from "../base";
import { BaseSyncProtocol } from "../base";
import { HttpServerAdapter, HttpClientAdapter } from "./http.adapters";
import type {
	HttpRequest,
	HttpResponse,
	HttpOperations,
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
export class HttpProtocol<T extends HttpOperations = HttpOperations>
	extends BaseSyncProtocol<T, HttpRequest, HttpResponse>
	implements ISyncProtocol<T, HttpRequest, HttpResponse>
{

	readonly type = "http";

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
	 * Create and start HTTP server adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createServer(config: ServerProtocolConfig): Promise<ISyncServerAdapter> {
		return HttpServerAdapter.create(
			config.listenAddress.host,
			config.listenAddress.port,
		);
	}

	/**
	 * Create HTTP client adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createClient(config: ClientProtocolConfig): Promise<ISyncClientAdapter> {
		return HttpClientAdapter.create(
			config.targetAddress.host,
			config.targetAddress.port,
			config.tls?.enabled,
		);
	}
}
