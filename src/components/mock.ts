/**
 * Mock Component
 *
 * Represents a mock server that listens for incoming connections.
 */

import type { AdapterServerHandle, ProtocolAdapter } from "../adapters/types";
import type { Message, Address, ProtocolType } from "../types";
import type { ProtocolConfig } from "../config/protocols";
import { Component, type BaseComponentConfig } from "./component";

/**
 * Mock component configuration
 */
export interface MockComponentConfig extends BaseComponentConfig {
	/** Address to listen on */
	listenAddress: Address;
	/** Protocol configuration */
	protocol: ProtocolConfig;
	/** Default behavior when no handler matches */
	defaultBehavior?: "error" | "handler";
	/** Default handler function */
	defaultHandler?: (request: unknown) => unknown | Promise<unknown>;
}

/**
 * Mock Component
 */
export class MockComponent extends Component<MockComponentConfig> {
	private adapter?: ProtocolAdapter;
	private handle?: AdapterServerHandle;

	constructor(
		config: MockComponentConfig,
		private adapterFactory: (protocolType: ProtocolType) => ProtocolAdapter,
	) {
		super(config);
	}

	/**
	 * Get protocol type
	 */
	get protocolType(): ProtocolType {
		return this.config.protocol.getType();
	}

	/**
	 * Get listen address
	 */
	get listenAddress(): Address {
		return this.config.listenAddress;
	}

	/**
	 * Get server handle
	 */
	getHandle(): AdapterServerHandle | undefined {
		return this.handle;
	}

	/**
	 * Start listening for connections
	 */
	protected async doStart(): Promise<void> {
		const protocol = this.config.protocol;
		const schema = protocol.getSchema();
		const options = protocol.getOptions();

		// Create adapter
		this.adapter = this.adapterFactory(protocol.getType());

		// Register hook registry with adapter for component-based message handling
		if (this.adapter.setHookRegistry) {
			this.adapter.setHookRegistry(this.hookRegistry);
		}

		// Load schema if provided as string path (for gRPC proto files)
		if (typeof schema === "string" && this.adapter.loadSchema) {
			await this.adapter.loadSchema(schema);
		}

		// Start server
		this.handle = await this.adapter.startServer({
			listenAddress: this.config.listenAddress,
			schema:
				typeof schema === "string"
					? { type: "custom", content: schema, validate: false }
					: schema,
			options,
			tls: this.config.tls,
		});
	}

	/**
	 * Stop listening and dispose adapter
	 */
	protected async doStop(): Promise<void> {
		if (this.adapter && this.handle) {
			await this.adapter.stopServer(this.handle);
			this.handle = undefined;
		}

		// Dispose adapter to release all resources
		if (this.adapter) {
			await this.adapter.dispose();
			this.adapter = undefined;
		}

		// Clear hooks
		this.hookRegistry.clear();
	}

	/**
	 * Handle incoming message (async protocols)
	 * Called by the adapter when a message is received
	 */
	async handleIncomingMessage(message: Message): Promise<Message | null> {
		// Process through hooks
		const processedMessage = await this.processMessage(message);

		if (!processedMessage) {
			return null;
		}

		return processedMessage;
	}

	/**
	 * Handle incoming request (sync protocols)
	 * Called by the adapter when a request is received
	 */
	async handleIncomingRequest(message: Message): Promise<Message> {

		// Process through hooks (includes mock response generation)
		const processedMessage = await this.processMessage(message);

		if (!processedMessage) {
			// If request dropped, use default behavior
			if (
				this.config.defaultBehavior === "handler" &&
				this.config.defaultHandler
			) {
				const response = await this.config.defaultHandler(message.payload);
				return {
					type: "response",
					payload: response,
					traceId: message.traceId,
				};
			}

			// Default to error
			throw new Error(`No handler for request: ${message.type}`);
		}

		return processedMessage;
	}
}
