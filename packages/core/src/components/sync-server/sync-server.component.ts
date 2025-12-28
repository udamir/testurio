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
	ISyncProtocol,
	AdapterService,
	Address,
	Message,
	TlsConfig,
} from "../../protocols/base";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { SyncServerStepBuilder } from "./sync-server.step-builder";
import { BaseComponent } from "../base";

/**
 * Server component options
 */
export interface ServerOptions<P extends ISyncProtocol = ISyncProtocol> {
	/** Adapter instance (contains all protocol configuration) */
	protocol: P;
	/** Address to listen on */
	listenAddress: Address;
	/** Target address to forward to (if present, enables proxy mode) */
	targetAddress?: Address;
	/** TLS configuration */
	tls?: TlsConfig;
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
export class Server<A extends ISyncProtocol = ISyncProtocol> extends BaseComponent<A, SyncServerStepBuilder<AdapterService<A>>> {
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;

	constructor(name: string, options: ServerOptions<A>) {
		super(name, options.protocol);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
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
	static create<A extends ISyncProtocol>(name: string, options: ServerOptions<A>): Server<A> {
		return new Server<A>(name, options);
	}

	/**
	 * Create a step builder for this server component
	 */
	createStepBuilder(builder: ITestCaseBuilder): SyncServerStepBuilder<AdapterService<A>> {
		return new SyncServerStepBuilder<AdapterService<A>>(this, builder.phase);
	}

	/**
	 * Check if running in proxy mode
	 */
	get isProxy(): boolean {
		return this._targetAddress !== undefined;
	}

	/**
	 * Start the server (and client connection if proxy mode)
	 */
	protected async doStart(): Promise<void> {
		// Start server with onRequest callback to delegate request handling to this component
		await this.protocol.startServer({ listenAddress: this._listenAddress, tls: this._tls });

		this.protocol.onRequest((message) => this.handleIncomingRequest(message));

		// If proxy mode, create client connection to target
		if (this._targetAddress) {
			await this.protocol.createClient({ targetAddress: this._targetAddress, tls: this._tls });
		}
	}

	/**
	 * Stop server and dispose adapter
	 */
	protected async doStop(): Promise<void> {
		// Stop server
		await this.protocol.stopServer();

		// Disconnect client (proxy mode)
		if (this._targetAddress) {
			await this.protocol.closeClient();
		}

		// Dispose adapter to release all resources
		await this.protocol.dispose();

		// Clear hooks
		this.hookRegistry.clear();
	}

	/**
	 * Handle incoming request (sync protocols)
	 * Called by the adapter when a request is received
	 */
	async handleIncomingRequest(message: Message): Promise<Message> {
		// Process through hooks (includes mock response generation)
		const processedMessage = await this.hookRegistry.executeHooks(message);

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

		if (!this.protocol) {
			throw new Error(`Server ${this.name} is not started`);
		}

		if (!this.protocol.request) {
			throw new Error(
				`Server ${this.name} adapter does not support request operation`,
			);
		}

		return this.protocol.request<TRes>(
			messageType,
			options,
		);
	}
}
