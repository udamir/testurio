/**
 * Client Component
 *
 * Represents a client that connects to a target server.
 */

import type { AdapterClientHandle, ProtocolAdapter } from "../adapters/types";
import type { Message, Address, ProtocolType } from "../types";
import type { ProtocolConfig } from "../config/protocols";
import { Component, type BaseComponentConfig } from "./component";

/**
 * Client component configuration
 */
export interface ClientComponentConfig extends BaseComponentConfig {
	/** Target address to connect to */
	targetAddress: Address;
	/** Protocol configuration */
	protocol: ProtocolConfig;
}

/**
 * Client Component
 */
export class Client extends Component<ClientComponentConfig> {
	private adapter?: ProtocolAdapter;
	private handle?: AdapterClientHandle;

	constructor(
		config: ClientComponentConfig,
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
	 * Send a message (async protocols)
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`Client ${this.name} is not started`);
		}

		if (!this.adapter || !this.handle) {
			throw new Error(`Client ${this.name} has no adapter`);
		}

		// Process message through hooks
		const processedMessage = await this.processMessage(message);

		// If message was dropped by hooks, don't send
		if (!processedMessage) {
			return;
		}

		// Send via adapter
		if (!this.adapter.sendMessage) {
			throw new Error(
				`Client ${this.name} adapter does not support sendMessage operation`,
			);
		}
		await this.adapter.sendMessage(
			this.handle,
			processedMessage.type,
			processedMessage.payload,
			{
				...processedMessage.metadata,
				traceId: processedMessage.traceId,
			},
		);
	}

	/**
	 * Wait for a message (async protocols)
	 */
	async waitForMessage(
		messageType: string | string[],
		matcher?: string | ((payload: unknown) => boolean),
		timeout?: number,
	): Promise<Message> {
		if (!this.isStarted()) {
			throw new Error(`Client ${this.name} is not started`);
		}

		if (!this.adapter || !this.handle) {
			throw new Error(`Client ${this.name} has no adapter`);
		}

		if (!this.adapter.waitForMessage) {
			throw new Error(
				`Client ${this.name} adapter does not support waitForMessage operation`,
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
	 * Make a request (sync protocols like HTTP, gRPC unary)
	 */
	async request<TReq = unknown, TRes = unknown>(
		method: string,
		path: string,
		payload?: TReq,
		headers?: Record<string, string>,
	): Promise<TRes> {
		if (!this.isStarted()) {
			throw new Error(`Client ${this.name} is not started`);
		}

		if (!this.adapter || !this.handle) {
			throw new Error(`Client ${this.name} has no adapter`);
		}

		// Make request via adapter
		if (!this.adapter.request) {
			throw new Error(
				`Client ${this.name} adapter does not support request operation`,
			);
		}
		return this.adapter.request<TReq, TRes>(
			this.handle,
			method,
			path,
			payload,
			headers,
		);
	}

	/**
	 * Connect to target server
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

		// Create client
		this.handle = await this.adapter.createClient({
			targetAddress: this.config.targetAddress,
			schema:
				typeof schema === "string"
					? { type: "custom", content: schema, validate: false }
					: schema,
			options,
			tls: this.config.tls,
			auth: this.config.auth,
		});
	}

	/**
	 * Disconnect from server and dispose adapter
	 */
	protected async doStop(): Promise<void> {
		if (this.adapter && this.handle) {
			await this.adapter.closeClient(this.handle);
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
}
