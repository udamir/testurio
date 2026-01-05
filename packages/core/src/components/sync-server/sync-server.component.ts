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
	ISyncServerAdapter,
	ISyncClientAdapter,
	Address,
	TlsConfig,
} from "../../protocols/base";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { SyncServerStepBuilder } from "./sync-server.step-builder";
import { BaseComponent } from "../base";

/**
 * Server component options
 */
export interface ServerOptions<P extends ISyncProtocol = ISyncProtocol> {
	/** Protocol instance (contains all protocol configuration) */
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
 *   protocol: new HttpProtocol(),
 *   listenAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 *
 * @example Proxy mode:
 * ```typescript
 * const proxy = new Server("gateway", {
 *   protocol: new HttpProtocol(),
 *   listenAddress: { host: "localhost", port: 3001 },
 *   targetAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 */
export class Server<A extends ISyncProtocol = ISyncProtocol> extends BaseComponent<A, SyncServerStepBuilder<A>> {
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;

	/** Server adapter (v3 API) */
	private _serverAdapter?: ISyncServerAdapter;
	/** Client adapter for proxy mode (v3 API) */
	private _clientAdapter?: ISyncClientAdapter;

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
 *   protocol: new HttpProtocol(),
 *   listenAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 *
 * @example Proxy mode:
 * ```typescript
	 * const proxy = Server.create("gateway", {
 *   protocol: new HttpProtocol(),
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
	createStepBuilder(builder: ITestCaseBuilder): SyncServerStepBuilder<A> {
		return new SyncServerStepBuilder<A>(this, builder.phase);
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
		// Create server adapter (v3 API)
		this._serverAdapter = await this.protocol.createServer({ listenAddress: this._listenAddress, tls: this._tls });

		// Set request handler to delegate request handling to this component
		this._serverAdapter.onRequest((messageType, request) => this.handleIncomingRequest(messageType, request));

		// If proxy mode, create client connection to target
		if (this._targetAddress) {
			this._clientAdapter = await this.protocol.createClient({ targetAddress: this._targetAddress, tls: this._tls });
		}
	}

	/**
	 * Stop server and dispose protocol
	 */
	protected async doStop(): Promise<void> {
		// Stop server adapter
		if (this._serverAdapter) {
			await this._serverAdapter.stop();
			this._serverAdapter = undefined;
		}

		// Disconnect client adapter (proxy mode)
		if (this._clientAdapter) {
			await this._clientAdapter.close();
			this._clientAdapter = undefined;
		}

		// Clear hooks
		this.hookRegistry.clear();
	}

	/**
	 * Handle incoming request (sync protocols)
	 * Called by the protocol when a request is received
	 */
	async handleIncomingRequest(messageType: string, request: A["$request"]): Promise<A["$response"] | null> {
		// Process through hooks (includes mock response generation)
		const processedMessage = await this.hookRegistry.executeHooks({ type: messageType, payload: request });

		// If message was dropped by a hook, return null
		if (!processedMessage) {
			return null;
		}

		// If a hook produced a response, return the payload directly
		if (processedMessage.type === "response") {
			return processedMessage.payload as A["$response"];
		}

		// No hook produced a response - check if we're in proxy mode
		if (this.isProxy) {
			// Forward to target server
			return this.forwardRequest(processedMessage.type, processedMessage.payload);
		}

		// Mock mode with no handler - return null to let protocol send default 404
		return null;
	}

	/**
	 * Forward request to target (sync protocols, proxy mode)
	 * @param messageType - Message type identifier (e.g., "GET /users" for HTTP, "GetUser" for gRPC)
	 * @param options - Request options (payload, metadata, timeout)
	 * @returns Response body directly (protocol-agnostic)
	 */
	async forwardRequest(
		messageType: string,
		data?: A["$request"],
	): Promise<A["$response"]> {
		if (!this.isProxy) {
			throw new Error(`Server ${this.name} is not in proxy mode`);
		}

		if (!this._clientAdapter) {
			throw new Error(`Server ${this.name} is not started or has no client adapter`);
		}

		return this._clientAdapter.request(messageType, data);
	}
}
