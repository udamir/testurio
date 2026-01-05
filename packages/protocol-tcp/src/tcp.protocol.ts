/**
 * TCP Protocol (v2)
 *
 * Implements async bidirectional messaging over TCP.
 * 
 * v2 Design:
 * - Protocol handles transport only (sockets, framing, encoding)
 * - Connection wrappers handle handler registration and matching
 * - Components handle hooks, sessions, and business logic
 *
 * @template S - Service definition type with clientMessages/serverMessages
 */

import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	IAsyncProtocol,
	IAsyncServerAdapter,
	IAsyncClientAdapter,
	SchemaDefinition,
} from "testurio";
import { BaseAsyncProtocol } from "testurio";
import type { TcpServiceDefinition, TcpProtocolOptions } from "./types";
import { TcpServerAdapter, TcpClientAdapter } from "./tcp.adapters";

/**
 * TCP Protocol
 *
 * Provides TCP client and server functionality for testing.
 * Uses real TCP servers and sockets for actual network communication.
 *
 * @template S - Service definition with clientMessages/serverMessages
 *
 * @example
 * ```typescript
 * interface MyTcpService extends TcpServiceDefinition {
 *   clientMessages: {
 *     OrderRequest: { orderId: string; quantity: number };
 *   };
 *   serverMessages: {
 *     OrderResponse: { orderId: string; status: string };
 *   };
 * }
 *
 * const protocol = new TcpProtocol<MyTcpService>();
 * 
 * // Server mode
 * await protocol.startServer(config, (connection) => {
 *   connection.onMessage("OrderRequest", undefined, async (payload) => {
 *     await connection.sendEvent("OrderResponse", { orderId: payload.orderId, status: "ok" });
 *   });
 * });
 * 
 * // Client mode
 * const connection = await protocol.connect(config);
 * connection.onEvent("OrderResponse", undefined, (payload) => console.log(payload));
 * await connection.sendMessage("OrderRequest", { orderId: "123", quantity: 5 });
 * ```
 */
export class TcpProtocol<S extends TcpServiceDefinition = TcpServiceDefinition>
	extends BaseAsyncProtocol<S>
	implements IAsyncProtocol<S>
{
	readonly type = "tcp";

	/** Protocol options */
	private protocolOptions: TcpProtocolOptions;

	constructor(options: TcpProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
	}

	/**
	 * Get protocol options
	 */
	getOptions(): TcpProtocolOptions {
		return this.protocolOptions;
	}

	/**
	 * Load Protobuf schema (optional for TCP)
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
		return {
			type: "protobuf",
			content: { paths: paths.join(",") },
			validate: true,
		};
	}

	/**
	 * Create and start TCP server adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createServer(config: ServerProtocolConfig): Promise<IAsyncServerAdapter> {
		return TcpServerAdapter.create(
			config.listenAddress.host,
			config.listenAddress.port,
			this.protocolOptions,
			config.tls,
		);
	}

	/**
	 * Create TCP client adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createClient(config: ClientProtocolConfig): Promise<IAsyncClientAdapter> {
		return TcpClientAdapter.create(
			config.targetAddress.host,
			config.targetAddress.port,
			{
				...this.protocolOptions,
				tls: config.tls?.enabled ?? this.protocolOptions.tls,
			},
		);
	}
}

/**
 * Create TCP protocol factory
 */
export function createTcpProtocol<S extends TcpServiceDefinition>(
	options?: TcpProtocolOptions,
): TcpProtocol<S> {
	return new TcpProtocol<S>(options);
}
