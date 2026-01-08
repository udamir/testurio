/**
 * gRPC Stream Protocol Adapters
 *
 * Split architecture for server and client stream adapters:
 * - GrpcStreamServerAdapter: Server component managing connections
 * - GrpcStreamServerConnectionAdapter: Server-side connection (wraps ServerDuplexStream)
 * - GrpcStreamClientAdapter: Client-side connection (wraps ClientDuplexStream)
 */

import * as grpc from "@grpc/grpc-js";
import type { IAsyncClientAdapter, IAsyncServerAdapter, Message } from "testurio";
import { generateId } from "testurio";
import { createClientCredentials, createServerCredentials, type TlsConfig } from "./credentials";
import { extractGrpcMetadata } from "./metadata";
import type { GrpcClientMethods, GrpcStreamClientMethod } from "./types";

// =============================================================================
// Message Type Extraction Helper
// =============================================================================

/**
 * Extract message type from gRPC data payload
 *
 * Detection order:
 * 1. Explicit message_type field
 * 2. Single oneof-style object field
 * 3. Fallback to method name
 */
function extractMessageType(data: unknown, fallback: string): string {
	if (typeof data !== "object" || data === null) {
		return fallback;
	}

	const dataObj = data as Record<string, unknown>;

	// Check for explicit message_type field
	if (typeof dataObj.message_type === "string" && dataObj.message_type) {
		return dataObj.message_type;
	}

	// Check for oneof-style fields (single object field)
	const oneofFields = Object.keys(dataObj).filter(
		(k) => k !== "message_type" && typeof dataObj[k] === "object" && dataObj[k] !== null
	);
	if (oneofFields.length === 1) {
		return oneofFields[0];
	}

	return fallback;
}

// =============================================================================
// Server-Side Connection Adapter
// =============================================================================

/**
 * gRPC Stream Server Connection Adapter
 *
 * Represents a single client connection on the server side.
 * Wraps grpc.ServerDuplexStream - no type casting needed.
 *
 * Implements IAsyncClientAdapter to represent the connected client
 * from the server's perspective.
 */
export class GrpcStreamServerConnectionAdapter implements IAsyncClientAdapter {
	readonly id: string;
	private call: grpc.ServerDuplexStream<unknown, unknown>;
	private methodName: string;
	private _connected: boolean;

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	constructor(call: grpc.ServerDuplexStream<unknown, unknown>, id: string, methodName: string) {
		this.call = call;
		this.id = id;
		this.methodName = methodName;
		this._connected = true;

		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		this.call.on("data", (data: unknown) => {
			const messageType = extractMessageType(data, this.methodName);
			const traceId = generateId(messageType);

			const message: Message = {
				type: messageType,
				payload: data,
				traceId,
			};

			this.messageHandler?.(message);
		});

		this.call.on("end", () => {
			this._connected = false;
			this.closeHandler?.();
		});

		this.call.on("error", (err) => {
			this._connected = false;
			this.errorHandler?.(err);
		});
	}

