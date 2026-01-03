/**
 * gRPC Stream Protocol
 *
 * Protocol for gRPC bidirectional streaming.
 * Supports client connections, mock servers, and proxy servers.
 */

import * as grpc from "@grpc/grpc-js";
import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	IAsyncProtocol,
	Message,
	SchemaDefinition,
} from "testurio";
import { BaseAsyncProtocol, generateId } from "testurio";
import { GrpcBaseProtocol } from "./grpc-base";
import { extractGrpcMetadata } from "./metadata";
import type {
	GrpcStreamProtocolOptions,
	GrpcStreamServiceDefinition,
} from "./types";

/**
 * gRPC Stream Protocol
 *
 * Implements asynchronous bidirectional streaming for gRPC.
 *
 * @template S - Stream service definition type
 */
export class GrpcStreamProtocol<
		S extends GrpcStreamServiceDefinition = GrpcStreamServiceDefinition,
	>
	extends BaseAsyncProtocol<S>
	implements IAsyncProtocol
{
	readonly type = "grpc-stream";

	/** Public server/client handles */
	public server: { isRunning: boolean; ref?: grpc.Server } = {
		isRunning: false,
	};
	public client: { isConnected: boolean; ref?: grpc.Client } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: GrpcStreamProtocolOptions;

	/** Base protocol for shared functionality */
	private base: GrpcBaseProtocol;

	/** Active gRPC server instance */
	private grpcServer?: grpc.Server;

	/** Active gRPC client instance */
	private grpcClient?: grpc.Client;

	/** Active stream call */
	private streamCall?: grpc.ClientDuplexStream<unknown, unknown>;

	constructor(options: GrpcStreamProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
		this.base = new (class extends GrpcBaseProtocol {})();
	}

	/**
	 * Close a specific proxy client (implements abstract method)
	 * gRPC streaming doesn't use proxy mode, so this is a no-op
	 */
	protected closeProxyClient(_client: unknown): void {
		// No-op for gRPC streaming
	}

	/**
	 * Load Protobuf schema from .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		return this.base.loadSchema(schemaPath);
	}

	/**
	 * Get service client constructor by name
	 */
	getServiceClient(
		serviceName: string,
	): grpc.ServiceClientConstructor | undefined {
		return this.base.getServiceClient(serviceName);
	}

	/**
	 * Start a gRPC streaming server
	 */
	async startServer(config: ServerProtocolConfig): Promise<void> {
		// Auto-load schema from options if not already loaded
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		return new Promise((resolve, reject) => {
			const server = new grpc.Server();

			// If we have a schema, add service implementations
			const schema = (this.base as unknown as { schema?: { services: Map<string, grpc.ServiceDefinition> } }).schema;
			if (schema) {
				const addedServices = new Set<grpc.ServiceDefinition>();
				for (const [_serviceName, serviceDefinition] of schema.services) {
					if (addedServices.has(serviceDefinition)) continue;
					addedServices.add(serviceDefinition);

					const implementation =
						this.createStreamServiceImplementation(serviceDefinition);
					server.addService(serviceDefinition, implementation);
				}
			}

			const credentials = this.createServerCredentials(config.tls);

			server.bindAsync(
				`${config.listenAddress.host}:${config.listenAddress.port}`,
				credentials,
				(err, _port) => {
					if (err) {
						reject(err);
						return;
					}

					this.grpcServer = server;
					this.server.isRunning = true;
					resolve();
				},
			);
		});
	}

	/**
	 * Create server credentials from TLS config
	 */
	private createServerCredentials(tls?: ServerProtocolConfig["tls"]): grpc.ServerCredentials {
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
					: [],
			);
		}
		return grpc.ServerCredentials.createInsecure();
	}

	/**
	 * Create streaming service implementation
	 */
	private createStreamServiceImplementation(
		serviceDefinition: grpc.ServiceDefinition,
	): grpc.UntypedServiceImplementation {
		const implementation: grpc.UntypedServiceImplementation = {};

		for (const [methodName, methodDefinition] of Object.entries(
			serviceDefinition,
		)) {
			if (methodDefinition.requestStream && methodDefinition.responseStream) {
				// Bidirectional streaming
				implementation[methodName] = this.createBidiStreamHandler(methodName);
			} else if (
				!methodDefinition.requestStream &&
				!methodDefinition.responseStream
			) {
				// Unary (fallback)
				implementation[methodName] = this.createUnaryHandler(methodName);
			}
		}

		return implementation;
	}

	/**
	 * Create bidirectional stream handler
	 */
	private createBidiStreamHandler(
		methodName: string,
	): grpc.handleBidiStreamingCall<unknown, unknown> {
		return (call) => {
			// Extract metadata for potential future use
			extractGrpcMetadata(call.metadata);

			call.on("data", async (request: unknown) => {
				const requestObj = request as Record<string, unknown>;
				const messageType = (requestObj.message_type as string) || methodName;
				const traceId = generateId(messageType);

				// Try hook-based handlers first
				if (this.hookRegistry) {
					const message: Message = {
						type: messageType,
						payload: request,
						traceId,
					};

					const hookResult = await this.hookRegistry.executeHooks(message);

					if (hookResult === null) {
						return; // Message dropped
					}

					if (hookResult.type !== message.type) {
						call.write(hookResult.payload);
						return;
					}
				}

				// Fall back to message handlers
				const handlers = this.messageHandlers.get(messageType);
				if (handlers && handlers.length > 0) {
					for (const handler of handlers) {
						try {
							const result = await handler(request);
							if (result !== null && result !== undefined) {
								call.write(result);
							}
						} catch (_error) {
							// Handler error
						}
					}
				}
			});

			call.on("end", () => {
				call.end();
			});

			call.on("error", () => {
				// Handle error
			});
		};
	}

	/**
	 * Create unary handler (fallback)
	 */
	private createUnaryHandler(
		methodName: string,
	): grpc.handleUnaryCall<unknown, unknown> {
		return async (call, callback) => {
			const handlers = this.messageHandlers.get(methodName);

			if (handlers && handlers.length > 0) {
				try {
					const result = await handlers[0](call.request);
					callback(null, result);
				} catch (error) {
					callback({
						code: grpc.status.INTERNAL,
						message: error instanceof Error ? error.message : "Unknown error",
					});
				}
			} else {
				callback({
					code: grpc.status.UNIMPLEMENTED,
					message: `No handler for ${methodName}`,
				});
			}
		};
	}

	/**
	 * Stop a gRPC streaming server
	 */
	async stopServer(): Promise<void> {
		if (!this.grpcServer) {
			return;
		}

		const server = this.grpcServer;
		return new Promise((resolve) => {
			server.tryShutdown(() => {
				this.grpcServer = undefined;
				this.server.isRunning = false;
				resolve();
			});
		});
	}

	/**
	 * Create a gRPC streaming client
	 */
	async createClient(config: ClientProtocolConfig): Promise<void> {
		// Auto-load schema from options if not already loaded
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		const serviceName = this.protocolOptions.serviceName;
		const methodName = this.protocolOptions.methodName;

		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else {
			const schema = (this.base as unknown as { schema?: { services: Map<string, grpc.ServiceDefinition> } }).schema;
			if (schema) {
				for (const [name] of schema.services) {
					ServiceClient = this.getServiceClient(name);
					if (ServiceClient) break;
				}
			}
		}

		if (!ServiceClient) {
			throw new Error(
				`Service ${serviceName || "any"} not found. Make sure to load schema first.`,
			);
		}

		const credentials = this.createClientCredentials(config.tls);

		this.grpcClient = new ServiceClient(
			`${config.targetAddress.host}:${config.targetAddress.port}`,
			credentials,
		);

		// If method name is provided, open the stream
		if (methodName) {
			const grpcClient = this.grpcClient as unknown as Record<
				string,
				() => grpc.ClientDuplexStream<unknown, unknown>
			>;

			if (typeof grpcClient[methodName] === "function") {
				const call = grpcClient[methodName]();
				this.streamCall = call;

				call.on("data", (response: unknown) => {
					this.handleStreamMessage(response);
				});

				call.on("error", () => {
					this.client.isConnected = false;
				});

				call.on("end", () => {
					this.client.isConnected = false;
				});
			}
		}

		this.client.isConnected = true;
	}

	/**
	 * Create client credentials from TLS config
	 */
	private createClientCredentials(tls?: ClientProtocolConfig["tls"]): grpc.ChannelCredentials {
		if (tls) {
			return grpc.credentials.createSsl(
				tls.ca ? Buffer.from(tls.ca) : undefined,
				tls.key ? Buffer.from(tls.key) : undefined,
				tls.cert ? Buffer.from(tls.cert) : undefined,
			);
		}
		return grpc.credentials.createInsecure();
	}

	/**
	 * Handle incoming stream message
	 */
	private async handleStreamMessage(data: unknown): Promise<void> {
		const dataObj = data as Record<string, unknown>;
		const messageType =
			(dataObj.message_type as string) ||
			this.protocolOptions.methodName ||
			"unknown";
		const traceId = generateId(messageType);

		const message: Message = {
			type: messageType,
			payload: data,
			traceId,
		};

		// Use base class method for message delivery
		await this.deliverMessageToClient(message);
	}

	/**
	 * Close a gRPC streaming client
	 */
	async closeClient(): Promise<void> {
		this.rejectAllPendingMessages(new Error("Client disconnected"));

		if (this.streamCall) {
			this.streamCall.end();
			this.streamCall = undefined;
		}

		if (this.grpcClient) {
			this.grpcClient.close();
			this.grpcClient = undefined;
		}

		this.client.isConnected = false;
	}

	/**
	 * Send message on stream
	 */
	async sendMessage<T = unknown>(
		_messageType: string,
		payload: T,
		_traceId?: string,
	): Promise<void> {
		if (!this.client.isConnected) {
			throw new Error("Client is not connected");
		}

		if (!this.streamCall) {
			throw new Error("Client has no active stream");
		}

		this.streamCall.write(payload);
	}

	/**
	 * Wait for message on stream
	 */
	async waitForMessage<T = unknown>(
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout = 30000,
	): Promise<Message> {
		if (!this.client.isConnected) {
			throw new Error("Client is not connected");
		}

		const types = Array.isArray(messageType) ? messageType : [messageType];

		// Check queue first
		const queuedMessage = this.findInQueue(
			types,
			matcher as string | ((payload: unknown) => boolean) | undefined,
		);
		if (queuedMessage) {
			return queuedMessage;
		}

		return new Promise<Message>((resolve, reject) => {
			const pendingId = generateId("pending");

			const timeoutHandle = setTimeout(() => {
				this.pendingMessages.delete(pendingId);
				reject(
					new Error(`Timeout waiting for message type: ${types.join(", ")}`),
				);
			}, timeout);

			this.pendingMessages.set(pendingId, {
				resolve,
				reject,
				messageType,
				matcher: matcher as
					| string
					| ((payload: unknown) => boolean)
					| undefined,
				timeout: timeoutHandle,
			});
		});
	}

}

/**
 * Create gRPC stream protocol factory
 */
export function createGrpcStreamProtocol(): GrpcStreamProtocol {
	return new GrpcStreamProtocol();
}
