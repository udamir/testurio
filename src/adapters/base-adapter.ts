/**
 * Base Protocol Adapter
 *
 * Abstract base class for protocol adapters with common functionality.
 */

import type { HookRegistry } from "../hooks";
import type { ProtocolCharacteristics, SchemaDefinition } from "../types";
import type {
	AdapterClientHandle,
	AdapterServerHandle,
	AdapterClientConfig,
	MessageHandler,
	ProtocolAdapter,
	RequestHandler,
	ServerConfig,
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
 * Base Protocol Adapter
 *
 * Provides common functionality for all protocol adapters.
 * Subclasses must implement protocol-specific methods.
 */
export abstract class BaseProtocolAdapter implements ProtocolAdapter {
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
	 * Message handlers for servers (async protocols)
	 */
	protected messageHandlers = new Map<string, Map<string, MessageHandler[]>>();

	/**
	 * Request handlers for servers (sync protocols)
	 */
	protected requestHandlers = new Map<string, Map<string, RequestHandler>>();

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
	abstract startServer(config: ServerConfig): Promise<AdapterServerHandle>;

	/**
	 * Stop a server/proxy
	 */
	abstract stopServer(server: AdapterServerHandle): Promise<void>;

	/**
	 * Create a client connection
	 */
	abstract createClient(config: AdapterClientConfig): Promise<AdapterClientHandle>;

	/**
	 * Close a client connection
	 */
	abstract closeClient(client: AdapterClientHandle): Promise<void>;

	/**
	 * Register message handler for server/proxy (async protocols)
	 * Default implementation stores handlers in memory
	 */
	onMessage<T = unknown>(
		server: AdapterServerHandle,
		messageType: string,
		handler: MessageHandler<T>,
	): void {
		if (!this.characteristics.async) {
			throw new Error(
				`onMessage is not supported for sync protocol '${this.type}'`,
			);
		}

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
	 * Register request handler for server/proxy (sync protocols)
	 * Default implementation stores handlers in memory
	 */
	onRequest<TReq = unknown, TRes = unknown>(
		server: AdapterServerHandle,
		method: string,
		path: string,
		handler: RequestHandler<TReq, TRes>,
	): void {
		if (this.characteristics.async) {
			throw new Error(
				`onRequest is not supported for async protocol '${this.type}'`,
			);
		}

		let serverHandlers = this.requestHandlers.get(server.id);
		if (!serverHandlers) {
			serverHandlers = new Map();
			this.requestHandlers.set(server.id, serverHandlers);
		}

		const key = `${method.toUpperCase()}:${path}`;
		serverHandlers.set(key, handler as RequestHandler);
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
	 * Get request handler for a server, method, and path
	 */
	protected getRequestHandler(
		serverId: string,
		method: string,
		path: string,
	): RequestHandler | undefined {
		const serverHandlers = this.requestHandlers.get(serverId);
		if (!serverHandlers) return undefined;

		// Try exact match first
		const exactKey = `${method.toUpperCase()}:${path}`;
		const exactHandler = serverHandlers.get(exactKey);
		if (exactHandler) return exactHandler;

		// Try pattern matching (simple path params like /api/users/:id)
		for (const [key, handler] of Array.from(serverHandlers.entries())) {
			// Split only on first colon to preserve path parameters
			const colonIndex = key.indexOf(":");
			if (colonIndex === -1) continue;

			const handlerMethod = key.substring(0, colonIndex);
			const handlerPath = key.substring(colonIndex + 1);

			if (handlerMethod !== method.toUpperCase()) continue;

			if (this.matchPath(handlerPath, path)) {
				return handler;
			}
		}

		return undefined;
	}

	/**
	 * Match a path pattern against an actual path
	 * Supports simple path parameters like /api/users/:id
	 */
	protected matchPath(pattern: string, actual: string): boolean {
		const patternParts = pattern.split("/");
		const actualParts = actual.split("/");

		if (patternParts.length !== actualParts.length) return false;

		for (let i = 0; i < patternParts.length; i++) {
			const patternPart = patternParts[i];
			const actualPart = actualParts[i];

			// Path parameter (starts with : or {})
			if (
				patternPart.startsWith(":") ||
				(patternPart.startsWith("{") && patternPart.endsWith("}"))
			) {
				continue;
			}

			// Exact match required
			if (patternPart !== actualPart) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Clean up resources for a server
	 */
	protected cleanupServer(serverId: string): void {
		this.servers.delete(serverId);
		this.messageHandlers.delete(serverId);
		this.requestHandlers.delete(serverId);
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
		this.messageHandlers.clear();
		this.requestHandlers.clear();
		this.hookRegistry = undefined;
	}
}
