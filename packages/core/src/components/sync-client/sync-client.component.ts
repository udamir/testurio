/**
 * Client Component
 *
 * Represents a client that connects to a target server.
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import type { Address, ISyncClientAdapter, ISyncProtocol, TlsConfig } from "../../protocols/base";
import { ServiceComponent } from "../base";
import { SyncClientStepBuilder } from "./sync-client.step-builder";

/**
 * Client component options
 */
export interface ClientOptions<A extends ISyncProtocol = ISyncProtocol> {
	/** Protocol instance */
	protocol: A;
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
 *   protocol: new HttpProtocol(),
 *   targetAddress: { host: "localhost", port: 3000 },
 * });
 *
 * // For protocols with options
 * const grpcClient = new Client("grpc-api", {
 *   protocol: new GrpcProtocol({ schema: "path/to/proto", serviceName: "MyService" }),
 *   targetAddress: { host: "localhost", port: 50051 },
 * });
 * ```
 */
export class Client<P extends ISyncProtocol = ISyncProtocol> extends ServiceComponent<P, SyncClientStepBuilder<P>> {
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;

	/** Client adapter (v3 API) */
	private _clientAdapter?: ISyncClientAdapter;

	constructor(name: string, options: ClientOptions<P>) {
		super(name, options.protocol);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	/**
	 * Static factory method to create a Client instance
	 *
	 * @example
	 * ```typescript
	 * const client = Client.create("api", {
	 *   protocol: new HttpProtocol(),
	 *   targetAddress: { host: "localhost", port: 3000 },
	 * });
	 * ```
	 */
	static create<A extends ISyncProtocol>(name: string, options: ClientOptions<A>): Client<A> {
		return new Client<A>(name, options);
	}

	/**
	 * Create a step builder for this client component
	 */
	createStepBuilder(builder: ITestCaseBuilder): SyncClientStepBuilder<P> {
		return new SyncClientStepBuilder<P>(this, builder);
	}

	/**
	 * Get target address
	 */
	get targetAddress(): Address {
		return this._targetAddress;
	}

	/**
	 * Make a request (sync protocols like HTTP, gRPC unary)
	 * @param messageType - Message type identifier (e.g., "GET /users" for HTTP, "GetUser" for gRPC)
	 * @param options - Request options (payload, metadata, timeout)
	 * @returns Response payload directly (protocol-specific format)
	 */
	async request(messageType: string, data?: P["$request"], timeout?: number): Promise<P["$response"]> {
		if (!this.isStarted()) {
			throw new Error(`Client ${this.name} is not started`);
		}

		if (!this._clientAdapter) {
			throw new Error(`Client ${this.name} has no client adapter`);
		}

		return this._clientAdapter.request(messageType, data, timeout);
	}

	/**
	 * Connect to target server
	 */
	protected async doStart(): Promise<void> {
		// Create client adapter (v3 API)
		this._clientAdapter = await this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});
	}

	/**
	 * Disconnect from server
	 */
	protected async doStop(): Promise<void> {
		if (this._clientAdapter) {
			await this._clientAdapter.close();
			this._clientAdapter = undefined;
		}
		this.clearHooks();
	}
}
