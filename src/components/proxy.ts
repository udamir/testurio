/**
 * Proxy Component
 *
 * Represents a proxy that listens for connections and forwards to a target.
 */

import type {
	AdapterClientHandle,
	AdapterServerHandle,
	ProtocolAdapter,
} from "../adapters/types";
import type { Message, Address, ProtocolType } from "../types";
import type { ProtocolConfig } from "../config/protocols";
import { Component, type BaseComponentConfig } from "./component";

/**
 * Proxy component configuration
 */
export interface ProxyComponentConfig extends BaseComponentConfig {
	/** Address to listen on */
	listenAddress: Address;
	/** Target address to forward to */
	targetAddress: Address;
	/** Protocol configuration */
	protocol: ProtocolConfig;
}

/**
 * Proxy Component
 */
export class ProxyComponent extends Component<ProxyComponentConfig> {
	private adapter?: ProtocolAdapter;
	private serverHandle?: AdapterServerHandle;
	private clientHandle?: AdapterClientHandle;

	constructor(
		config: ProxyComponentConfig,
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
	 * Get target address
	 */
	get targetAddress(): Address {
		return this.config.targetAddress;
	}

	/**
	 * Get server handle
	 */
	getServerHandle(): AdapterServerHandle | undefined {
		return this.serverHandle;
	}

	/**
	 * Get client handle
	 */
	getClientHandle(): AdapterClientHandle | undefined {
		return this.clientHandle;
	}

	/**
	 * Start proxy (listen and connect to target)
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

		// Start server (proxy mode with target address)
		this.serverHandle = await this.adapter.startServer({
			listenAddress: this.config.listenAddress,
			targetAddress: this.config.targetAddress,
			schema:
				typeof schema === "string"
					? { type: "custom", content: schema, validate: false }
					: schema,
			options,
			tls: this.config.tls,
		});

		// Create client connection to target
		this.clientHandle = await this.adapter.createClient({
			targetAddress: this.config.targetAddress,
			schema:
				typeof schema === "string"
					? { type: "custom", content: schema, validate: false }
					: schema,
			options,
			tls: this.config.tls,
		});
	}

	/**
	 * Stop proxy and dispose adapter
	 */
	protected async doStop(): Promise<void> {
		// Stop server
		if (this.adapter && this.serverHandle) {
			await this.adapter.stopServer(this.serverHandle);
			this.serverHandle = undefined;
		}

		// Disconnect client
		if (this.adapter && this.clientHandle) {
			await this.adapter.closeClient(this.clientHandle);
			this.clientHandle = undefined;
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
	 * Forward message to target (async protocols)
	 */
	async forwardMessage(message: Message): Promise<void> {
		if (!this.adapter || !this.clientHandle) {
			throw new Error(`Proxy ${this.name} is not started`);
		}

		// Process through hooks (inbound)
		const processedMessage = await this.processMessage({
			...message,
			metadata: {
				...message.metadata,
				direction: "inbound",
			},
		});

		if (!processedMessage) {
			return;
		}

		// Forward to target
		if (this.adapter.sendMessage) {
			await this.adapter.sendMessage(
				this.clientHandle,
				processedMessage.type,
				processedMessage.payload,
				processedMessage.metadata,
			);
		}
	}

	/**
	 * Forward request to target (sync protocols)
	 */
	async forwardRequest<TReq = unknown, TRes = unknown>(
		method: string,
		path: string,
		payload?: TReq,
		headers?: Record<string, string>,
	): Promise<TRes> {
		if (!this.adapter || !this.clientHandle) {
			throw new Error(`Proxy ${this.name} is not started`);
		}

		if (!this.adapter.request) {
			throw new Error(
				`Proxy ${this.name} adapter does not support request operation`,
			);
		}

		return this.adapter.request<TReq, TRes>(
			this.clientHandle,
			method,
			path,
			payload,
			headers,
		);
	}
}
