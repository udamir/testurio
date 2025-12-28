/**
 * Async Client Component
 *
 * Represents a client for async protocols (WebSocket, TCP, gRPC Stream).
 * Unlike the sync Client, this component is designed for message-based
 * bidirectional communication.
 */

import type {
	AdapterMessages,
	ClientAdapter,
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
	/** Adapter instance (contains all protocol configuration) */
	adapter: A;
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
export class AsyncClient<
	A extends IAsyncProtocol = IAsyncProtocol,
> extends BaseComponent<A, AsyncClientStepBuilder<AdapterMessages<A>, Record<string, unknown>>> {
	/**
	 * Phantom type property for type inference.
	 * This property is never assigned at runtime - it exists only for TypeScript.
	 * Used by `test.use(component)` to infer message types.
	 */
	declare readonly __types: {
		messages: AdapterMessages<A>;
	};

	private handle?: ClientAdapter;
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;

	constructor(name: string, options: AsyncClientOptions<A>) {
		super(name, options.adapter);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	/**
	 * Static factory method to create an AsyncClient instance
	 */
	static create<A extends IAsyncProtocol>(
		name: string,
		options: AsyncClientOptions<A>,
	): AsyncClient<A> {
		return new AsyncClient<A>(name, options);
	}

	/**
	 * Create a step builder for this async client component
	 */
	createStepBuilder<TContext extends Record<string, unknown>>(
		builder: ITestCaseBuilder<TContext>,
	): AsyncClientStepBuilder<AdapterMessages<A>, TContext> {
		return new AsyncClientStepBuilder<AdapterMessages<A>, TContext>(
			this,
			builder,
		);
	}

	/**
	 * Get target address
	 */
	get targetAddress(): Address {
		return this._targetAddress;
	}

	/**
	 * Get client handle
	 */
	getHandle(): ClientAdapter | undefined {
		return this.handle;
	}

	/**
	 * Send a message to server
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncClient ${this.name} is not started`);
		}

		if (!this.protocol || !this.handle) {
			throw new Error(`AsyncClient ${this.name} has no adapter`);
		}

		// Process message through hooks
		const processedMessage = await this.processMessage(message);

		if (processedMessage && this.protocol.sendMessage) {
			await this.protocol.sendMessage(
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

		if (!this.protocol || !this.handle) {
			throw new Error(`AsyncClient ${this.name} has no adapter`);
		}

		if (!this.protocol.waitForMessage) {
			throw new Error(
				`Adapter for ${this.name} does not support waitForMessage`,
			);
		}

		return this.protocol.waitForMessage(
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
		this.protocol.setHookRegistry(this.hookRegistry);

		// Create client connection
		this.handle = await this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});
	}

	/**
	 * Stop the async client
	 */
	protected async doStop(): Promise<void> {
		if (this.handle) {
			await this.protocol.closeClient(this.handle);
			this.handle = undefined;
		}
		await this.protocol.dispose();
		this.hookRegistry.clear();
	}
}
