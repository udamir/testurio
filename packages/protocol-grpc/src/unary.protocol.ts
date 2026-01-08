/**
 * gRPC Unary Protocol
 *
 * Protocol for gRPC unary (request/response) calls.
 * Supports client connections, mock servers, and proxy servers.
 *
 * Flexible type system:
 * - Loose mode (no type parameter): Any operation ID accepted
 * - Strict mode (with type parameter): Only defined operations allowed
 *
 * @example Loose mode
 * ```typescript
 * const protocol = new GrpcUnaryProtocol({
 *   schema: './greeter.proto',
 * });
 * // client.request('AnyMethod', { payload: { ... } })
 * ```
 *
 * @example Strict mode
 * ```typescript
 * interface GreeterService {
 *   SayHello: { request: { name: string }; response: { message: string } };
 * }
 * const protocol = new GrpcUnaryProtocol<GreeterService>({
 *   schema: './greeter.proto',
 * });
 * // client.request('SayHello', { payload: { name: 'World' } })
 * ```
 */

import type * as grpc from "@grpc/grpc-js";
import type {
	ClientProtocolConfig,
	ISyncClientAdapter,
	ISyncProtocol,
	ISyncServerAdapter,
	SchemaDefinition,
	ServerProtocolConfig,
} from "testurio";
import { BaseSyncProtocol } from "testurio";
import { GrpcBaseProtocol } from "./grpc-base";
import type {
	DefaultGrpcUnaryOperations,
	GrpcOperationRequest,
	GrpcOperationResponse,
	GrpcUnaryOperations,
	GrpcUnaryProtocolOptions,
} from "./types";
import { GrpcUnaryClientAdapter, GrpcUnaryServerAdapter } from "./unary.adapters";

/**
 * gRPC Unary Protocol
 *
 * Implements synchronous request/response pattern for gRPC unary calls.
 *
 * @template T - Service definition type for type-safe method calls
 *   - If omitted: loose mode (any operation ID accepted)
 *   - If provided: strict mode (only defined operations allowed)
 */
export class GrpcUnaryProtocol<T = DefaultGrpcUnaryOperations>
	extends BaseSyncProtocol<GrpcUnaryOperations<T>, GrpcOperationRequest, GrpcOperationResponse>
	implements ISyncProtocol<GrpcUnaryOperations<T>, GrpcOperationRequest, GrpcOperationResponse>
{
	readonly type = "grpc-unary";

	/** Protocol options */
	private protocolOptions: GrpcUnaryProtocolOptions;

	/** Base protocol for shared functionality */
	private base: GrpcBaseProtocol;

	constructor(options: GrpcUnaryProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
		this.base = new (class extends GrpcBaseProtocol {})();
	}

	/**
	 * Load Protobuf schema from .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const result = await this.base.loadSchema(schemaPath);
		return result;
	}

	/**
	 * Get service client constructor by name
	 */
	getServiceClient(serviceName: string): grpc.ServiceClientConstructor | undefined {
		return this.base.getServiceClient(serviceName);
	}

	/**
	 * Get service definitions from loaded schema
	 */
	private getServiceDefinitions(): Map<string, grpc.ServiceDefinition> {
		return this.base.schema?.services ?? new Map();
	}

	// =========================================================================
	// v3 API: Stateless factory methods (component owns adapters)
	// =========================================================================

	/**
	 * Create and start gRPC server adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createServer(config: ServerProtocolConfig): Promise<ISyncServerAdapter> {
		// Auto-load schema from options if not already loaded
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		return GrpcUnaryServerAdapter.create(
			config.listenAddress.host,
			config.listenAddress.port,
			this.getServiceDefinitions(),
			config.tls
		);
	}

	/**
	 * Create gRPC client adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createClient(config: ClientProtocolConfig): Promise<ISyncClientAdapter> {
		// Auto-load schema from options if not already loaded
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		// Get the service client constructor
		const serviceName = this.protocolOptions.serviceName;
		let ServiceClient: grpc.ServiceClientConstructor | undefined;

		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else {
			// Get first available service
			for (const [name] of this.getServiceDefinitions()) {
				ServiceClient = this.getServiceClient(name);
				if (ServiceClient) break;
			}
		}

		if (!ServiceClient) {
			throw new Error(`Service ${serviceName || "any"} not found. Make sure to load schema first.`);
		}

		// Request timeout: config overrides protocol options
		const requestTimeout = config.timeouts?.requestTimeout ?? this.protocolOptions.timeout;

		return GrpcUnaryClientAdapter.create(
			config.targetAddress.host,
			config.targetAddress.port,
			ServiceClient,
			config.tls,
			requestTimeout
		);
	}
}

/**
 * Create gRPC unary protocol factory
 */
export function createGrpcUnaryProtocol<T = DefaultGrpcUnaryOperations>(
	options: GrpcUnaryProtocolOptions = {}
): GrpcUnaryProtocol<T> {
	return new GrpcUnaryProtocol<T>(options);
}
