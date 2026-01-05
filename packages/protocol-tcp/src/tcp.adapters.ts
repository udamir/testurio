/**
 * TCP Protocol Adapters (v3 Design)
 *
 * Server and client adapters for TCP protocol.
 */

import type { IAsyncServerAdapter, IAsyncClientAdapter } from "testurio";
import type { Message } from "testurio";
import type { TcpProtocolOptions, ISocket } from "./types";
import { TcpClient } from "./tcp.client";
import { TcpServer } from "./tcp.server";

/**
 * TCP Server Adapter
 * Wraps TcpServer instance, owned by component
 */
export class TcpServerAdapter implements IAsyncServerAdapter {
	private server: TcpServer;
	private connectionHandler?: (connection: IAsyncClientAdapter) => void;
	private connections = new Map<string, TcpClientAdapter>();

	constructor(server: TcpServer) {
		this.server = server;
	}

	/**
	 * Create and start TCP server adapter
	 */
	static async create(
		host: string,
		port: number,
		options: TcpProtocolOptions = {},
		tls?: { enabled?: boolean; cert?: string; key?: string },
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
			if (socket) {
				const clientAdapter = adapter.connections.get(socket.id);
				if (clientAdapter) {
					clientAdapter._handleError(err);
					clientAdapter._handleClose();
					adapter.connections.delete(socket.id);
				}
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

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	constructor(socketOrId: ISocket | string, options: TcpProtocolOptions) {
		this.options = options;
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
	 * Create TCP client adapter by connecting to server
	 */
	static async create(
		host: string,
		port: number,
		options: TcpProtocolOptions = {},
	): Promise<TcpClientAdapter> {
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

		const json = JSON.stringify(message);
		const delimiter = this.options.delimiter ?? "\n";

		if (this.options.lengthFieldLength) {
			const data = new TextEncoder().encode(json);
			if (this.socket) {
				await this.socket.send(data);
			} else if (this.tcpClient) {
				await this.tcpClient.send(data);
			}
		} else {
			const data = new TextEncoder().encode(json + delimiter);
			if (this.socket) {
				await this.socket.write(data);
			} else if (this.tcpClient) {
				await this.tcpClient.write(data);
			}
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
		try {
			const str = typeof data === "string" ? data : new TextDecoder().decode(data);
			const message = JSON.parse(str) as Message;
			this.messageHandler?.(message);
		} catch {
			// Failed to parse message
		}
	}

	/** Internal: handle close event */
	_handleClose(): void {
		this._connected = false;
		this.closeHandler?.();
	}

	/** Internal: handle error event */
	_handleError(error: Error): void {
		this.errorHandler?.(error);
	}
}
