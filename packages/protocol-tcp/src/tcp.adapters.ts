/**
 * TCP Protocol Adapters (v3 Design)
 *
 * Server and client adapters for TCP protocol.
 */

import type { Codec, IAsyncClientAdapter, IAsyncServerAdapter, Message } from "testurio";
import { CodecError, defaultJsonCodec } from "testurio";
import { TcpClient } from "./tcp.client";
import { TcpServer } from "./tcp.server";
import type { ISocket, TcpProtocolOptions } from "./types";

/**
 * TCP Server Adapter
 * Wraps TcpServer instance, owned by component
 */
export class TcpServerAdapter implements IAsyncServerAdapter {
	private server: TcpServer;
	private connectionHandler?: (connection: IAsyncClientAdapter) => void;
	private connections = new Map<string, TcpClientAdapter>();
	private serverErrorHandler?: (error: Error) => void;
	private lastError?: Error;

	constructor(server: TcpServer) {
		this.server = server;
	}

	/**
	 * Get the last error that occurred on this adapter
	 */
	get error(): Error | undefined {
		return this.lastError;
	}

	/**
	 * Create and start TCP server adapter
	 */
	static async create(
		host: string,
		port: number,
		options: TcpProtocolOptions = {},
		tls?: { enabled?: boolean; cert?: string; key?: string }
	): Promise<TcpServerAdapter> {
		const server = new TcpServer();
		const adapter = new TcpServerAdapter(server);

		server.on("connection", (socket) => {
			const clientAdapter = new TcpClientAdapter(socket, options);
			adapter.connections.set(socket.id, clientAdapter);
			adapter.connectionHandler?.(clientAdapter);
		});

		server.on("message", (socket, data) => {
			const clientAdapter = adapter.connections.get(socket.id);
			if (clientAdapter) {
				clientAdapter._handleMessage(data);
			}
		});

		server.on("disconnect", (socket) => {
			const clientAdapter = adapter.connections.get(socket.id);
			if (clientAdapter) {
				clientAdapter._handleClose();
				adapter.connections.delete(socket.id);
			}
		});

		server.on("error", (err, socket) => {
			adapter.lastError = err;
			if (socket) {
				const clientAdapter = adapter.connections.get(socket.id);
				if (clientAdapter) {
					clientAdapter._handleError(err);
					clientAdapter._handleClose();
					adapter.connections.delete(socket.id);
				}
			} else {
				// Server-level error (no specific socket)
				adapter.serverErrorHandler?.(err);
			}
		});

		await server.listen(host, port, {
			timeout: options.timeout,
			lengthFieldLength: options.lengthFieldLength ?? 0,
			maxLength: options.maxLength,
			encoding: options.lengthFieldLength ? "binary" : "utf-8",
			delimiter: options.delimiter ?? "\n",
			tls: tls?.enabled,
			cert: tls?.cert,
			key: tls?.key,
		});

		return adapter;
	}

	onConnection(handler: (connection: IAsyncClientAdapter) => void): void {
		this.connectionHandler = handler;
	}

	/**
	 * Register server error handler for errors occurring at the server level
	 */
	onError(handler: (error: Error) => void): void {
		this.serverErrorHandler = handler;
	}

	async stop(): Promise<void> {
		await this.server.close();
		this.connections.clear();
	}
}

/**
 * TCP Client Adapter
 * Wraps TCP socket/client, owned by component
 * Used for both client connections and server-side connections
 */
export class TcpClientAdapter implements IAsyncClientAdapter {
	readonly id: string;
	private socket?: ISocket;
	private tcpClient?: TcpClient;
	private options: TcpProtocolOptions;
	private _connected: boolean;
	private lastError?: Error;
	private codec: Codec<string | Uint8Array>;

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	constructor(socketOrId: ISocket | string, options: TcpProtocolOptions) {
		this.options = options;
		this.codec = options.codec ?? defaultJsonCodec;
		if (typeof socketOrId === "string") {
			this.id = socketOrId;
			this._connected = false;
		} else {
			this.socket = socketOrId;
			this.id = socketOrId.id;
			this._connected = socketOrId.connected;
		}
	}

