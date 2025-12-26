/**
 * Async Server Component
 *
 * Represents a server for async protocols (WebSocket, TCP, gRPC Stream).
 * Unlike the sync Server, this component is designed for message-based
 * bidirectional communication.
 */

import type {
	AdapterClient,
	AdapterServer,
	AsyncAdapter,
	AdapterMessages,
	Address,
	Message,
	TlsConfig,
} from "../../base-adapter";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { AsyncServerStepBuilder } from "./async-server.step-builder";
import { BaseComponent } from "../../base-component";

/**
 * Async server component options
 */
export interface AsyncServerOptions<A extends AsyncAdapter = AsyncAdapter> {
	/** Adapter instance (contains all protocol configuration) */
	adapter: A;
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
export class AsyncServer<
	A extends AsyncAdapter = AsyncAdapter,
> extends BaseComponent<A, AsyncServerStepBuilder<AdapterMessages<A>, Record<string, unknown>>> {
	/**
	 * Phantom type property for type inference.
	 * This property is never assigned at runtime - it exists only for TypeScript.
	 * Used by `test.use(component)` to infer message types.
	 */
	declare readonly __types: {
		messages: AdapterMessages<A>;
	};

	private serverHandle?: AdapterServer;
	private clientHandle?: AdapterClient;
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;

	constructor(name: string, options: AsyncServerOptions<A>) {
		super(name, options.adapter);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	/**
	 * Static factory method to create an AsyncServer instance
	 */
	static create<A extends AsyncAdapter>(
		name: string,
		options: AsyncServerOptions<A>,
	): AsyncServer<A> {
		return new AsyncServer<A>(name, options);
	}

	/**
	 * Create a step builder for this async server component
	 */
	createStepBuilder<TContext extends Record<string, unknown>>(
		builder: ITestCaseBuilder<TContext>,
	): AsyncServerStepBuilder<AdapterMessages<A>, TContext> {
		return new AsyncServerStepBuilder<AdapterMessages<A>, TContext>(
			this,
			builder,
		);
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
	 * Get server handle
	 */
	getServerHandle(): AdapterServer | undefined {
		return this.serverHandle;
	}

	/**
	 * Get client handle (for proxy mode)
	 */
	getClientHandle(): AdapterClient | undefined {
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
		this.adapter.setHookRegistry(this.hookRegistry);

		// Start server
		this.serverHandle = await this.adapter.startServer({
			listenAddress: this._listenAddress,
			targetAddress: this._targetAddress,
			tls: this._tls,
		});

		// If proxy mode, create client connection to target
		if (this._targetAddress) {
			this.clientHandle = await this.adapter.createClient({
				targetAddress: this._targetAddress,
				tls: this._tls,
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
