/**
 * Base Protocol
 *
 * Abstract base classes for sync and async protocol.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type {
	SchemaDefinition,
	ClientProtocolConfig,
	ClientInstance,
	ServerProtocolConfig,
	ServerInstance,
	MessageHandler,
	IHookRegistry,
	SyncRequestCallback,
	SyncOperations,
	Message,
	PendingMessage,
	AsyncMessages,
} from "./base.types";


/**
 * Abstract base class with common protocol functionality
 *
 * Provides shared infrastructure for both sync and async protocols.
 * Not exported directly - use BaseSyncProtocol or BaseAsyncProtocol instead.
 */
abstract class BaseProtocol<S = unknown, C = unknown> {
	abstract readonly type: string;

	/**
	 * Hook registry for component-based message handling
	 * Each component owns its own HookRegistry and passes it to its protocol
	 */
	protected hookRegistry?: IHookRegistry;
	protected server: ServerInstance<S> = { isRunning: false };
	protected client: ClientInstance<C> = { isConnected: false };

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
 * Base class for async protocol (WebSocket, TCP, gRPC Stream)
 *
 * Provides message handler management for bidirectional message protocols.
 * Use this for protocols with message streams.
 * 
 * @template M - Message definition type (message type -> payload or { clientMessage, serverMessage })
 * @template TProxyClient - Type of the outgoing proxy client (e.g., TcpClient, WebSocket)
 */
export abstract class BaseAsyncProtocol<M extends AsyncMessages = AsyncMessages, TProxyClient = unknown> extends BaseProtocol {
	/**
	 * Phantom type property for type inference.
	 * Used by components to infer message types via ProtocolMessages<A>.
	 */
	declare readonly $types: M;

	/**
	 * Message handlers for servers (async protocols)
	 */
	protected messageHandlers = new Map<string, MessageHandler[]>();

	// =========================================================================
	// Proxy Connection Management
	// =========================================================================

	/** Proxy outgoing connections: connectionId -> outgoing client (for proxy mode) */
	protected proxyClients = new Map<string, TProxyClient>();

	/** Pending proxy connections: connectionId -> Promise (for waiting until connected) */
	protected pendingProxyConnections = new Map<string, Promise<void>>();

	/** Target config for proxy mode */
	protected proxyTargetConfig?: ClientProtocolConfig;

	/** Server listen config (to detect loopback vs proxy mode) */
	protected serverListenConfig?: { host: string; port: number };

	// =========================================================================
	// Client Message Management
	// =========================================================================

	/** Pending messages waiting for response */
	protected pendingMessages = new Map<string, PendingMessage>();

	/** Message queue for received messages */
	protected messageQueue: Message[] = [];

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

	// =========================================================================
	// Proxy Mode Detection
	// =========================================================================

	/**
	 * Check if this is proxy mode: server running AND connecting to a different target
	 */
	protected isProxyMode(targetConfig: ClientProtocolConfig): boolean {
		return (
			this.server.isRunning &&
			!!this.serverListenConfig &&
			(targetConfig.targetAddress.host !== this.serverListenConfig.host ||
				targetConfig.targetAddress.port !== this.serverListenConfig.port)
		);
	}

	// =========================================================================
	// Client Message Delivery
	// =========================================================================

	/**
	 * Deliver message to client (execute hooks, check pending or queue)
	 * Called by subclasses when a message is received on the client
	 */
	protected async deliverMessageToClient(incomingMessage: Message): Promise<void> {
		// Execute hooks first
		let processedMessage = incomingMessage;
		if (this.hookRegistry) {
			const hookResult = await this.hookRegistry.executeHooks(incomingMessage);
			if (hookResult === null) {
				// Message was dropped by hook
				return;
			}
			processedMessage = hookResult;
		}

		// Check pending messages
		for (const [pendingId, pending] of Array.from(this.pendingMessages.entries())) {
			const types = Array.isArray(pending.messageType)
				? pending.messageType
				: [pending.messageType];

			if (types.includes(processedMessage.type)) {
				if (this.matchesPending(processedMessage, pending)) {
					clearTimeout(pending.timeout);
					this.pendingMessages.delete(pendingId);
					pending.resolve(processedMessage);
					return;
				}
			}
		}

		// Add to queue if no pending match
		this.messageQueue.push(processedMessage);
	}

	/**
	 * Find message in queue matching criteria
	 */
	protected findInQueue(
		types: string[],
		matcher?: string | ((payload: unknown) => boolean),
	): Message | undefined {
		const index = this.messageQueue.findIndex((msg) => {
			if (!types.includes(msg.type)) return false;

			if (matcher) {
				if (typeof matcher === "string") {
					return msg.traceId === matcher;
				}
				return matcher(msg.payload);
			}

			return true;
		});

		if (index >= 0) {
			return this.messageQueue.splice(index, 1)[0];
		}

		return undefined;
	}

	/**
	 * Check if message matches pending request
	 */
	protected matchesPending(message: Message, pending: PendingMessage): boolean {
		if (!pending.matcher) return true;

		if (typeof pending.matcher === "string") {
			return message.traceId === pending.matcher;
		}

		return pending.matcher(message.payload);
	}

	// =========================================================================
	// Proxy Client Management
	// =========================================================================

	/**
	 * Wait for proxy connection to be established before forwarding
	 */
	protected async waitForProxyConnection(connectionId: string): Promise<void> {
		const pendingConnection = this.pendingProxyConnections.get(connectionId);
		if (pendingConnection) {
			await pendingConnection;
			this.pendingProxyConnections.delete(connectionId);
		}
	}

	/**
	 * Get proxy client for a connection
	 */
	protected getProxyClient(connectionId: string): TProxyClient | undefined {
		return this.proxyClients.get(connectionId);
	}

	/**
	 * Close a specific proxy client
	 */
	protected abstract closeProxyClient(client: TProxyClient): void;

	/**
	 * Close and remove proxy client for a connection
	 */
	protected removeProxyClient(connectionId: string): void {
		const proxyClient = this.proxyClients.get(connectionId);
		if (proxyClient) {
			this.closeProxyClient(proxyClient);
			this.proxyClients.delete(connectionId);
		}
	}

	/**
	 * Close all proxy clients
	 */
	protected closeAllProxyClients(): void {
		for (const proxyClient of this.proxyClients.values()) {
			this.closeProxyClient(proxyClient);
		}
		this.proxyClients.clear();
		this.pendingProxyConnections.clear();
	}

	// =========================================================================
	// Pending Message Management
	// =========================================================================

	/**
	 * Reject all pending messages (called on disconnect)
	 */
	protected rejectAllPendingMessages(error: Error): void {
		for (const [, pending] of Array.from(this.pendingMessages.entries())) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pendingMessages.clear();
		this.messageQueue = [];
	}

	/**
	 * Clear proxy state (called on server/client stop)
	 */
	protected clearProxyState(): void {
		this.closeAllProxyClients();
		this.proxyTargetConfig = undefined;
		this.serverListenConfig = undefined;
	}

	/**
	 * Dispose protocol and release all resources
	 */
	override async dispose(): Promise<void> {
		await super.dispose();
		this.messageHandlers.clear();
		this.rejectAllPendingMessages(new Error("Protocol disposed"));
		this.clearProxyState();
	}
}
