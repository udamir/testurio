/**
 * Async Client Component
 *
 * Represents a client for async protocols (WebSocket, TCP, gRPC Stream).
 * Unlike the sync Client, this component is designed for message-based
 * bidirectional communication.
 */

import type {
	IAsyncProtocol,
	Address,
	Message,
	TlsConfig,
} from "../../protocols/base";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { AsyncClientStepBuilder } from "./async-client.step-builder";
import { BaseComponent } from "../base";

/**
 * Async client component options
 */
export interface AsyncClientOptions<A extends IAsyncProtocol = IAsyncProtocol> {
	/** Protocol instance (contains all protocol configuration) */
	protocol: A;
	/** Target address to connect to */
	targetAddress: Address;
	/** TLS configuration */
	tls?: TlsConfig;
}

/**
 * Async Client Component
 *
 * For async protocols: WebSocket, TCP, gRPC streaming
 *
 * @example
 * ```typescript
 * const wsClient = new AsyncClient("ws-api", {
 *   protocol: new WebSocketProtocol(),
 *   targetAddress: { host: "localhost", port: 8080 },
 * });
 *
 * const tcpClient = new AsyncClient("tcp-api", {
 *   protocol: new TcpProtocol({ schema: "path/to/proto" }),
 *   targetAddress: { host: "localhost", port: 9000 },
 * });
 * ```
 */
export class AsyncClient<P extends IAsyncProtocol = IAsyncProtocol> extends BaseComponent<P, AsyncClientStepBuilder<P>> {

	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;

	constructor(name: string, options: AsyncClientOptions<P>) {
		super(name, options.protocol);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	/**
	 * Static factory method to create an AsyncClient instance
	 */
	static create<P extends IAsyncProtocol>(
		name: string,
		options: AsyncClientOptions<P>,
	): AsyncClient<P> {
		return new AsyncClient<P>(name, options);
	}

	/**
	 * Create a step builder for this async client component
	 */
	createStepBuilder(builder: ITestCaseBuilder): AsyncClientStepBuilder<P> {
		return new AsyncClientStepBuilder<P>(this, builder);
	}

	/**
	 * Get target address
	 */
	get targetAddress(): Address {
		return this._targetAddress;
	}

	/**
	 * Send a message to server
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncClient ${this.name} is not started`);
		}

		if (!this.protocol) {
			throw new Error(`AsyncClient ${this.name} has no protocol`);
		}

		// Process message through hooks
		const processedMessage = await this.hookRegistry.executeHooks(message);

		if (processedMessage && this.protocol.sendMessage) {
			await this.protocol.sendMessage(
				processedMessage.type,
				processedMessage.payload,
				processedMessage.traceId,
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

		if (!this.protocol) {
			throw new Error(`AsyncClient ${this.name} has no protocol`);
		}

		if (!this.protocol.waitForMessage) {
			throw new Error(
				`Protocol for ${this.name} does not support waitForMessage`,
			);
		}

		return this.protocol.waitForMessage(
			messageType,
			matcher,
			timeout,
		);
	}

	/**
	 * Start the async client
	 */
	protected async doStart(): Promise<void> {
		// Register hook registry with protocol for component-based message handling
		this.protocol.setHookRegistry(this.hookRegistry);

		// Create client connection
		await this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});
	}

	/**
	 * Stop the async client
	 */
	protected async doStop(): Promise<void> {
		await this.protocol.closeClient();
		await this.protocol.dispose();
		this.hookRegistry.clear();
	}
}
