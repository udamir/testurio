/**
 * Client Component
 *
 * Represents a client that connects to a target server.
 */

import type { AdapterClientHandle, SyncAdapter } from "../adapters/types";
import { SyncClientStepBuilder } from "../builders/sync-client-step-builder";
import type { TestCaseBuilder } from "../builders/test-case-builder";
import type { Address } from "../types";
import { type BaseComponentConfig, Component } from "./component";

/**
 * Client component options
 */
export interface ClientOptions {
	/** Adapter instance */
	adapter: SyncAdapter;
	/** Target address to connect to */
	targetAddress: Address;
	/** TLS configuration */
	tls?: BaseComponentConfig["tls"];
	/** Authentication configuration */
	auth?: BaseComponentConfig["auth"];
	/** Component-specific metadata */
	metadata?: BaseComponentConfig["metadata"];
}

/**
 * Internal client component configuration
 */
export interface ClientComponentConfig extends BaseComponentConfig {
	/** Adapter instance */
	adapter: SyncAdapter;
	/** Target address to connect to */
	targetAddress: Address;
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
export class Client extends Component<ClientComponentConfig> {
	private adapter: SyncAdapter;
	private handle?: AdapterClientHandle;
	private _requestTracker?: unknown;

	constructor(name: string, options: ClientOptions) {
		super({ name, ...options });
		this.adapter = options.adapter;
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
	static create(name: string, options: ClientOptions): Client {
		return new Client(name, options);
	}

	/**
	 * Create a step builder for this client component
	 */
	createStepBuilder<TContext extends Record<string, unknown>>(
		builder: TestCaseBuilder<TContext>,
	): SyncClientStepBuilder<TContext> {
		return new SyncClientStepBuilder<TContext>(this, builder);
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
		if (this.adapter.setHookRegistry) {
			this.adapter.setHookRegistry(this.hookRegistry);
		}

		// Create client - adapter already has protocol configuration
		this.handle = await this.adapter.createClient({
			targetAddress: this.config.targetAddress,
			tls: this.config.tls,
			auth: this.config.auth,
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
