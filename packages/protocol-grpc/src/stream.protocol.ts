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
	IClientConnection,
	IServerConnection,
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

/** Socket-like wrapper for gRPC stream */
interface GrpcStreamSocket {
	id: string;
	connected: boolean;
	call: grpc.ServerDuplexStream<unknown, unknown> | grpc.ClientDuplexStream<unknown, unknown>;
}

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
	extends BaseAsyncProtocol<S, GrpcStreamSocket>
	implements IAsyncProtocol
{
	readonly type = "grpc-stream";

	/** Protocol options */
	private protocolOptions: GrpcStreamProtocolOptions;

	/** Base protocol for shared functionality */
	private base: GrpcBaseProtocol;

	/** Active gRPC server instance */
	private grpcServer?: grpc.Server;

	/** Active gRPC client instance */
	private grpcClient?: grpc.Client;

	/** onConnection callback for server mode */
	private onConnectionCallback?: (connection: IServerConnection) => void;

	constructor(options: GrpcStreamProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
		this.base = new (class extends GrpcBaseProtocol {})();
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

	// =========================================================================
	// IAsyncProtocol Implementation
	// =========================================================================

	/**
	 * Start a gRPC streaming server
	 * @param config - Server configuration
	 * @param onConnection - Callback when client connects
	 */
	async startServer(
		config: ServerProtocolConfig,
		onConnection: (connection: IServerConnection) => void,
	): Promise<void> {
		this.onConnectionCallback = onConnection;

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
				this.onConnectionCallback = undefined;
				resolve();
			});
		});
	}

	/**
	 * Connect to a gRPC streaming server as a client
	 * @param config - Client configuration
	 * @returns IClientConnection for communicating with server
	 */
	async connect(config: ClientProtocolConfig): Promise<IClientConnection> {
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

		if (!methodName) {
			throw new Error("methodName is required in protocol options for streaming");
		}

		const grpcClient = this.grpcClient as unknown as Record<
			string,
			() => grpc.ClientDuplexStream<unknown, unknown>
		>;

		if (typeof grpcClient[methodName] !== "function") {
			throw new Error(`Method ${methodName} not found on service`);
		}

		const call = grpcClient[methodName]();
		this.client.isConnected = true;

		// Create socket wrapper
		const socketState = { connected: true };
		const socket: GrpcStreamSocket = {
			id: `grpc-client-${Date.now()}`,
			get connected() { return socketState.connected; },
			call,
		};

		const connection = this.createClientConnection(socket);

		// Setup stream event handlers
		call.on("data", (response: unknown) => {
			const dataObj = response as Record<string, unknown>;
			const messageType =
				(dataObj.message_type as string) || methodName || "unknown";
			const traceId = generateId(messageType);

			const message: Message = {
				type: messageType,
				payload: response,
				traceId,
			};
			connection._dispatchEvent(message);
		});

		call.on("error", (err) => {
			this.client.isConnected = false;
			socketState.connected = false;
			connection._notifyError(err);
		});

		call.on("end", () => {
			this.client.isConnected = false;
			socketState.connected = false;
			connection._notifyClose();
		});

		return connection;
	}

	// =========================================================================
	// Abstract Method Implementations (Protocol-Specific)
	// =========================================================================

	/**
	 * Send message through gRPC stream
	 */
	protected async sendToSocket(socket: GrpcStreamSocket, message: Message): Promise<void> {
		if (!socket.connected) {
			throw new Error("Stream is not connected");
		}
		socket.call.write(message.payload);
	}

	/**
	 * Close a gRPC stream
	 */
	protected async closeSocket(socket: GrpcStreamSocket): Promise<void> {
		socket.call.end();
	}

	/**
	 * Check if gRPC stream is connected
	 */
	protected isSocketConnected(socket: GrpcStreamSocket): boolean {
		return socket.connected;
	}

	/**
	 * Setup gRPC stream event handlers
	 * Note: For client streams, handlers are set up in connect() method
	 */
	protected setupSocketHandlers(
		_socket: GrpcStreamSocket,
		_handlers: {
			onMessage: (message: Message) => void;
			onClose: () => void;
			onError: (error: Error) => void;
		},
	): void {
		// For gRPC, handlers are set up directly on the call object
		// in createBidiStreamHandler (server) and connect (client)
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

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
				// Unary (fallback) - not used in v2 but kept for compatibility
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

			// Create socket wrapper for this stream
			const socketState = { connected: true };
			const socket: GrpcStreamSocket = {
				id: `grpc-server-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				get connected() { return socketState.connected; },
				call: call as unknown as grpc.ClientDuplexStream<unknown, unknown>,
			};

			// Create server connection wrapper
			const connection = this.createServerConnection(socket, socket.id);

			// Setup stream event handlers
			call.on("data", (request: unknown) => {
				const requestObj = request as Record<string, unknown>;
				const messageType = (requestObj.message_type as string) || methodName;
				const traceId = generateId(messageType);

				const message: Message = {
					type: messageType,
					payload: request,
					traceId,
				};
				connection._dispatchMessage(message);
			});

			call.on("end", () => {
				socketState.connected = false;
				connection._notifyClose();
			});

			call.on("error", (err) => {
				socketState.connected = false;
				connection._notifyError(err);
			});

			// Notify component of new connection
			if (this.onConnectionCallback) {
				this.onConnectionCallback(connection);
			}
		};
	}

	/**
	 * Create unary handler (fallback for non-streaming methods)
	 */
	private createUnaryHandler(
		methodName: string,
	): grpc.handleUnaryCall<unknown, unknown> {
		return async (_call, callback) => {
			// In v2, unary methods are not supported in stream protocol
			callback({
				code: grpc.status.UNIMPLEMENTED,
				message: `Unary method ${methodName} not supported in stream protocol`,
			});
		};
	}

	/**
	 * Dispose protocol and release all resources
	 */
	override async dispose(): Promise<void> {
		if (this.grpcClient) {
			this.grpcClient.close();
			this.grpcClient = undefined;
		}
		await this.stopServer();
		await super.dispose();
	}
}

/**
 * Create gRPC stream protocol factory
 */
export function createGrpcStreamProtocol(): GrpcStreamProtocol {
	return new GrpcStreamProtocol();
}
