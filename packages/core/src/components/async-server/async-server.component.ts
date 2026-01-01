/**
 * Async Server Component
 *
 * Represents a server for async protocols (WebSocket, TCP, gRPC Stream).
 * Unlike the sync Server, this component is designed for message-based
 * bidirectional communication.
 */

import type {
	IAsyncProtocol,
	Address,
	Message,
	TlsConfig,
} from "../../protocols/base";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { AsyncServerStepBuilder } from "./async-server.step-builder";
import { BaseComponent } from "../base";

/**
 * Async server component options
 */
export interface AsyncServerOptions<A extends IAsyncProtocol = IAsyncProtocol> {
	/** Protocol instance (contains all protocol configuration) */
	protocol: A;
	/** Address to listen on */
	listenAddress: Address;
	/** Target address to forward to (if present, enables proxy mode) */
	targetAddress?: Address;
	/** TLS configuration */
	tls?: TlsConfig;
}

/**
 * Async Server Component
 *
 * For async protocols: WebSocket, TCP, gRPC streaming
 *
 * @example Mock mode:
 * ```typescript
 * const wsServer = new AsyncServer("ws-backend", {
 *   protocol: new WebSocketProtocol(),
 *   listenAddress: { host: "localhost", port: 8080 },
 * });
 * ```
 *
 * @example Proxy mode:
 * ```typescript
 * const wsProxy = new AsyncServer("ws-gateway", {
 *   protocol: new WebSocketProtocol(),
 *   listenAddress: { host: "localhost", port: 8081 },
 *   targetAddress: { host: "localhost", port: 8080 },
 * });
 * ```
 */
export class AsyncServer<P extends IAsyncProtocol = IAsyncProtocol> extends BaseComponent<P, AsyncServerStepBuilder<P>> {
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;

	constructor(name: string, options: AsyncServerOptions<P>) {
		super(name, options.protocol);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	/**
	 * Static factory method to create an AsyncServer instance
	 */
	static create<P extends IAsyncProtocol>(
		name: string,
		options: AsyncServerOptions<P>,
	): AsyncServer<P> {
		return new AsyncServer<P>(name, options);
	}

	/**
	 * Create a step builder for this async server component
	 */
	createStepBuilder(builder: ITestCaseBuilder): AsyncServerStepBuilder<P> {
		return new AsyncServerStepBuilder<P>(this, builder);
	}

	/**
	 * Get listen address
	 */
	get listenAddress(): Address {
		return this._listenAddress;
	}

	/**
	 * Get target address (for proxy mode)
	 */
	get targetAddress(): Address | undefined {
		return this._targetAddress;
	}

	/**
	 * Check if server is in proxy mode
	 */
	get isProxy(): boolean {
		return !!this._targetAddress;
	}

	/**
	 * Send a message to connected clients
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncServer ${this.name} is not started`);
		}

		if (!this.protocol) {
			throw new Error(`AsyncServer ${this.name} has no protocol`);
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
	 * Start the async server
	 */
	protected async doStart(): Promise<void> {
		// Register hook registry with protocol for component-based message handling
		this.protocol.setHookRegistry(this.hookRegistry);

		// Start server
		await this.protocol.startServer({
			listenAddress: this._listenAddress,
			tls: this._tls,
		});

		// If proxy mode, create client connection to target
		if (this._targetAddress) {
			await this.protocol.createClient({
				targetAddress: this._targetAddress,
				tls: this._tls,
			});
		}
	}

	/**
	 * Stop the async server
	 */
	protected async doStop(): Promise<void> {
		await this.protocol.stopServer();
		if (this._targetAddress) {
			await this.protocol.closeClient();
		}
		await this.protocol.dispose();
		this.hookRegistry.clear();
	}
}
