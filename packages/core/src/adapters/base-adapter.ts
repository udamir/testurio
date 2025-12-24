/**
 * Base Protocol Adapters
 *
 * Abstract base classes for sync and async protocol adapters.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type { HookRegistry } from "../hooks";
import type { ProtocolCharacteristics, SchemaDefinition } from "../types";
import type {
	AdapterClientConfig,
	AdapterClientHandle,
	AdapterServerConfig,
	AdapterServerHandle,
	BaseAdapter,
	MessageHandler,
	RequestHandler,
} from "./types";

let handleIdCounter = 0;

/**
 * Generate unique handle ID
 */
export function generateHandleId(prefix: string): string {
	return `${prefix}-${++handleIdCounter}-${Date.now().toString(36)}`;
}

/**
 * Reset handle ID counter (for testing)
 */
export function resetHandleIdCounter(): void {
	handleIdCounter = 0;
}

/**
 * Abstract base class with common adapter functionality
 *
 * Provides shared infrastructure for both sync and async adapters.
 * Not exported directly - use BaseSyncAdapter or BaseAsyncAdapter instead.
 */
abstract class BaseAdapterImpl implements BaseAdapter {
	abstract readonly type: string;
	abstract readonly characteristics: ProtocolCharacteristics;

	/**
	 * Hook registry for component-based message handling
	 * Each component owns its own HookRegistry and passes it to its adapter
	 */
	protected hookRegistry?: HookRegistry;

	/**
	 * Active servers managed by this adapter
	 */
	protected servers = new Map<string, AdapterServerHandle>();

	/**
	 * Active clients managed by this adapter
	 */
	protected clients = new Map<string, AdapterClientHandle>();

	/**
	 * Set the hook registry for this adapter
	 * Called by component when adapter is created
	 */
	setHookRegistry(registry: HookRegistry): void {
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
	): Promise<AdapterServerHandle>;

	/**
	 * Stop a server/proxy
	 */
	abstract stopServer(server: AdapterServerHandle): Promise<void>;

	/**
	 * Create a client connection
	 */
	abstract createClient(
		config: AdapterClientConfig,
	): Promise<AdapterClientHandle>;

	/**
	 * Close a client connection
	 */
	abstract closeClient(client: AdapterClientHandle): Promise<void>;

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
	getActiveServers(): AdapterServerHandle[] {
		return Array.from(this.servers.values());
	}

	/**
	 * Get all active clients
	 */
	getActiveClients(): AdapterClientHandle[] {
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
 * Provides request handler management for request/response protocols.
 * Use this for protocols where each request gets exactly one response.
 */
export abstract class BaseSyncAdapter extends BaseAdapterImpl {
	/**
	 * Request handlers for servers (sync protocols)
	 * Map: serverId -> messageType -> handler
	 */
	protected requestHandlers = new Map<string, Map<string, RequestHandler>>();

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

	/**
	 * Register request handler for server/proxy
	 * @param server - Server handle
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Adapter-specific options (subclasses interpret this)
	 * @param handler - Request handler function
	 */
	onRequest<TReq = unknown, TRes = unknown>(
		server: AdapterServerHandle,
		messageType: string,
		_options: unknown,
		handler: RequestHandler<TReq, TRes>,
	): void {
		let serverHandlers = this.requestHandlers.get(server.id);
		if (!serverHandlers) {
			serverHandlers = new Map();
			this.requestHandlers.set(server.id, serverHandlers);
		}

		// Base implementation just uses messageType as key
		// Subclasses can override to use options (e.g., HTTP uses method/path)
		serverHandlers.set(messageType, handler as RequestHandler);
	}

	/**
	 * Get request handler for a server and message type
	 */
	protected getRequestHandler(
		serverId: string,
		messageType: string,
	): RequestHandler | undefined {
		const serverHandlers = this.requestHandlers.get(serverId);
		if (!serverHandlers) return undefined;

		return serverHandlers.get(messageType);
	}

	/**
	 * Clean up resources for a server (override to also clear request handlers)
	 */
	protected override cleanupServer(serverId: string): void {
		super.cleanupServer(serverId);
		this.requestHandlers.delete(serverId);
	}

	/**
	 * Dispose adapter and release all resources
	 */
	override async dispose(): Promise<void> {
		await super.dispose();
		this.requestHandlers.clear();
	}
}

/**
 * Base class for async protocol adapters (WebSocket, TCP, gRPC Stream)
 *
 * Provides message handler management for bidirectional message protocols.
 * Use this for protocols with message streams.
 */
export abstract class BaseAsyncAdapter extends BaseAdapterImpl {
	/**
	 * Message handlers for servers (async protocols)
	 */
	protected messageHandlers = new Map<string, Map<string, MessageHandler[]>>();

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		server: AdapterServerHandle,
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
