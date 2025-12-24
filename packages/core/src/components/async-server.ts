/**
 * Async Server Component
 *
 * Represents a server for async protocols (WebSocket, TCP, gRPC Stream).
 * Unlike the sync Server, this component is designed for message-based
 * bidirectional communication.
 */

import type {
	AdapterClientHandle,
	AdapterServerHandle,
	AsyncAdapter,
} from "../adapters/types";
import { AsyncServerStepBuilder } from "../builders/async-server-step-builder";
import type { TestCaseBuilder } from "../builders/test-case-builder";
import type { Address, Message } from "../types";
import { type BaseComponentConfig, Component } from "./component";

/**
 * Async server component options
 */
export interface AsyncServerOptions {
	/** Adapter instance (contains all protocol configuration) */
	adapter: AsyncAdapter;
	/** Address to listen on */
	listenAddress: Address;
	/** Target address to forward to (if present, enables proxy mode) */
	targetAddress?: Address;
	/** TLS configuration */
	tls?: BaseComponentConfig["tls"];
	/** Component-specific metadata */
	metadata?: BaseComponentConfig["metadata"];
}

/**
 * Internal async server component configuration
 */
export interface AsyncServerComponentConfig extends BaseComponentConfig {
	/** Adapter instance */
	adapter: AsyncAdapter;
	/** Address to listen on */
	listenAddress: Address;
	/** Target address to forward to (if present, enables proxy mode) */
	targetAddress?: Address;
}

/**
 * Async Server Component
 *
 * For async protocols: WebSocket, TCP, gRPC streaming
 *
 * @example Mock mode:
 * ```typescript
 * const wsServer = new AsyncServer("ws-backend", {
 *   adapter: new WebSocketAdapter(),
 *   listenAddress: { host: "localhost", port: 8080 },
 * });
 * ```
 *
 * @example Proxy mode:
 * ```typescript
 * const wsProxy = new AsyncServer("ws-gateway", {
 *   adapter: new WebSocketAdapter(),
 *   listenAddress: { host: "localhost", port: 8081 },
 *   targetAddress: { host: "localhost", port: 8080 },
 * });
 * ```
 */
export class AsyncServer extends Component<AsyncServerComponentConfig> {
	private adapter: AsyncAdapter;
	private serverHandle?: AdapterServerHandle;
	private clientHandle?: AdapterClientHandle;

	constructor(name: string, options: AsyncServerOptions) {
		super({ name, ...options });
		this.adapter = options.adapter;
	}

	/**
	 * Static factory method to create an AsyncServer instance
	 */
	static create(name: string, options: AsyncServerOptions): AsyncServer {
		return new AsyncServer(name, options);
	}

	/**
	 * Create a step builder for this async server component
	 */
	createStepBuilder<TContext extends Record<string, unknown>>(
		builder: TestCaseBuilder<TContext>,
	): AsyncServerStepBuilder<Record<string, unknown>, TContext> {
		return new AsyncServerStepBuilder<Record<string, unknown>, TContext>(
			this,
			builder,
		);
	}

	/**
	 * Get listen address
	 */
	get listenAddress(): Address {
		return this.config.listenAddress;
	}

	/**
	 * Get target address (for proxy mode)
	 */
	get targetAddress(): Address | undefined {
		return this.config.targetAddress;
	}

	/**
	 * Check if server is in proxy mode
	 */
	get isProxy(): boolean {
		return !!this.config.targetAddress;
	}

	/**
	 * Get server handle
	 */
	getServerHandle(): AdapterServerHandle | undefined {
		return this.serverHandle;
	}

	/**
	 * Get client handle (for proxy mode)
	 */
	getClientHandle(): AdapterClientHandle | undefined {
		return this.clientHandle;
	}

	/**
	 * Send a message to connected clients
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncServer ${this.name} is not started`);
		}

		if (!this.adapter || !this.serverHandle) {
			throw new Error(`AsyncServer ${this.name} has no adapter`);
		}

		// Process message through hooks
		const processedMessage = await this.processMessage(message);

		if (processedMessage && this.adapter.sendMessage && this.clientHandle) {
			await this.adapter.sendMessage(
				this.clientHandle,
				processedMessage.type,
				processedMessage.payload,
				processedMessage.metadata,
			);
		}
	}

	/**
	 * Start the async server
	 */
	protected async doStart(): Promise<void> {
		// Register hook registry with adapter for component-based message handling
		if (this.adapter.setHookRegistry) {
			this.adapter.setHookRegistry(this.hookRegistry);
		}

		// Start server
		this.serverHandle = await this.adapter.startServer({
			listenAddress: this.config.listenAddress,
			targetAddress: this.config.targetAddress,
			tls: this.config.tls,
		});

		// If proxy mode, create client connection to target
		if (this.config.targetAddress) {
			this.clientHandle = await this.adapter.createClient({
				targetAddress: this.config.targetAddress,
				tls: this.config.tls,
			});
		}
	}

	/**
	 * Stop the async server
	 */
	protected async doStop(): Promise<void> {
		if (this.serverHandle) {
			await this.adapter.stopServer(this.serverHandle);
			this.serverHandle = undefined;
		}
		if (this.clientHandle) {
			await this.adapter.closeClient(this.clientHandle);
			this.clientHandle = undefined;
		}
		await this.adapter.dispose();
		this.hookRegistry.clear();
	}
}
