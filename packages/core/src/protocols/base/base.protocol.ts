/**
 * Base Protocol Adapters
 *
 * Abstract base classes for sync and async protocol adapters.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type {
	ProtocolCharacteristics,
	SchemaDefinition,
	ClientAdapterConfig,
	ClientAdapter,
	ServerAdapterConfig,
	ServerAdapter,
	MessageHandler,
	IHookRegistry,
	SyncRequestCallback,
} from "./base.types";


/**
 * Abstract base class with common protocol functionality
 *
 * Provides shared infrastructure for both sync and async adapters.
 * Not exported directly - use BaseSyncAdapter or BaseAsyncAdapter instead.
 */
abstract class BaseProtocol<S = unknown, C = unknown> {
	abstract readonly type: string;
	abstract readonly characteristics: ProtocolCharacteristics;

	/**
	 * Hook registry for component-based message handling
	 * Each component owns its own HookRegistry and passes it to its adapter
	 */
	protected hookRegistry?: IHookRegistry;
	protected server: ServerAdapter<S> = { isRunning: false };
	protected client: ClientAdapter<C> = { isConnected: false };

	/**
	 * Set the hook registry for this adapter
	 * Called by component when adapter is created
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
	abstract startServer(config: ServerAdapterConfig): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	abstract stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	abstract createClient(config: ClientAdapterConfig): Promise<void>;

	/**
	 * Close a client connection
	 */
	abstract closeClient(): Promise<void>;

	/**
	 * Dispose adapter and release all resources
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
 * Base class for sync protocol adapters (HTTP, gRPC Unary)
 *
 * Provides common functionality for request/response protocols.
 * Use this for protocols where each request gets exactly one response.
 */
export abstract class BaseSyncProtocol<TReq = unknown, TRes = unknown> extends BaseProtocol {

	protected requestHandler?: SyncRequestCallback<TReq, TRes>;

	public setRequestHandler(callback: SyncRequestCallback<TReq, TRes>): void {
		this.requestHandler = callback;
	}
}

/**
 * Base class for async protocol adapters (WebSocket, TCP, gRPC Stream)
 *
 * Provides message handler management for bidirectional message protocols.
 * Use this for protocols with message streams.
 */
export abstract class BaseAsyncProtocol extends BaseProtocol {
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
	 * Dispose adapter and release all resources
	 */
	override async dispose(): Promise<void> {
		await super.dispose();
		this.messageHandlers.clear();
	}
}
