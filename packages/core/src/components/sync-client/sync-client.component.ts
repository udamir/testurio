/**
 * Client Component
 *
 * Represents a client that connects to a target server.
 */

import type {
	AdapterService,
	AdapterClient,
	SyncAdapter,
	Address,
	TlsConfig,
} from "../../base-adapter";
import type { ITestCaseBuilder } from "../../execution/execution.types";
import { SyncClientStepBuilder } from "./sync-client.step-builder";
import { BaseComponent } from "../../base-component";

/**
 * Client component options
 */
export interface ClientOptions<A extends SyncAdapter = SyncAdapter> {
	/** Adapter instance */
	adapter: A;
	/** Target address to connect to */
	targetAddress: Address;
	/** TLS configuration */
	tls?: TlsConfig;
}

/**
 * Client Component
 *
 * @example
 * ```typescript
 * const client = new Client("api", {
 *   adapter: new HttpAdapter(),
 *   targetAddress: { host: "localhost", port: 3000 },
 * });
 *
 * // For adapters with protocol options
 * const grpcClient = new Client("grpc-api", {
 *   adapter: new GrpcUnaryAdapter({ schema: "path/to/proto", serviceName: "MyService" }),
 *   targetAddress: { host: "localhost", port: 50051 },
 * });
 * ```
 */
export class Client<A extends SyncAdapter = SyncAdapter> extends BaseComponent<A, SyncClientStepBuilder<AdapterService<A>>> {
	private handle?: AdapterClient;
	private _requestTracker?: unknown;
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;

	constructor(name: string, options: ClientOptions<A>) {
		super(name, options.adapter);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	/**
	 * Get or create request tracker for this client
	 * Used internally by SyncClientStepBuilder to track request/response correlation
	 */
	getRequestTracker<T>(factory: () => T): T {
		if (!this._requestTracker) {
			this._requestTracker = factory();
		}
		return this._requestTracker as T;
	}

	/**
	 * Clear request tracker (called on component stop)
	 */
	clearRequestTracker(): void {
		this._requestTracker = undefined;
	}

	/**
	 * Static factory method to create a Client instance
	 *
	 * @example
	 * ```typescript
	 * const client = Client.create("api", {
 *   adapter: new HttpAdapter(),
 *   targetAddress: { host: "localhost", port: 3000 },
 * });
 * ```
 */
	static create<A extends SyncAdapter>(name: string, options: ClientOptions<A>): Client<A> {
		return new Client<A>(name, options);
	}

	/**
	 * Create a step builder for this client component
	 */
	createStepBuilder(builder: ITestCaseBuilder): SyncClientStepBuilder<AdapterService<A>> {
		return new SyncClientStepBuilder<AdapterService<A>>(this, builder);
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
	getHandle(): AdapterClient | undefined {
		return this.handle;
	}

	/**
	 * Make a request (sync protocols like HTTP, gRPC unary)
	 * @param messageType - Message type identifier (e.g., "GET /users" for HTTP, "GetUser" for gRPC)
	 * @param options - Request options (payload, metadata, timeout)
	 */
	async request<TReq = unknown, TRes = unknown>(
		messageType: string,
		options?: { payload?: TReq; metadata?: Record<string, string>; timeout?: number },
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
		return this.adapter.request<TRes>(
			this.handle,
			messageType,
			options,
		);
	}

	/**
	 * Connect to target server
	 */
	protected async doStart(): Promise<void> {
		// Register hook registry with adapter for component-based message handling
		this.adapter.setHookRegistry(this.hookRegistry);

		// Create client - adapter already has protocol configuration
		this.handle = await this.adapter.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});
	}

	/**
	 * Disconnect from server and dispose adapter
	 */
	protected async doStop(): Promise<void> {
		if (this.handle) {
			await this.adapter.closeClient(this.handle);
			this.handle = undefined;
		}

		// Dispose adapter to release all resources
		await this.adapter.dispose();

		// Clear hooks
		this.hookRegistry.clear();
	}
}