	/**
	 * Get the last error that occurred on this adapter
	 */
	get error(): Error | undefined {
		return this.lastError;
	}

	/**
	 * Create TCP client adapter by connecting to server
	 */
	static async create(host: string, port: number, options: TcpProtocolOptions = {}): Promise<TcpClientAdapter> {
		const tcpClient = new TcpClient();
		const adapter = new TcpClientAdapter(`client-${Date.now()}`, options);
		adapter.tcpClient = tcpClient;

		await tcpClient.connect(host, port, {
			timeout: options.timeout,
			lengthFieldLength: options.lengthFieldLength ?? 0,
			maxLength: options.maxLength,
			encoding: options.lengthFieldLength ? "binary" : "utf-8",
			delimiter: options.delimiter ?? "\n",
			tls: options.tls,
			serverName: options.serverName,
			insecureSkipVerify: options.insecureSkipVerify,
		});

		adapter._connected = true;

		tcpClient.on("message", (data) => {
			adapter._handleMessage(data);
		});

		tcpClient.on("error", (err) => {
			adapter._connected = false;
			adapter._handleError(err);
		});

		tcpClient.on("end", () => {
			adapter._connected = false;
			adapter._handleClose();
		});

		return adapter;
	}

	async send(message: Message): Promise<void> {
		if (!this.isConnected) {
			throw new Error("Socket is not connected");
		}

		try {
			const encoded = await this.codec.encode(message);
			const delimiter = this.options.delimiter ?? "\n";

			// Convert encoded data to Uint8Array for sending
			let data: Uint8Array;
			if (typeof encoded === "string") {
				if (this.options.lengthFieldLength) {
					data = new TextEncoder().encode(encoded);
				} else {
					data = new TextEncoder().encode(encoded + delimiter);
				}
			} else {
				// Binary data - append delimiter as bytes if needed
				if (this.options.lengthFieldLength) {
					data = encoded;
				} else {
					const delimiterBytes = new TextEncoder().encode(delimiter);
					const combined = new Uint8Array(encoded.length + delimiterBytes.length);
					combined.set(encoded);
					combined.set(delimiterBytes, encoded.length);
					data = combined;
				}
			}

			if (this.options.lengthFieldLength) {
				if (this.socket) {
					await this.socket.send(data);
				} else if (this.tcpClient) {
					await this.tcpClient.send(data);
				}
			} else {
				if (this.socket) {
					await this.socket.write(data);
				} else if (this.tcpClient) {
					await this.tcpClient.write(data);
				}
			}
		} catch (error) {
			if (error instanceof CodecError) {
				throw error;
			}
			throw CodecError.encodeError(this.codec.name, error instanceof Error ? error : new Error(String(error)), message);
		}
	}

	async close(): Promise<void> {
		if (this.socket) {
			this.socket.close();
		} else if (this.tcpClient) {
			this.tcpClient.close();
		}
		this._connected = false;
	}

	get isConnected(): boolean {
		if (this.socket) {
			return this.socket.connected;
		}
		return this._connected;
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

	/** Internal: handle incoming message data */
	_handleMessage(data: string | Uint8Array): void {
		this._handleMessageAsync(data).catch((error) => {
			const codecError =
				error instanceof CodecError
					? error
					: CodecError.decodeError(this.codec.name, error instanceof Error ? error : new Error(String(error)));
			this.lastError = codecError;
			this.errorHandler?.(codecError);
		});
	}

	/** Internal: async message handling */
	private async _handleMessageAsync(data: string | Uint8Array): Promise<void> {
		// Convert data to the format expected by codec
		let input: string | Uint8Array;
		if (this.codec.wireFormat === "text") {
			input = typeof data === "string" ? data : new TextDecoder().decode(data);
		} else {
			// Binary format
			input = typeof data === "string" ? new TextEncoder().encode(data) : data;
		}

		const message = await this.codec.decode(input);
		this.messageHandler?.(message);
	}

	/** Internal: handle close event */
	_handleClose(): void {
		this._connected = false;
		this.closeHandler?.();
	}

	/** Internal: handle error event */
	_handleError(error: Error): void {
		this.lastError = error;
		this.errorHandler?.(error);
	}
}
