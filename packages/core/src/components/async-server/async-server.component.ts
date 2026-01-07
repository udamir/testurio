/**
 * Async Server Component (v2)
 *
 * Represents a server for async protocols (WebSocket, TCP, gRPC Stream).
 * Uses connection wrappers for message handling.
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import type {
	Address,
	IAsyncClientAdapter,
	IAsyncProtocol,
	IAsyncServerAdapter,
	Message,
	TlsConfig,
} from "../../protocols/base";
import { BaseComponent } from "../base";
import { AsyncServerStepBuilder } from "./async-server.step-builder";

/**
 * Session for proxy mode - links incoming client to outgoing backend connection
 */
interface Session {
	id: string;
	incoming: IAsyncClientAdapter;
	outgoing?: IAsyncClientAdapter;
	/** Promise that resolves when outgoing connection is established */
	outgoingConnected?: Promise<boolean>;
}

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
	/** Timeout for establishing proxy connection (ms). Default: 30000 */
	proxyConnectionTimeout?: number;
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
export class AsyncServer<P extends IAsyncProtocol = IAsyncProtocol> extends BaseComponent<
	P,
	AsyncServerStepBuilder<P>
> {
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;
	private readonly _proxyConnectionTimeout: number;

	/** Server adapter */
	private _serverAdapter?: IAsyncServerAdapter;

	/** Active sessions (1:1 mapping of incoming to outgoing connections) */
	private _sessions = new Map<string, Session>();

	constructor(name: string, options: AsyncServerOptions<P>) {
		super(name, options.protocol);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
		this._proxyConnectionTimeout = options.proxyConnectionTimeout ?? 30000;
	}

	/**
	 * Static factory method to create an AsyncServer instance
	 */
	static create<P extends IAsyncProtocol>(name: string, options: AsyncServerOptions<P>): AsyncServer<P> {
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
	 * Get all active connections
	 */
	get connections(): Map<string, IAsyncClientAdapter> {
		const connections = new Map<string, IAsyncClientAdapter>();
		for (const session of this._sessions.values()) {
			connections.set(session.incoming.id, session.incoming);
		}
		return connections;
	}

	/**
	 * Send a message to all connected clients
	 */
	async send(message: Message): Promise<void> {
		if (!this.isStarted()) {
			throw new Error(`AsyncServer ${this.name} is not started`);
		}

		// Send to all connections in parallel
		const sendPromises = Array.from(this._sessions.values()).map((session) =>
			session.incoming.send(message).catch(() => {})
		);
		await Promise.all(sendPromises);
	}

	/**
	 * Start the async server
	 */
	protected async doStart(): Promise<void> {
		// Create server adapter (v3 API)
		this._serverAdapter = await this.protocol.createServer({
			listenAddress: this._listenAddress,
			tls: this._tls,
		});

		// Register connection handler
		this._serverAdapter.onConnection((connection) => this.handleConnection(connection));
	}

	/**
	 * Handle new incoming connection
	 * Note: This is called synchronously by the protocol, so we set up handlers
	 * synchronously and do async work (like proxy connection) in the background.
	 */
	private handleConnection(connection: IAsyncClientAdapter): void {
		// Create session
		const session: Session = {
			id: connection.id,
			incoming: connection,
		};
		this._sessions.set(session.id, session);

		// Setup close handler for incoming connection
		connection.onClose(() => {
			// Linked disconnect: client closes → close backend
			if (session.outgoing?.isConnected) {
				session.outgoing.close().catch(() => {});
			}
			this._sessions.delete(session.id);
		});

		// Track connection errors
		connection.onError((error: Error) => {
			this.trackUnhandledError(error);
		});

		// Set up message handler to route through hooks
		connection.onMessage(async (message: Message) => {
			try {
				// Execute hooks
				const processedMessage = await this.executeMatchingHook(message);

				// If hook produced a response (different type), send it back
				if (processedMessage && processedMessage.type !== message.type) {
					await connection.send(processedMessage);
					return;
				}

				// In proxy mode, forward to backend (wait for connection if needed)
				if (this.isProxy && processedMessage) {
					// Wait for outgoing connection to be ready
					if (!session.outgoing && session.outgoingConnected) {
						const connected = await Promise.race([
							session.outgoingConnected,
							new Promise<boolean>((resolve) => setTimeout(() => resolve(false), this._proxyConnectionTimeout)),
						]);
						if (!connected) {
							return; // Connection failed or timed out
						}
					}
					if (session.outgoing) {
						await session.outgoing.send(processedMessage);
					}
				}
			} catch (error) {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			}
		});

		// In proxy mode, create outgoing connection to backend
		if (this.isProxy && this._targetAddress) {
			// Create promise for connection establishment
			session.outgoingConnected = this.setupProxyConnection(session)
				.then(() => true)
				.catch((error) => {
					// Failed to connect to backend, close incoming connection
					console.error("Failed to setup proxy connection:", error);
					connection.close().catch(() => {});
					this._sessions.delete(session.id);
					return false;
				});
		}
	}

	/**
	 * Setup proxy connection to backend
	 */
	private async setupProxyConnection(session: Session): Promise<void> {
		if (!this._targetAddress) {
			throw new Error("Target address is required for proxy mode");
		}

		// Apply connection timeout
		const connectionPromise = this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Proxy connection timeout")), this._proxyConnectionTimeout)
		);

		session.outgoing = await Promise.race([connectionPromise, timeoutPromise]);

		// Set up backend→client event forwarding
		session.outgoing.onMessage(async (event: Message) => {
			// Process through hooks
			const processedEvent = await this.executeMatchingHook(event);

			// Forward to client (if not dropped by hooks)
			if (processedEvent && session.incoming.isConnected) {
				await session.incoming.send(processedEvent);
			}
		});

		// Linked disconnect: backend closes → close client
		session.outgoing.onClose(() => {
			if (session.incoming.isConnected) {
				session.incoming.close().catch(() => {});
			}
		});
	}

	/**
	 * Stop the async server
	 */
	protected async doStop(): Promise<void> {
		// Wait for all pending proxy connections to complete (or fail)
		// This prevents race conditions where cleanup happens while connections are being established
		const pendingConnections: Promise<boolean>[] = [];
		for (const session of this._sessions.values()) {
			if (session.outgoingConnected) {
				pendingConnections.push(session.outgoingConnected.catch(() => false));
			}
		}
		if (pendingConnections.length > 0) {
			await Promise.all(pendingConnections);
		}

		// Close all sessions (including outgoing connections)
		for (const session of this._sessions.values()) {
			if (session.outgoing?.isConnected) {
				await session.outgoing.close().catch(() => {});
			}
		}

		// Stop server adapter
		if (this._serverAdapter) {
			await this._serverAdapter.stop();
			this._serverAdapter = undefined;
		}
		this._sessions.clear();
		this.clearHooks();
	}
}
