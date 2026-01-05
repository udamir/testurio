/**
 * WebSocket Protocol (v2)
 *
 * Implements async bidirectional messaging over WebSocket.
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
import type { WsServiceDefinition, WsProtocolOptions } from "./types";
import { WsServerAdapter, WsClientAdapter } from "./ws.adapters";

/**
 * WebSocket Protocol
 *
 * Provides WebSocket client and server functionality for testing.
 * Uses real WebSocket servers and connections for actual network communication.
 *
 * @template S - Service definition with clientMessages/serverMessages
 *
 * @example
 * ```typescript
 * interface MyWsService extends WsServiceDefinition {
 *   clientMessages: {
 *     ping: { seq: number };
 *     subscribe: { channel: string };
 *   };
 *   serverMessages: {
 *     pong: { seq: number };
 *     subscribed: { channel: string; success: boolean };
 *   };
 * }
 *
 * const protocol = new WebSocketProtocol<MyWsService>();
 * 
 * // Server mode
 * await protocol.startServer(config, (connection) => {
 *   connection.onMessage("ping", undefined, (payload) => {
 *     connection.sendEvent("pong", { seq: payload.seq });
 *   });
 * });
 * 
 * // Client mode
 * const connection = await protocol.connect(config);
 * connection.onEvent("pong", undefined, (payload) => console.log(payload));
 * await connection.sendMessage("ping", { seq: 1 });
 * ```
 */
export class WebSocketProtocol<S extends WsServiceDefinition = WsServiceDefinition>
	extends BaseAsyncProtocol<S>
	implements IAsyncProtocol<S>
{
	readonly type = "websocket";

	constructor(private _options: WsProtocolOptions = {}) {
		super();
	}

	/**
	 * Get protocol options
	 */
	getOptions(): WsProtocolOptions {
		return this._options;
	}

	/**
	 * Load JSON schema (optional for WebSocket)
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
		return {
			type: "json-schema",
			content: { paths: paths.join(",") },
			validate: true,
		};
	}

	/**
	 * Create and start WebSocket server adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createServer(config: ServerProtocolConfig): Promise<IAsyncServerAdapter> {
		return WsServerAdapter.create(
			config.listenAddress.host,
			config.listenAddress.port,
		);
	}

	/**
	 * Create WebSocket client adapter (v3 API)
	 * Component owns the returned adapter
	 */
	async createClient(config: ClientProtocolConfig): Promise<IAsyncClientAdapter> {
		return WsClientAdapter.create(
			config.targetAddress.host,
			config.targetAddress.port,
			config.targetAddress.path,
			config.tls?.enabled,
		);
	}
}

/**
 * Create WebSocket protocol factory
 */
export function createWebSocketProtocol<S extends WsServiceDefinition>(
	options?: WsProtocolOptions,
): WebSocketProtocol<S> {
	return new WebSocketProtocol<S>(options);
}
