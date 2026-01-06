/**
 * gRPC Stream Protocol Adapters (v3 Design)
 *
 * Server and client adapters for gRPC bidirectional streaming protocol.
 */

import * as grpc from "@grpc/grpc-js";
import type { IAsyncClientAdapter, IAsyncServerAdapter, Message } from "testurio";
import { generateId } from "testurio";
import { extractGrpcMetadata } from "./metadata";
import type { GrpcClientMethods, GrpcStreamClientMethod } from "./types";

/**
 * gRPC Stream Server Adapter
 * Wraps grpc.Server instance for bidirectional streaming, owned by component
 */
export class GrpcStreamServerAdapter implements IAsyncServerAdapter {
	private server: grpc.Server;
	private connectionHandler?: (connection: IAsyncClientAdapter) => void;
	private connections = new Map<string, GrpcStreamClientAdapter>();

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
		tls?: { ca?: string; cert?: string; key?: string }
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

			const credentials = adapter.createServerCredentials(tls);

			server.bindAsync(`${host}:${port}`, credentials, (err, _port) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(adapter);
			});
		});
	}

	private createServerCredentials(tls?: { ca?: string; cert?: string; key?: string }): grpc.ServerCredentials {
		if (tls) {
			return grpc.ServerCredentials.createSsl(
				tls.ca ? Buffer.from(tls.ca) : null,
				tls.cert && tls.key
					? [
							{
								cert_chain: Buffer.from(tls.cert),
								private_key: Buffer.from(tls.key),
							},
						]
					: []
			);
		}
		return grpc.ServerCredentials.createInsecure();
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
			const clientAdapter = new GrpcStreamClientAdapter(
				call as unknown as grpc.ClientDuplexStream<unknown, unknown>,
				connId,
				methodName
			);
			this.connections.set(connId, clientAdapter);

			call.on("end", () => {
				this.connections.delete(connId);
			});

			call.on("error", () => {
				this.connections.delete(connId);
			});

			this.connectionHandler?.(clientAdapter);
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

/**
 * gRPC Stream Client Adapter
 * Wraps gRPC duplex stream, owned by component
 * Used for both client connections and server-side connections
 */
export class GrpcStreamClientAdapter implements IAsyncClientAdapter {
	readonly id: string;
	private call: grpc.ClientDuplexStream<unknown, unknown> | grpc.ServerDuplexStream<unknown, unknown>;
	private _connected: boolean;

	private messageHandler?: (message: Message) => void;
	private closeHandler?: () => void;
	private errorHandler?: (error: Error) => void;

	constructor(
		call: grpc.ClientDuplexStream<unknown, unknown> | grpc.ServerDuplexStream<unknown, unknown>,
		id: string,
		methodName: string
	) {
		this.call = call;
		this.id = id;
		this._connected = true;

		// Setup stream event handlers
		call.on("data", (data: unknown) => {
			const dataObj = data as Record<string, unknown>;
			const messageType = (dataObj.message_type as string) || methodName || "unknown";
			const traceId = generateId(messageType);

			const message: Message = {
				type: messageType,
				payload: data,
				traceId,
			};
			this.messageHandler?.(message);
		});

		call.on("end", () => {
			this._connected = false;
			this.closeHandler?.();
		});

		call.on("error", (err) => {
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
		tls?: { ca?: string; cert?: string; key?: string }
	): Promise<GrpcStreamClientAdapter> {
		const credentials = tls
			? grpc.credentials.createSsl(
					tls.ca ? Buffer.from(tls.ca) : undefined,
					tls.key ? Buffer.from(tls.key) : undefined,
					tls.cert ? Buffer.from(tls.cert) : undefined
				)
			: grpc.credentials.createInsecure();

		const client = new ServiceClient(`${host}:${port}`, credentials);

		// Access client methods via typed interface
		const clientMethods = client as GrpcClientMethods;
		const method = clientMethods[methodName];

		if (typeof method !== "function") {
			throw new Error(`Method ${methodName} not found on service`);
		}

		// Cast to stream method type and call with proper this binding
		const streamMethod = method as GrpcStreamClientMethod;
		const call = streamMethod.call(client);
		return new GrpcStreamClientAdapter(call, `grpc-client-${Date.now()}`, methodName);
	}

	async send(message: Message): Promise<void> {
		if (!this._connected) {
			throw new Error("Stream is not connected");
		}
		this.call.write(message.payload);
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
