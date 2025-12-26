/**
 * Base Protocol Adapters
 *
 * Abstract base classes for sync and async protocol adapters.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type {
	ProtocolCharacteristics,
	SchemaDefinition,
	AdapterClientConfig,
	AdapterClient,
	AdapterServerConfig,
	AdapterServer,
	MessageHandler,
	IHookRegistry,
} from "./base-adapter.types";

let handleIdCounter = 0;

/**
 * Generate unique handle ID
 */
export function generateHandleId(prefix: string): string {
	return `${prefix}-${++handleIdCounter}-${Date.now().toString(36)}`;
}

/**
 * Abstract base class with common adapter functionality
 *
 * Provides shared infrastructure for both sync and async adapters.
 * Not exported directly - use BaseSyncAdapter or BaseAsyncAdapter instead.
 */
abstract class BaseAdapter {
	abstract readonly type: string;
	abstract readonly characteristics: ProtocolCharacteristics;

	/**
	 * Hook registry for component-based message handling
	 * Each component owns its own HookRegistry and passes it to its adapter
	 */
	protected hookRegistry?: IHookRegistry;

	/**
	 * Active servers managed by this adapter
	 */
	protected servers = new Map<string, AdapterServer>();

	/**
	 * Active clients managed by this adapter
	 */
	protected clients = new Map<string, AdapterClient>();

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
	abstract startServer(
		config: AdapterServerConfig,
	): Promise<AdapterServer>;

	/**
	 * Stop a server/proxy
	 */
	abstract stopServer(server: AdapterServer): Promise<void>;

	/**
	 * Create a client connection
	 */
	abstract createClient(
		config: AdapterClientConfig,
	): Promise<AdapterClient>;

	/**
	 * Close a client connection
	 */
	abstract closeClient(client: AdapterClient): Promise<void>;

	/**
	 * Clean up resources for a server
	 */
	protected cleanupServer(serverId: string): void {
		this.servers.delete(serverId);
	}

	/**
	 * Clean up resources for a client
	 */
	protected cleanupClient(clientId: string): void {
		this.clients.delete(clientId);
	}

	/**
	 * Get all active servers
	 */
	getActiveServers(): AdapterServer[] {
		return Array.from(this.servers.values());
	}

	/**
	 * Get all active clients
	 */
	getActiveClients(): AdapterClient[] {
		return Array.from(this.clients.values());
	}

	/**
	 * Dispose adapter and release all resources
	 * Closes all servers, clients, and clears internal state
	 */
	async dispose(): Promise<void> {
		// Stop all servers
		const servers = Array.from(this.servers.values());
		for (const server of servers) {
			try {
				await this.stopServer(server);
			} catch {
				// Ignore errors during cleanup
			}
		}

		// Close all clients
		const clients = Array.from(this.clients.values());
		for (const client of clients) {
			try {
				await this.closeClient(client);
			} catch {
				// Ignore errors during cleanup
			}
		}

		// Clear all state
		this.servers.clear();
		this.clients.clear();
		this.hookRegistry = undefined;
	}
}

/**
 * Base class for sync protocol adapters (HTTP, gRPC Unary)
 *
 * Provides common functionality for request/response protocols.
 * Use this for protocols where each request gets exactly one response.
 */
export abstract class BaseSyncAdapter extends BaseAdapter {
	/**
	 * Resolve message type from operationId and adapter-specific options.
	 * Base implementation returns messageType as-is.
	 * Subclasses override to implement protocol-specific resolution.
	 *
	 * @param messageType - Operation identifier
	 * @param _options - Adapter-specific options (ignored in base implementation)
	 * @returns Resolved message type for hook matching
	 */
	resolveMessageType(messageType: string, _options?: unknown): string {
		return messageType;
	}
}

/**
 * Base class for async protocol adapters (WebSocket, TCP, gRPC Stream)
 *
 * Provides message handler management for bidirectional message protocols.
 * Use this for protocols with message streams.
 */
export abstract class BaseAsyncAdapter extends BaseAdapter {
	/**
	 * Message handlers for servers (async protocols)
	 */
	protected messageHandlers = new Map<string, Map<string, MessageHandler[]>>();

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		server: AdapterServer,
		messageType: string,
		handler: MessageHandler<T>,
	): void {
		let serverHandlers = this.messageHandlers.get(server.id);
		if (!serverHandlers) {
			serverHandlers = new Map();
			this.messageHandlers.set(server.id, serverHandlers);
		}

		let typeHandlers = serverHandlers.get(messageType);
		if (!typeHandlers) {
			typeHandlers = [];
			serverHandlers.set(messageType, typeHandlers);
		}

		typeHandlers.push(handler as MessageHandler);
	}

	/**
	 * Get message handlers for a server and message type
	 */
	protected getMessageHandlers(
		serverId: string,
		messageType: string,
	): MessageHandler[] {
		const serverHandlers = this.messageHandlers.get(serverId);
		if (!serverHandlers) return [];
		return serverHandlers.get(messageType) || [];
	}

	/**
	 * Clean up resources for a server (override to also clear message handlers)
	 */
	protected override cleanupServer(serverId: string): void {
		super.cleanupServer(serverId);
		this.messageHandlers.delete(serverId);
	}

	/**
	 * Dispose adapter and release all resources
	 */
	override async dispose(): Promise<void> {
		await super.dispose();
		this.messageHandlers.clear();
	}
}
