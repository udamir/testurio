/**
 * gRPC Stream Protocol
 *
 * Protocol for gRPC bidirectional streaming.
 * Supports client connections, mock servers, and proxy servers.
 */

import type * as grpc from "@grpc/grpc-js";
import type {
	ClientProtocolConfig,
	IAsyncClientAdapter,
	IAsyncProtocol,
	IAsyncServerAdapter,
	SchemaDefinition,
	ServerProtocolConfig,
} from "testurio";
import { BaseAsyncProtocol } from "testurio";
import { GrpcBaseProtocol } from "./grpc-base";
import { GrpcStreamClientAdapter, GrpcStreamServerAdapter } from "./stream.adapters";
import type { GrpcStreamProtocolOptions, GrpcStreamServiceDefinition } from "./types";

/**
 * gRPC Stream Protocol
 *
 * Implements asynchronous bidirectional streaming for gRPC.
 *
 * @template S - Stream service definition type
 */
export class GrpcStreamProtocol<S extends GrpcStreamServiceDefinition = GrpcStreamServiceDefinition>
	extends BaseAsyncProtocol<S>
	implements IAsyncProtocol<S>
{
	readonly type = "grpc-stream";

	private base: GrpcBaseProtocol;

	/** Protocol options */
	private protocolOptions: GrpcStreamProtocolOptions;

	constructor(options: GrpcStreamProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
		this.base = new (class extends GrpcBaseProtocol {})();
	}

	/**
	 * Load Protobuf schema from .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		return this.base.loadSchema(schemaPath);
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
	 * Create and start gRPC stream server adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createServer(config: ServerProtocolConfig): Promise<IAsyncServerAdapter> {
		// Auto-load schema from options if not already loaded
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		return GrpcStreamServerAdapter.create(
			config.listenAddress.host,
			config.listenAddress.port,
			this.getServiceDefinitions(),
			config.tls
		);
	}

	/**
	 * Create gRPC stream client adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createClient(config: ClientProtocolConfig): Promise<IAsyncClientAdapter> {
		// Auto-load schema from options if not already loaded
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		const serviceName = this.protocolOptions.serviceName;
		const methodName = this.protocolOptions.methodName;

		if (!methodName) {
			throw new Error("methodName is required in protocol options for streaming");
		}

		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else {
			for (const [name] of this.getServiceDefinitions()) {
				ServiceClient = this.getServiceClient(name);
				if (ServiceClient) break;
			}
		}

		if (!ServiceClient) {
			throw new Error(`Service ${serviceName || "any"} not found. Make sure to load schema first.`);
		}

		return GrpcStreamClientAdapter.create(
			config.targetAddress.host,
			config.targetAddress.port,
			ServiceClient,
			methodName,
			config.tls
		);
	}
}

/**
 * Create gRPC stream protocol factory
 */
export function createGrpcStreamProtocol(): GrpcStreamProtocol {
	return new GrpcStreamProtocol();
}
