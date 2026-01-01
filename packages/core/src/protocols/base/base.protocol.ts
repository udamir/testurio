/**
 * Base Protocol
 *
 * Abstract base classes for sync and async protocol.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type {
	ProtocolCharacteristics,
	SchemaDefinition,
	ClientProtocolConfig,
	ClientProtocol,
	ServerProtocolConfig,
	ServerProtocol,
	MessageHandler,
	IHookRegistry,
	SyncRequestCallback,
	SyncOperations,
} from "./base.types";


/**
 * Abstract base class with common protocol functionality
 *
 * Provides shared infrastructure for both sync and async protocols.
 * Not exported directly - use BaseSyncProtocol or BaseAsyncProtocol instead.
 */
abstract class BaseProtocol<S = unknown, C = unknown> {
	abstract readonly type: string;
	abstract readonly characteristics: ProtocolCharacteristics;

	/**
	 * Hook registry for component-based message handling
	 * Each component owns its own HookRegistry and passes it to its protocol
	 */
	protected hookRegistry?: IHookRegistry;
	protected server: ServerProtocol<S> = { isRunning: false };
	protected client: ClientProtocol<C> = { isConnected: false };

	/**
	 * Set the hook registry for this protocol
	 * Called by component when protocol is created
	 */
	setHookRegistry(registry: IHookRegistry): void {
		this.hookRegistry = registry;
	}

	/**
	 * Load and parse schema files
	 * Default implementation returns empty schema
	 */
	async loadSchema(_schemaPath: string | string[]): Promise<SchemaDefinition> {
		return {
			type: "custom",
			content: {},
			validate: false,
		};
	}

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	abstract startServer(config: ServerProtocolConfig): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	abstract stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	abstract createClient(config: ClientProtocolConfig): Promise<void>;

	/**
	 * Close a client connection
	 */
	abstract closeClient(): Promise<void>;

	/**
	 * Dispose protocol and release all resources
	 * Closes all servers, clients, and clears internal state
	 */
	async dispose(): Promise<void> {
		// Stop server
		try {
			await this.stopServer();
		} catch {
			// Ignore errors during cleanup
		}

		// Close client
		try {
			await this.closeClient();
		} catch {
			// Ignore errors during cleanup
		}

		// Clear all state
		this.server = { isRunning: false };
		this.client = { isConnected: false };
		this.hookRegistry = undefined;
	}
}

/**
 * Base class for sync protocol (HTTP, gRPC Unary)
 *
 * Provides common functionality for request/response protocols.
 * Use this for protocols where each request gets exactly one response.
 * 
 * @template T - Service definition type (operation name -> { request, response })
 * @template TReq - Raw request type for the protocol
 * @template TRes - Raw response type for the protocol
 */
export abstract class BaseSyncProtocol<T extends SyncOperations<T> = SyncOperations, TReq = unknown, TRes = unknown> extends BaseProtocol {
	/**
	 * Phantom type properties for type inference.
	 * These properties are never assigned at runtime - they exist only for TypeScript.
	 */
	declare readonly $types: T;
	declare readonly $request: TReq;
	declare readonly $response: TRes;
	
	protected requestHandler?: SyncRequestCallback<TReq, TRes>;

	public setRequestHandler(callback: SyncRequestCallback<TReq, TRes>): void {
		this.requestHandler = callback;
	}
}

/**
 * Async protocol messages type - maps message type to payload
 * For bidirectional streams: { clientMessage, serverMessage }
 */
export type AsyncMessages<T = object> = {
	[K in keyof T]?: {
		clientMessage: unknown
		serverMessage: unknown
	};
}

/**
 * Base class for async protocol (WebSocket, TCP, gRPC Stream)
 *
 * Provides message handler management for bidirectional message protocols.
 * Use this for protocols with message streams.
 * 
 * @template M - Message definition type (message type -> payload or { clientMessage, serverMessage })
 */
export abstract class BaseAsyncProtocol<M extends AsyncMessages = AsyncMessages> extends BaseProtocol {
	/**
	 * Phantom type property for type inference.
	 * Used by components to infer message types via ProtocolMessages<A>.
	 */
	declare readonly $types: {
		messages: M;
	};

	/**
	 * Message handlers for servers (async protocols)
	 */
	protected messageHandlers = new Map<string, MessageHandler[]>();

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		messageType: string,
		handler: MessageHandler<T>,
	): void {
		const typeHandlers = this.messageHandlers.get(messageType);

		if (!typeHandlers) {
			this.messageHandlers.set(messageType, [handler as MessageHandler]);
		} else {
			typeHandlers.push(handler as MessageHandler);
		}
	}

	/**
	 * Dispose protocol and release all resources
	 */
	override async dispose(): Promise<void> {
		await super.dispose();
		this.messageHandlers.clear();
	}
}
