/**
 * WebSocket Protocol Adapters
 *
 * Server and client adapters for WebSocket protocol.
 */

import type { IAsyncServerAdapter, IAsyncClientAdapter } from "testurio";
import type { Message } from "testurio";
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

	constructor(server: WebSocketServer) {
		this.server = server;
	}

	/**
	 * Create and start WebSocket server adapter
	 */
	static async create(
		host: string,
		port: number,
	): Promise<WsServerAdapter> {
		return new Promise((resolve, reject) => {
			const server = new WebSocketServer({ host, port });
			const adapter = new WsServerAdapter(server);

			server.on("connection", (socket) => {
				const connId = `ws-${++adapter.connectionCounter}`;
				const clientAdapter = new WsClientAdapter(socket, connId);
				adapter.connections.set(connId, clientAdapter);
				
				socket.on("close", () => {
					adapter.connections.delete(connId);
				});

				adapter.connectionHandler?.(clientAdapter);
			});

			server.on("error", (err) => {
				reject(err);
			});

			server.on("listening", () => {
				resolve(adapter);
			});
		});
	}

	onConnection(handler: (connection: IAsyncClientAdapter) => void): void {
		this.connectionHandler = handler;
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

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	constructor(socket: WebSocket, id: string) {
		this.socket = socket;
		this.id = id;

		// Setup socket event handlers
		socket.on("message", (data) => {
			try {
				const message = JSON.parse(data.toString()) as Message;
				this.messageHandler?.(message);
			} catch {
				// Failed to parse message
			}
		});

		socket.on("close", () => {
			this.closeHandler?.();
		});

		socket.on("error", (err) => {
			this.errorHandler?.(err);
		});
	}

	/**
	 * Create WebSocket client adapter by connecting to server
	 */
	static async create(
		host: string,
		port: number,
		path?: string,
		tls?: boolean,
	): Promise<WsClientAdapter> {
		const protocol = tls ? "wss" : "ws";
		const urlPath = path || "";
		const url = `${protocol}://${host}:${port}${urlPath}`;

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);

			socket.on("open", () => {
				const adapter = new WsClientAdapter(socket, `client-${Date.now()}`);
				resolve(adapter);
			});

			socket.on("error", (err) => {
				reject(err);
			});
		});
	}

	async send(message: Message): Promise<void> {
		if (this.socket.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not open");
		}
		this.socket.send(JSON.stringify(message));
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
