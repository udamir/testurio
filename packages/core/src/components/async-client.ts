/**
 * Async Client Component
 *
 * Represents a client for async protocols (WebSocket, TCP, gRPC Stream).
 * Unlike the sync Client, this component is designed for message-based
 * bidirectional communication.
 */

import type {
	AdapterClientHandle,
	AsyncAdapter,
} from "../adapters/types";
import { AsyncClientStepBuilder } from "../builders/async-client-step-builder";
import type { TestCaseBuilder } from "../builders/test-case-builder";
import type { Address, Message } from "../types";
import { type BaseComponentConfig, Component } from "./component";

/**
 * Async client component options
 */
export interface AsyncClientOptions {
	/** Adapter instance (contains all protocol configuration) */
	adapter: AsyncAdapter;
	/** Target address to connect to */
	targetAddress: Address;
	/** TLS configuration */
	tls?: BaseComponentConfig["tls"];
	/** Authentication configuration */
	auth?: BaseComponentConfig["auth"];
	/** Component-specific metadata */
	metadata?: BaseComponentConfig["metadata"];
}

/**
 * Internal async client component configuration
 */
export interface AsyncClientComponentConfig extends BaseComponentConfig {
	/** Adapter instance */
	adapter: AsyncAdapter;
	/** Target address to connect to */
	targetAddress: Address;
}

/**
 * Async Client Component
 *
 * For async protocols: WebSocket, TCP, gRPC streaming
 *
 * @example
 * ```typescript
 * const wsClient = new AsyncClient("ws-api", {
 *   adapter: new WebSocketAdapter(),
 *   targetAddress: { host: "localhost", port: 8080 },
 * });
 *
 * const tcpClient = new AsyncClient("tcp-api", {
 *   adapter: new TcpAdapter({ schema: "path/to/proto" }),
 *   targetAddress: { host: "localhost", port: 9000 },
 * });
 * ```
 */
export class AsyncClient extends Component<AsyncClientComponentConfig> {
	private adapter: AsyncAdapter;
	private handle?: AdapterClientHandle;

	constructor(name: string, options: AsyncClientOptions) {
		super({ name, ...options });
		this.adapter = options.adapter;
	}

	/**
	 * Static factory method to create an AsyncClient instance
	 */
	static create(name: string, options: AsyncClientOptions): AsyncClient {
		return new AsyncClient(name, options);
	}

	/**
	 * Create a step builder for this async client component
	 */
	createStepBuilder<TContext extends Record<string, unknown>>(
		builder: TestCaseBuilder<TContext>,
	): AsyncClientStepBuilder<Record<string, unknown>, TContext> {
		return new AsyncClientStepBuilder<Record<string, unknown>, TContext>(
			this,
			builder,
		);
	}

	/**
	 * Get target address
	 */
	get targetAddress(): Address {
		return this.config.targetAddress;
	}

	/**
	 * Get client handle
	 */
	getHandle(): AdapterClientHandle | undefined {
		return this.handle;
	}

	/**
	 * Send a message to server
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncClient ${this.name} is not started`);
		}

		if (!this.adapter || !this.handle) {
			throw new Error(`AsyncClient ${this.name} has no adapter`);
		}

		// Process message through hooks
		const processedMessage = await this.processMessage(message);

		if (processedMessage && this.adapter.sendMessage) {
			await this.adapter.sendMessage(
				this.handle,
				processedMessage.type,
				processedMessage.payload,
				processedMessage.metadata,
			);
		}
	}

	/**
	 * Wait for a message from server
	 */
	async waitForMessage(
		messageType: string | string[],
		matcher?: (payload: unknown) => boolean,
		timeout?: number,
	): Promise<Message> {
		if (!this.isStarted()) {
			throw new Error(`AsyncClient ${this.name} is not started`);
		}

		if (!this.adapter || !this.handle) {
			throw new Error(`AsyncClient ${this.name} has no adapter`);
		}

		if (!this.adapter.waitForMessage) {
			throw new Error(
				`Adapter for ${this.name} does not support waitForMessage`,
			);
		}

		return this.adapter.waitForMessage(
			this.handle,
			messageType,
			matcher,
			timeout,
		);
	}

	/**
	 * Start the async client
	 */
	protected async doStart(): Promise<void> {
		// Register hook registry with adapter for component-based message handling
		if (this.adapter.setHookRegistry) {
			this.adapter.setHookRegistry(this.hookRegistry);
		}

		// Create client connection
		this.handle = await this.adapter.createClient({
			targetAddress: this.config.targetAddress,
			tls: this.config.tls,
			auth: this.config.auth,
		});
	}

	/**
	 * Stop the async client
	 */
	protected async doStop(): Promise<void> {
		if (this.handle) {
			await this.adapter.closeClient(this.handle);
			this.handle = undefined;
		}
		await this.adapter.dispose();
		this.hookRegistry.clear();
	}
}
