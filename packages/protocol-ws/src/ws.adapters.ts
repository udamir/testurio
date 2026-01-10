/**
 * WebSocket Protocol Adapters
 *
 * Server and client adapters for WebSocket protocol.
 */

import type { Codec, IAsyncClientAdapter, IAsyncServerAdapter, Message } from "testurio";
import { CodecError, defaultJsonCodec } from "testurio";
import { WebSocket, WebSocketServer } from "ws";

/**
 * WebSocket Server Adapter
 * Wraps WebSocketServer instance, owned by component
 */
export class WsServerAdapter implements IAsyncServerAdapter {
	private server: WebSocketServer;
	private connectionHandler?: (connection: IAsyncClientAdapter) => void;
	private connections = new Map<string, WsClientAdapter>();
	private connectionCounter = 0;
	private serverErrorHandler?: (error: Error) => void;
	private lastError?: Error;
	private codec: Codec<string | Uint8Array>;

	constructor(server: WebSocketServer, codec?: Codec<string | Uint8Array>) {
		this.server = server;
		this.codec = codec ?? defaultJsonCodec;
	}

	/**
	 * Get the last error that occurred on this adapter
	 */
	get error(): Error | undefined {
		return this.lastError;
	}

	/**
	 * Create and start WebSocket server adapter
	 * @param host - Host to listen on
	 * @param port - Port to listen on
	 * @param codec - Optional codec for message encoding/decoding
	 */
	static async create(host: string, port: number, codec?: Codec<string | Uint8Array>): Promise<WsServerAdapter> {
		return new Promise((resolve, reject) => {
			const server = new WebSocketServer({ host, port });
			const adapter = new WsServerAdapter(server, codec);
			let started = false;

			server.on("connection", (socket) => {
				const connId = `ws-${++adapter.connectionCounter}`;
				const clientAdapter = new WsClientAdapter(socket, connId, adapter.codec);
				adapter.connections.set(connId, clientAdapter);

				socket.on("close", () => {
					adapter.connections.delete(connId);
				});

				socket.on("error", (err) => {
					// Track client socket errors on the server adapter
					adapter.lastError = err;
					adapter.serverErrorHandler?.(err);
				});

				adapter.connectionHandler?.(clientAdapter);
			});

			server.on("error", (err) => {
				adapter.lastError = err;
				if (!started) {
					// Error during startup - reject the promise
					reject(err);
				} else {
					// Error after startup - call error handler
					adapter.serverErrorHandler?.(err);
				}
			});

			server.on("listening", () => {
				started = true;
				resolve(adapter);
			});
		});
	}

	onConnection(handler: (connection: IAsyncClientAdapter) => void): void {
		this.connectionHandler = handler;
	}

	/**
	 * Register server error handler for errors occurring after startup
	 */
	onError(handler: (error: Error) => void): void {
		this.serverErrorHandler = handler;
	}

	async stop(): Promise<void> {
		// Close all connections
		for (const [connId, adapter] of this.connections) {
			await adapter.close();
			this.connections.delete(connId);
		}

		return new Promise<void>((resolve, reject) => {
			this.server.close((err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}

/**
 * WebSocket Client Adapter
 * Wraps WebSocket instance, owned by component
 * Used for both client connections and server-side connections
 */
export class WsClientAdapter implements IAsyncClientAdapter {
	readonly id: string;
	private socket: WebSocket;
	private lastError?: Error;
	private codec: Codec<string | Uint8Array>;

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	constructor(socket: WebSocket, id: string, codec?: Codec<string | Uint8Array>) {
		this.socket = socket;
		this.id = id;
		this.codec = codec ?? defaultJsonCodec;

		// Setup socket event handlers
		socket.on("message", (data) => {
			this.handleIncomingMessage(data);
		});

		socket.on("close", () => {
			this.closeHandler?.();
		});

		socket.on("error", (err) => {
			this.lastError = err;
			this.errorHandler?.(err);
		});
	}

	/**
	 * Handle incoming WebSocket message using codec
	 */
	private async handleIncomingMessage(data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
		try {
			// Convert data to the format expected by codec
			let input: string | Uint8Array;
			if (this.codec.wireFormat === "text") {
				input = data.toString();
			} else {
				// Binary format
				if (Buffer.isBuffer(data)) {
					input = new Uint8Array(data);
				} else if (data instanceof ArrayBuffer) {
					input = new Uint8Array(data);
				} else {
					// Array of buffers - concatenate
					input = new Uint8Array(Buffer.concat(data));
				}
			}

			const message = await this.codec.decode<Message>(input);
			this.messageHandler?.(message);
		} catch (error) {
			// Wrap non-CodecError in CodecError
			const codecError =
				error instanceof CodecError
					? error
					: CodecError.decodeError(this.codec.name, error instanceof Error ? error : new Error(String(error)));
			this.lastError = codecError;
			this.errorHandler?.(codecError);
		}
	}

	/**
	 * Get the last error that occurred on this adapter
	 */
	get error(): Error | undefined {
		return this.lastError;
	}

	/**
	 * Create WebSocket client adapter by connecting to server
	 * @param host - Target host
	 * @param port - Target port
	 * @param path - Optional URL path
	 * @param tls - Use secure WebSocket (wss)
	 * @param connectionTimeout - Connection timeout in ms (default: 5000)
	 * @param codec - Optional codec for message encoding/decoding
	 */
	static async create(
		host: string,
		port: number,
		path?: string,
		tls?: boolean,
		connectionTimeout?: number,
		codec?: Codec<string | Uint8Array>
	): Promise<WsClientAdapter> {
		const protocol = tls ? "wss" : "ws";
		const urlPath = path || "";
		const url = `${protocol}://${host}:${port}${urlPath}`;
		const timeout = connectionTimeout ?? 5000;

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);
			let timeoutId: NodeJS.Timeout | undefined;

			// Setup connection timeout
			if (timeout > 0) {
				timeoutId = setTimeout(() => {
					socket.terminate();
					reject(new Error(`WebSocket connection timeout after ${timeout}ms`));
				}, timeout);
			}

			socket.on("open", () => {
				if (timeoutId) clearTimeout(timeoutId);
				const adapter = new WsClientAdapter(socket, `client-${Date.now()}`, codec);
				resolve(adapter);
			});

			socket.on("error", (err) => {
				if (timeoutId) clearTimeout(timeoutId);
				reject(err);
			});
		});
	}

	async send(message: Message): Promise<void> {
		if (this.socket.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not open");
		}

		try {
			const encoded = await this.codec.encode(message);
			this.socket.send(encoded);
		} catch (error) {
			// Wrap non-CodecError in CodecError
			if (error instanceof CodecError) {
				throw error;
			}
			throw CodecError.encodeError(this.codec.name, error instanceof Error ? error : new Error(String(error)), message);
		}
	}

	async close(): Promise<void> {
		this.socket.close();
	}

	get isConnected(): boolean {
		return this.socket.readyState === WebSocket.OPEN;
	}

	onMessage(handler: (message: Message) => void): void {
		this.messageHandler = handler;
	}

	onClose(handler: () => void): void {
		this.closeHandler = handler;
	}

	onError(handler: (error: Error) => void): void {
		this.errorHandler = handler;
	}
}
