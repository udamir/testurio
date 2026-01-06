import net from "node:net";
import tls from "node:tls";
import { type FramingConfig, frameMessage, processIncomingBuffer } from "./framing";

type DataHandler = (data: Uint8Array) => void;
type MessageHandler = (msg: Uint8Array | string) => void;
type ErrorHandler = (err: Error) => void;
type EndHandler = () => void;

type HandlerType = "data" | "message" | "error" | "end";

type EventHandlers<T extends HandlerType> = T extends "data"
	? DataHandler
	: T extends "message"
		? MessageHandler
		: T extends "error"
			? ErrorHandler
			: T extends "end"
				? EndHandler
				: never;

export interface TcpClientConfig {
	timeout?: number; // Connection timeout
	lengthFieldLength?: 0 | 1 | 2 | 4 | 8; // Length field length for length-prefixed framing (for binary encoding)
	maxLength?: number; // Maximum message length
	encoding?: "utf-8" | "binary"; // Encoding
	delimiter?: string; // Delimiter (for UTF-8 encoding)
	tls?: boolean; // Use TLS
	serverName?: string; // Server name for TLS verification
	insecureSkipVerify?: boolean; // Skip TLS verification
}

export class TcpClient {
	private config: Required<TcpClientConfig> | null = null;
	private socket: net.Socket | tls.TLSSocket | null = null;
	private connected = false;

	private onData?: DataHandler;
	private onMessage?: MessageHandler;
	private onError?: ErrorHandler;
	private onEnd?: EndHandler;

	private readBuffer: Buffer = Buffer.alloc(0);

	on<T extends HandlerType>(event: T, handler: EventHandlers<T>) {
		switch (event) {
			case "data":
				this.onData = handler as DataHandler;
				break;
			case "message":
				this.onMessage = handler as MessageHandler;
				break;
			case "error":
				this.onError = handler as ErrorHandler;
				break;
			case "end":
				this.onEnd = handler as EndHandler;
				break;
		}
	}

	connect(host: string, port: number, cfg: TcpClientConfig) {
		const { timeout = 5000 } = cfg;
		this.config = {
			timeout: timeout,
			lengthFieldLength: cfg.lengthFieldLength ?? 0,
			maxLength: cfg.maxLength ?? 0,
			encoding: cfg.encoding ?? "binary",
			delimiter: cfg.delimiter ?? "",
			tls: cfg.tls ?? false,
			serverName: cfg.serverName ?? "",
			insecureSkipVerify: cfg.insecureSkipVerify ?? true,
		};
		if (this.connected) throw new Error("socket is already connected");

		if (!host || !Number.isFinite(port)) throw new Error(`invalid address: ${host}:${port}`);

		const sock = this.config.tls
			? tls.connect({
					host,
					port,
					servername: this.config.serverName,
					rejectUnauthorized: !this.config.insecureSkipVerify,
					timeout,
				})
			: net.connect({ host, port, timeout });

		this.socket = sock;

		sock.on("data", (chunk: Buffer) => {
			// Emit raw data if requested
			if (this.onData) this.onData(new Uint8Array(chunk));
			this.readBuffer = Buffer.concat([this.readBuffer, chunk]);
			this.processIncoming();
		});
		sock.on("error", (err: Error) => {
			if (this.onError) this.onError(err);
		});
		sock.on("close", () => {
			this.connected = false;
			if (this.onEnd) this.onEnd();
		});

		return new Promise<void>((resolve, reject) => {
			sock.on("connect", () => {
				this.connected = true;
				resolve();
			});
			sock.on("secureConnect", () => {
				this.connected = true;
				resolve();
			});
			sock.on("error", (err: Error) => {
				reject(err);
			});
		});
	}

	private processIncoming() {
		if (!this.config) return;
		const framingConfig: FramingConfig = {
			lengthFieldLength: this.config.lengthFieldLength,
			encoding: this.config.encoding,
			delimiter: this.config.delimiter,
		};
		const result = processIncomingBuffer(this.readBuffer, framingConfig);
		this.readBuffer = result.remainingBuffer;
		for (const msg of result.messages) {
			this.onMessage?.(msg);
		}
	}

	private writeAll(buf: Buffer) {
		return new Promise<void>((resolve, reject) => {
			if (!this.socket) return reject(new Error("socket not connected"));
			this.socket.write(buf, (err?: Error | null) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	async send(data: Uint8Array) {
		if (!this.connected || !this.socket || !this.config) throw new Error("socket not connected");
		const framed = frameMessage(data, this.config.lengthFieldLength);
		await this.writeAll(framed);
	}

	async write(data: Uint8Array) {
		if (!this.connected || !this.socket) throw new Error("socket not connected");
		await this.writeAll(Buffer.from(data));
	}

	close() {
		if (!this.socket) return;
		this.connected = false;
		this.socket.destroy();
	}
}
