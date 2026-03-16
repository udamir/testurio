/**
 * gRPC Stream Protocol
 *
 * Protocol for gRPC bidirectional streaming.
 * Supports client connections, mock servers, and proxy servers.
 *
 * Flexible type system:
 * - Loose mode (no type parameter): Any message type accepted
 * - Strict mode (with type parameter): Only defined message types allowed
 *
 * @example Loose mode
 * ```typescript
 * const protocol = new GrpcStreamProtocol({
 *   protoPath: './chat.proto',
 *   methodName: 'Chat',
 * });
 * // client.send('Chat', { type: 'message', payload: { ... } })
 * ```
 *
 * @example Strict mode
 * ```typescript
 * interface ChatService {
 *   clientMessages: { message: { text: string } };
 *   serverMessages: { reply: { text: string; timestamp: number } };
 * }
 * const protocol = new GrpcStreamProtocol<ChatService>({
 *   protoPath: './chat.proto',
 *   methodName: 'Chat',
 * });
 * // client.send('message', { type: 'message', payload: { text: 'Hello' } })
 * ```
 */

import type * as grpc from "@grpc/grpc-js";
import type {
	AsyncSchemaInput,
	ClientProtocolConfig,
	IAsyncClientAdapter,
	IAsyncProtocol,
	IAsyncServerAdapter,
	InferAsyncMessages,
	SchemaDefinition,
	ServerProtocolConfig,
} from "testurio";
import { BaseAsyncProtocol } from "testurio";
import { GrpcBaseProtocol } from "./grpc-base";
import { GrpcStreamClientAdapter, GrpcStreamServerAdapter } from "./stream.adapters";
import type { DefaultGrpcStreamMessages, GrpcStreamProtocolOptions } from "./types";

/**
 * Resolve gRPC stream protocol type from generic parameter.
 *
 * Three cases:
 * 1. S = never → DefaultGrpcStreamMessages (loose mode)
 * 2. S = AsyncSchemaInput → InferAsyncMessages<S> (schema inference)
 * 3. S = explicit type → S as-is (backward compat)
 */
type ResolveGrpcStreamType<S> = [S] extends [never]
	? DefaultGrpcStreamMessages
	: S extends AsyncSchemaInput
		? InferAsyncMessages<S>
		: S extends DefaultGrpcStreamMessages
			? S
			: DefaultGrpcStreamMessages;

/**
 * gRPC Stream Protocol
 *
 * Implements asynchronous bidirectional streaming for gRPC.
 *
 * @template S - Schema input, explicit messages type, or never (loose mode)
 *   - If omitted: loose mode (any message type accepted)
 *   - If AsyncSchemaInput: schema inference mode
 *   - If explicit type: strict mode (only defined message types allowed)
 */
export class GrpcStreamProtocol<S = never>
	extends BaseAsyncProtocol<ResolveGrpcStreamType<S>>
	implements IAsyncProtocol<ResolveGrpcStreamType<S>>
{
	readonly type = "grpc-stream";
	override readonly schema?: AsyncSchemaInput;

	private base: GrpcBaseProtocol;

	/** Protocol options */
	private protocolOptions: GrpcStreamProtocolOptions<S>;

	constructor(options: GrpcStreamProtocolOptions<S> = {} as GrpcStreamProtocolOptions<S>) {
		super();
		this.protocolOptions = options;
		this.schema = options.schema as AsyncSchemaInput | undefined;
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
		if (!this.base.getServiceClient("") && this.protocolOptions.protoPath) {
			await this.loadSchema(this.protocolOptions.protoPath);
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
		if (!this.base.getServiceClient("") && this.protocolOptions.protoPath) {
			await this.loadSchema(this.protocolOptions.protoPath);
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
export function createGrpcStreamProtocol<S = never>(
	options: GrpcStreamProtocolOptions<S> = {} as GrpcStreamProtocolOptions<S>
): GrpcStreamProtocol<S> {
	return new GrpcStreamProtocol<S>(options);
}
