/**
 * Server Component
 *
 * Unified component that can act as either a mock server or a proxy.
 * - Mock mode: Listens for connections and generates responses via handlers
 * - Proxy mode: Listens for connections and forwards to a target server
 *
 * Mode is determined by the presence of `targetAddress` in config:
 * - No targetAddress = mock mode
 * - With targetAddress = proxy mode
 */

import type {
	AdapterClient,
	AdapterServer,
	SyncAdapter,
	AdapterService,
	Address,
	Message,
	TlsConfig,
} from "../../base-adapter";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { SyncServerStepBuilder } from "./sync-server.step-builder";
import { BaseComponent } from "../../base-component";

/**
 * Server component options
 */
export interface ServerOptions<A extends SyncAdapter = SyncAdapter> {
	/** Adapter instance (contains all protocol configuration) */
	adapter: A;
	/** Address to listen on */
	listenAddress: Address;
	/** Target address to forward to (if present, enables proxy mode) */
	targetAddress?: Address;
	/** TLS configuration */
	tls?: TlsConfig;
	/** Default behavior when no handler matches (mock mode only) */
	defaultBehavior?: "error" | "forward" | "handler";
	/** Default handler function (mock mode only) */
	defaultHandler?: (request: unknown) => unknown | Promise<unknown>;
}

/**
 * Server Component
 *
 * Unified mock/proxy component.
 *
 * @example Mock mode:
 * ```typescript
 * const server = new Server("backend", {
 *   adapter: new HttpAdapter(),
 *   listenAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 *
 * @example Proxy mode:
 * ```typescript
 * const proxy = new Server("gateway", {
 *   adapter: new HttpAdapter(),
 *   listenAddress: { host: "localhost", port: 3001 },
 *   targetAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 */
export class Server<A extends SyncAdapter = SyncAdapter> extends BaseComponent<A, SyncServerStepBuilder<AdapterService<A>>> {
	private serverHandle?: AdapterServer;
	private clientHandle?: AdapterClient;
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;
	private readonly _defaultBehavior?: "error" | "forward" | "handler";
	private readonly _defaultHandler?: (request: unknown) => unknown | Promise<unknown>;

	constructor(name: string, options: ServerOptions<A>) {
		super(name, options.adapter);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
		this._defaultBehavior = options.defaultBehavior;
		this._defaultHandler = options.defaultHandler;
	}

	/**
	 * Static factory method to create a Server instance
	 *
	 * @example Mock mode:
	 * ```typescript
	 * const server = Server.create("backend", {
 *   adapter: new HttpAdapter(),
 *   listenAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 *
 * @example Proxy mode:
 * ```typescript
	 * const proxy = Server.create("gateway", {
 *   adapter: new HttpAdapter(),
 *   listenAddress: { host: "localhost", port: 3001 },
 *   targetAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 */
	static create<A extends SyncAdapter>(name: string, options: ServerOptions<A>): Server<A> {
		return new Server<A>(name, options);
	}

	/**
	 * Create a step builder for this server component
	 */
	createStepBuilder(_builder: ITestCaseBuilder): SyncServerStepBuilder<AdapterService<A>> {
		return new SyncServerStepBuilder<AdapterService<A>>(this);
	}

	/**
	 * Check if running in proxy mode
	 */
	get isProxy(): boolean {
		return this._targetAddress !== undefined;
	}

	/**
	 * Get the adapter instance
	 */
	getAdapter(): SyncAdapter {
		return this.adapter;
	}

	/**
	 * Get listen address
	 */
	get listenAddress(): Address {
		return this._listenAddress;
	}

	/**
	 * Get target address (proxy mode only)
	 */
	get targetAddress(): Address | undefined {
		return this._targetAddress;
	}

	/**
	 * Get server handle
	 */
	getHandle(): AdapterServer | undefined {
		return this.serverHandle;
	}

	/**
	 * Get server handle (alias for compatibility)
	 */
	getServerHandle(): AdapterServer | undefined {
		return this.serverHandle;
	}

	/**
	 * Get client handle (proxy mode only)
	 */
	getClientHandle(): AdapterClient | undefined {
		return this.clientHandle;
	}

	/**
	 * Start the server (and client connection if proxy mode)
	 */
	protected async doStart(): Promise<void> {
		// Start server with onRequest callback to delegate request handling to this component
		this.serverHandle = await this.adapter.startServer({
			listenAddress: this._listenAddress,
			targetAddress: this._targetAddress,
			tls: this._tls,
			onRequest: (message) => this.handleIncomingRequest(message),
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
	 * Stop server and dispose adapter
	 */
	protected async doStop(): Promise<void> {
		// Stop server
		if (this.serverHandle) {
			await this.adapter.stopServer(this.serverHandle);
			this.serverHandle = undefined;
		}

		// Disconnect client (proxy mode)
		if (this.clientHandle) {
			await this.adapter.closeClient(this.clientHandle);
			this.clientHandle = undefined;
		}

		// Dispose adapter to release all resources
		await this.adapter.dispose();

		// Clear hooks
		this.hookRegistry.clear();
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
				this._defaultBehavior === "handler" &&
				this._defaultHandler
			) {
				const response = await this._defaultHandler(message.payload);
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

	/**
	 * Forward request to target (sync protocols, proxy mode)
	 * @param messageType - Message type identifier (e.g., "GET /users" for HTTP, "GetUser" for gRPC)
	 * @param options - Request options (payload, metadata, timeout)
	 */
	async forwardRequest<TReq = unknown, TRes = unknown>(
		messageType: string,
		options?: { payload?: TReq; metadata?: Record<string, string>; timeout?: number },
	): Promise<TRes> {
		if (!this.isProxy) {
			throw new Error(`Server ${this.name} is not in proxy mode`);
		}

		if (!this.adapter || !this.clientHandle) {
			throw new Error(`Server ${this.name} is not started`);
		}

		if (!this.adapter.request) {
			throw new Error(
				`Server ${this.name} adapter does not support request operation`,
			);
		}

		return this.adapter.request<TRes>(
			this.clientHandle,
			messageType,
			options,
		);
	}
}
