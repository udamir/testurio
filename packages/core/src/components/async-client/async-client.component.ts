/**
 * Async Client Component (v2)
 *
 * Represents a client for async protocols (WebSocket, TCP, gRPC Stream).
 * Uses connection wrappers for message handling.
 */

import type { ITestCaseBuilder } from "../../execution";
import type { Address, IAsyncClientAdapter, IAsyncProtocol, Message, TlsConfig } from "../../protocols/base";
import { ServiceComponent } from "../base";
import { AsyncClientStepBuilder } from "./async-client.step-builder";

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
	/** Timeout for establishing connection (ms). Default: 30000 */
	connectionTimeout?: number;
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
/** Pending message request for waitForMessage */
interface PendingMessage {
	types: string[];
	matcher?: (payload: unknown) => boolean;
	resolve: (message: Message) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

export class AsyncClient<P extends IAsyncProtocol = IAsyncProtocol> extends ServiceComponent<
	P,
	AsyncClientStepBuilder<P>
> {
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;
	private readonly _connectionTimeout: number;

	/** Client adapter */
	private _connection?: IAsyncClientAdapter;

	/** Pending messages waiting for response */
	private pendingMessages: PendingMessage[] = [];

	constructor(name: string, options: AsyncClientOptions<P>) {
		super(name, options.protocol);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
		this._connectionTimeout = options.connectionTimeout ?? 3000;
	}

	/**
	 * Static factory method to create an AsyncClient instance
	 */
	static create<P extends IAsyncProtocol>(name: string, options: AsyncClientOptions<P>): AsyncClient<P> {
		return new AsyncClient<P>(name, options);
	}

	/**
	 * Create a step builder for this async client component
	 */
	createStepBuilder(builder: ITestCaseBuilder): AsyncClientStepBuilder<P> {
		return new AsyncClientStepBuilder<P>(this, builder);
	}

	/**
	 * Get the client connection
	 */
	get connection(): IAsyncClientAdapter | undefined {
		return this._connection;
	}

	/**
	 * Send a message to server
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncClient ${this.name} is not started`);
		}

		if (!this._connection) {
			throw new Error(`AsyncClient ${this.name} has no connection`);
		}

		await this._connection.send(message);
	}

	/**
	 * Wait for a message from server
	 */
	waitForMessage(
		messageType: string | string[],
		matcher?: (payload: unknown) => boolean,
		timeout = 1000
	): Promise<Message> {
		if (!this.isStarted()) {
			return Promise.reject(new Error(`AsyncClient ${this.name} is not started`));
		}

		if (!this._connection) {
			return Promise.reject(new Error(`AsyncClient ${this.name} has no connection`));
		}

		const types = Array.isArray(messageType) ? messageType : [messageType];

		// Register pending handler - message must arrive after this call
		return new Promise<Message>((resolve, reject) => {
			const timeoutHandle = setTimeout(() => {
				const index = this.pendingMessages.findIndex((p) => p.resolve === resolve);
				if (index >= 0) {
					this.pendingMessages.splice(index, 1);
				}
				reject(new Error(`Timeout waiting for message type: ${types.join(", ")}`));
			}, timeout);

			this.pendingMessages.push({
				types,
				matcher,
				resolve,
				reject,
				timeout: timeoutHandle,
			});
		});
	}

	/**
	 * Start the async client
	 */
	protected async doStart(): Promise<void> {
		// Create client adapter with timeout
		const connectionPromise = this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Connection timeout")), this._connectionTimeout)
		);

		this._connection = await Promise.race([connectionPromise, timeoutPromise]);

		// Set up message handler to route through hooks
		this._connection.onMessage(async (event: Message) => {
			try {
				// Process through hooks
				const processedEvent = await this.executeMatchingHook(event);

				if (processedEvent) {
					// Find matching pending handler
					const pendingIndex = this.pendingMessages.findIndex((pending) => {
						if (!pending.types.includes(processedEvent.type)) return false;
						if (!pending.matcher) return true;
						return pending.matcher(processedEvent.payload);
					});

					if (pendingIndex >= 0) {
						const pending = this.pendingMessages.splice(pendingIndex, 1)[0];
						clearTimeout(pending.timeout);
						pending.resolve(processedEvent);
					}
					// No queue - messages without handlers are discarded
				}
			} catch (error) {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			}
		});

		// Track connection errors
		this._connection.onError((error: Error) => {
			this.trackUnhandledError(error);
		});
	}

	/**
	 * Stop the async client
	 */
	protected async doStop(): Promise<void> {
		// Reject all pending messages
		const error = new Error("Connection closed");
		for (const pending of this.pendingMessages) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pendingMessages = [];

		if (this._connection) {
			await this._connection.close();
			this._connection = undefined;
		}
		this.clearHooks();
	}
}