	/**
	 * Send a message to the connected client
	 *
	 * Uses write callback for proper error handling and
	 * drain event for backpressure management.
	 */
	async send(message: Message): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this._connected) {
				reject(new Error("Stream is not connected"));
				return;
			}

			try {
				const success = this.call.write(message.payload, (err: Error | null | undefined) => {
					if (err) {
						this._connected = false;
						reject(err);
					} else {
						resolve();
					}
				});

				// Handle backpressure
				if (!success) {
					this.call.once("drain", () => resolve());
				}
			} catch (err) {
				this._connected = false;
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	async close(): Promise<void> {
		this.call.end();
		this._connected = false;
	}

	get isConnected(): boolean {
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
}

// =============================================================================
// Server Adapter
// =============================================================================

/**
 * gRPC Stream Server Adapter
 *
 * Wraps grpc.Server instance for bidirectional streaming.
 * Creates GrpcStreamServerConnectionAdapter for each incoming connection.
 */
export class GrpcStreamServerAdapter implements IAsyncServerAdapter {
	private server: grpc.Server;
	private connectionHandler?: (connection: IAsyncClientAdapter) => void;
	private connections = new Map<string, GrpcStreamServerConnectionAdapter>();

	constructor(server: grpc.Server) {
		this.server = server;
	}

	/**
	 * Create and start gRPC stream server adapter
	 */
	static async create(
		host: string,
		port: number,
		serviceDefinitions: Map<string, grpc.ServiceDefinition>,
		tls?: TlsConfig
	): Promise<GrpcStreamServerAdapter> {
		return new Promise((resolve, reject) => {
			const server = new grpc.Server();
			const adapter = new GrpcStreamServerAdapter(server);

			// Add service implementations
			const addedServices = new Set<grpc.ServiceDefinition>();
			for (const [_serviceName, serviceDefinition] of serviceDefinitions) {
				if (addedServices.has(serviceDefinition)) continue;
				addedServices.add(serviceDefinition);

				const implementation = adapter.createStreamServiceImplementation(serviceDefinition);
				server.addService(serviceDefinition, implementation);
			}

			const credentials = createServerCredentials(tls);

			server.bindAsync(`${host}:${port}`, credentials, (err, _port) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(adapter);
			});
		});
	}

	private createStreamServiceImplementation(
		serviceDefinition: grpc.ServiceDefinition
	): grpc.UntypedServiceImplementation {
		const implementation: grpc.UntypedServiceImplementation = {};

		for (const [methodName, methodDefinition] of Object.entries(serviceDefinition)) {
			if (methodDefinition.requestStream && methodDefinition.responseStream) {
				implementation[methodName] = this.createBidiStreamHandler(methodName);
			}
		}

		return implementation;
	}

	private createBidiStreamHandler(methodName: string): grpc.handleBidiStreamingCall<unknown, unknown> {
		return (call) => {
			extractGrpcMetadata(call.metadata);

			const connId = `grpc-server-${Date.now()}-${Math.random().toString(36).slice(2)}`;

			// Use GrpcStreamServerConnectionAdapter - no unsafe cast needed
			const connectionAdapter = new GrpcStreamServerConnectionAdapter(call, connId, methodName);
			this.connections.set(connId, connectionAdapter);

			call.on("end", () => {
				this.connections.delete(connId);
			});

			call.on("error", () => {
				this.connections.delete(connId);
			});

			this.connectionHandler?.(connectionAdapter);
		};
	}

	onConnection(handler: (connection: IAsyncClientAdapter) => void): void {
		this.connectionHandler = handler;
	}

	async stop(): Promise<void> {
		return new Promise((resolve) => {
			this.server.tryShutdown(() => {
				this.connections.clear();
				resolve();
			});
		});
	}
}

// =============================================================================
// Client Adapter
// =============================================================================

/**
 * gRPC Stream Client Adapter
 *
 * Client-side adapter for connecting to gRPC streaming servers.
 * Wraps grpc.ClientDuplexStream - no type casting needed.
 */
export class GrpcStreamClientAdapter implements IAsyncClientAdapter {
	readonly id: string;
	private call: grpc.ClientDuplexStream<unknown, unknown>;
	private methodName: string;
	private _connected: boolean;

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	private constructor(call: grpc.ClientDuplexStream<unknown, unknown>, id: string, methodName: string) {
		this.call = call;
		this.id = id;
		this.methodName = methodName;
		this._connected = true;

		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		this.call.on("data", (data: unknown) => {
			const messageType = extractMessageType(data, this.methodName);
			const traceId = generateId(messageType);

			const message: Message = {
				type: messageType,
				payload: data,
				traceId,
			};

			this.messageHandler?.(message);
		});

		this.call.on("end", () => {
			this._connected = false;
			this.closeHandler?.();
		});

		this.call.on("error", (err) => {
			this._connected = false;
			this.errorHandler?.(err);
		});
	}

	/**
	 * Create gRPC stream client adapter by connecting to server
	 */
	static async create(
		host: string,
		port: number,
		ServiceClient: grpc.ServiceClientConstructor,
		methodName: string,
		tls?: TlsConfig
	): Promise<GrpcStreamClientAdapter> {
		const credentials = createClientCredentials(tls);
		const client = new ServiceClient(`${host}:${port}`, credentials);

		// Access client methods via typed interface
		const clientMethods = client as unknown as GrpcClientMethods;
		const method = clientMethods[methodName];

		if (typeof method !== "function") {
			throw new Error(`Method ${methodName} not found on service`);
		}

		// Cast to stream method type and call with proper this binding
		const streamMethod = method as GrpcStreamClientMethod;
		const call = streamMethod.call(client);

		return new GrpcStreamClientAdapter(call, `grpc-client-${Date.now()}`, methodName);
	}

	/**
	 * Send a message to the server
	 *
	 * Uses write callback for proper error handling and
	 * drain event for backpressure management.
	 */
	async send(message: Message): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this._connected) {
				reject(new Error("Stream is not connected"));
				return;
			}

			try {
				const success = this.call.write(message.payload, (err: Error | null | undefined) => {
					if (err) {
						this._connected = false;
						reject(err);
					} else {
						resolve();
					}
				});

				// Handle backpressure
				if (!success) {
					this.call.once("drain", () => resolve());
				}
			} catch (err) {
				this._connected = false;
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	async close(): Promise<void> {
		this.call.end();
		this._connected = false;
	}

	get isConnected(): boolean {
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
}
