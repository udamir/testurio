/**
 * gRPC Protocol
 *
 * Protocol for gRPC supporting:
 * - Unary calls (sync request/response)
 * - Bidirectional streaming (async)
 * - Client connections
 * - Mock servers
 * - Proxy servers
 *
 * Uses @grpc/grpc-js for proper gRPC implementation with protobuf support.
 */

import * as path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	IAsyncProtocol,
	ISyncProtocol,
	Message,
	ProtocolCharacteristics,
	SchemaDefinition,
} from "testurio";
// GrpcMessageMetadata type available in ./types if needed
import { BaseAsyncProtocol, BaseSyncProtocol, generateId } from "testurio";
import type {
	GrpcStreamServiceDefinition,
	GrpcStreamProtocolTypes,
	GrpcMetadata,
} from "./types";

/**
 * Pending message resolver for streaming
 */
interface PendingMessage {
	resolve: (message: Message) => void;
	reject: (error: Error) => void;
	messageType: string | string[];
	matcher?: string | ((payload: unknown) => boolean);
	timeout: NodeJS.Timeout;
}

/**
 * Loaded gRPC package definition
 */
interface LoadedSchema {
	packageDefinition: protoLoader.PackageDefinition;
	grpcObject: grpc.GrpcObject;
	services: Map<string, grpc.ServiceDefinition>;
}

/**
 * gRPC Unary protocol options
 */
export interface GrpcUnaryProtocolOptions {
	/** Path to .proto file(s) */
	schema?: string | string[];
	/** Service name to use for client calls */
	serviceName?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * gRPC Unary request options (used by client.request())
 */
export interface GrpcUnaryRequestOptions {
	/** Request payload */
	payload?: unknown;
	/** gRPC metadata */
	metadata?: Record<string, string>;
	/** Request timeout in milliseconds */
	timeout?: number;
}

export interface GrpcOperationRequest {
	payload: unknown;
	metadata?: GrpcMetadata;
}

export interface GrpcOperationResponse {
	payload: unknown;
	metadata?: GrpcMetadata;
}

export interface GrpcOperation {
	request: GrpcOperationRequest;
	response: GrpcOperationResponse;
}

export type GrpcOperations<T = Record<string, unknown>> = {
	[K in keyof T]?: GrpcOperation;
};

export class GrpcUnaryProtocol<T extends GrpcOperations<T> = GrpcOperations>
	extends BaseSyncProtocol<T, GrpcOperationRequest, GrpcOperationResponse>
	implements ISyncProtocol<T, GrpcOperationRequest, GrpcOperationResponse>
{
	readonly type = "grpc-unary";

	readonly characteristics: ProtocolCharacteristics = {
		type: "grpc-unary",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: true,
		bidirectional: false,
	};

	/** Public server/client handles required by ISyncProtocol */
	public server: { isRunning: boolean; ref?: grpc.Server } = {
		isRunning: false,
	};
	public client: { isConnected: boolean; ref?: grpc.Client } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: GrpcUnaryProtocolOptions;

	/** Loaded gRPC schema */
	private schema?: LoadedSchema;

	/** Active gRPC server instance */
	private grpcServer?: grpc.Server;

	/** Active gRPC client instance */
	private grpcClient?: grpc.Client;

	constructor(options: GrpcUnaryProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
	}

	/**
	 * Load Protobuf schema from .proto files using @grpc/proto-loader
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];

		// Automatically derive include directories from proto file paths
		const derivedIncludeDirs = new Set<string>();

		for (const protoPath of paths) {
			const absolutePath = path.resolve(protoPath);
			const protoDir = path.dirname(absolutePath);
			derivedIncludeDirs.add(protoDir);

			const parentDir = path.dirname(protoDir);
			if (parentDir && parentDir !== ".") {
				derivedIncludeDirs.add(parentDir);
			}
		}

		const absolutePaths = paths.map((p) => path.resolve(p));

		const packageDefinition = await protoLoader.load(absolutePaths, {
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
			includeDirs: Array.from(derivedIncludeDirs),
		});

		const grpcObject = grpc.loadPackageDefinition(packageDefinition);

		const services = new Map<string, grpc.ServiceDefinition>();
		this.extractServices(grpcObject, services);

		this.schema = { packageDefinition, grpcObject, services };

		return {
			type: "protobuf",
			content: {
				packageDefinition,
				grpcObject,
				services: Array.from(services.keys()),
			},
			validate: true,
		};
	}

	/**
	 * Extract services from gRPC object
	 */
	private extractServices(
		obj: grpc.GrpcObject,
		services: Map<string, grpc.ServiceDefinition>,
		prefix = "",
	): void {
		for (const [key, value] of Object.entries(obj)) {
			const fullName = prefix ? `${prefix}.${key}` : key;

			if (typeof value === "function" && "service" in value) {
				const serviceConstructor = value as grpc.ServiceClientConstructor;
				services.set(fullName, serviceConstructor.service);
				services.set(key, serviceConstructor.service);
			} else if (typeof value === "object" && value !== null) {
				this.extractServices(value as grpc.GrpcObject, services, fullName);
			}
		}
	}

	/**
	 * Get service client constructor by name
	 */
	getServiceClient(
		serviceName: string,
	): grpc.ServiceClientConstructor | undefined {
		if (!this.schema) return undefined;

		const parts = serviceName.split(".");
		let current: unknown = this.schema.grpcObject;

		for (const part of parts) {
			if (current && typeof current === "object" && part in current) {
				current = (current as Record<string, unknown>)[part];
			} else {
				return undefined;
			}
		}

		if (typeof current === "function" && "service" in current) {
			return current as grpc.ServiceClientConstructor;
		}

		return undefined;
	}

	/**
	 * Start a gRPC server (mock or proxy)
	 */
	async startServer(config: ServerProtocolConfig): Promise<void> {
		// Auto-load schema from options if not already loaded
		if (!this.schema && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		return new Promise((resolve, reject) => {
			const server = new grpc.Server();

			// If we have a schema, add service implementations
			if (this.schema) {
				const addedServices = new Set<grpc.ServiceDefinition>();
				for (const [_serviceName, serviceDefinition] of this.schema.services) {
					if (addedServices.has(serviceDefinition)) continue;
					addedServices.add(serviceDefinition);

					const implementation =
						this.createServiceImplementation(serviceDefinition);
					server.addService(serviceDefinition, implementation);
				}
			}

			const credentials = config.tls
				? grpc.ServerCredentials.createSsl(
						config.tls.ca ? Buffer.from(config.tls.ca) : null,
						config.tls.cert && config.tls.key
							? [
									{
										cert_chain: Buffer.from(config.tls.cert),
										private_key: Buffer.from(config.tls.key),
									},
								]
							: [],
					)
				: grpc.ServerCredentials.createInsecure();

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
	 * Create service implementation for mock server
	 */
	private createServiceImplementation(
		serviceDefinition: grpc.ServiceDefinition,
	): grpc.UntypedServiceImplementation {
		const implementation: grpc.UntypedServiceImplementation = {};

		for (const [methodName, methodDefinition] of Object.entries(
			serviceDefinition,
		)) {
			if (!methodDefinition.requestStream && !methodDefinition.responseStream) {
				// Unary method
				implementation[methodName] = this.createUnaryHandler(methodName);
			}
		}

		return implementation;
	}

	/**
	 * Extract gRPC metadata from call
	 */
	private extractGrpcMetadata(
		callMetadata: grpc.Metadata,
	): Record<string, string> {
		const result: Record<string, string> = {};
		const metadataMap = callMetadata.getMap();
		for (const [key, value] of Object.entries(metadataMap)) {
			if (typeof value === "string") {
				result[key] = value;
			} else if (Buffer.isBuffer(value)) {
				result[key] = value.toString("utf-8");
			}
		}
		return result;
	}

	/**
	 * Create unary method handler
	 */
	private createUnaryHandler(
		methodName: string,
	): grpc.handleUnaryCall<unknown, unknown> {
		return async (call, callback) => {
			const rawPayload = call.request;
			// Extract metadata from gRPC call
			const metadata = this.extractGrpcMetadata(call.metadata);

			// Wrap request in { payload, metadata } format for handlers
			const wrappedRequest = { payload: rawPayload, metadata };

			// Delegate to component callback for request handling
			if (this.requestHandler) {
				try {
					const result = await this.requestHandler(methodName, wrappedRequest);

					if (result === null) {
						callback({
							code: grpc.status.CANCELLED,
							message: "Request dropped",
						});
						return;
					}

					// Unwrap response: expect { payload, metadata? } format from handlers
					const response = result as
						| {
								payload?: unknown;
								metadata?: Record<string, string>;
								grpcStatus?: number;
								grpcMessage?: string;
						  }
						| undefined;

					// Check if response contains gRPC error status
					if (
						response &&
						typeof response === "object" &&
						"grpcStatus" in response
					) {
						const grpcStatus = response.grpcStatus as number;
						if (grpcStatus !== 0) {
							callback({
								code: grpcStatus,
								message: (response.grpcMessage as string) || "Error",
							});
							return;
						}
					}

					// Extract payload from wrapped response
					const responsePayload = response?.payload ?? response;
					callback(null, responsePayload);
					return;
				} catch (error) {
					callback({
						code: grpc.status.INTERNAL,
						message: error instanceof Error ? error.message : "Unknown error",
					});
					return;
				}
			}

			callback({
				code: grpc.status.UNIMPLEMENTED,
				message: `No handler for method: ${methodName}`,
			});
		};
	}

	/**
	 * Stop a gRPC server
	 */
	async stopServer(): Promise<void> {
		if (!this.grpcServer) {
			return;
		}

		const serverToStop = this.grpcServer;
		return new Promise((resolve) => {
			serverToStop.tryShutdown(() => {
				this.grpcServer = undefined;
				this.server.isRunning = false;
				resolve();
			});
		});
	}

	/**
	 * Create a gRPC client
	 */
	async createClient(config: ClientProtocolConfig): Promise<void> {
		// Auto-load schema from options if not already loaded
		if (!this.schema && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		// Get the service client constructor
		const serviceName = this.protocolOptions.serviceName;

		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else if (this.schema) {
			// Get first available service
			for (const [name] of this.schema.services) {
				ServiceClient = this.getServiceClient(name);
				if (ServiceClient) break;
			}
		}

		if (!ServiceClient) {
			throw new Error(
				`Service ${serviceName || "any"} not found. Make sure to load schema first.`,
			);
		}

		const credentials = config.tls
			? grpc.credentials.createSsl(
					config.tls.ca ? Buffer.from(config.tls.ca) : undefined,
					config.tls.key ? Buffer.from(config.tls.key) : undefined,
					config.tls.cert ? Buffer.from(config.tls.cert) : undefined,
				)
			: grpc.credentials.createInsecure();

		this.grpcClient = new ServiceClient(
			`${config.targetAddress.host}:${config.targetAddress.port}`,
			credentials,
		);

		this.client.isConnected = true;
	}

	/**
	 * Close a gRPC client
	 */
	async closeClient(): Promise<void> {
		if (this.grpcClient) {
			this.grpcClient.close();
			this.grpcClient = undefined;
		}
		this.client.isConnected = false;
	}

	/**
	 * Make unary RPC call (request/response)
	 * @param messageType - gRPC method name (e.g., "GetUser", "CreateOrder")
	 * @param data - Request data: either GrpcUnaryRequestOptions { payload, metadata } or raw payload
	 * @param _timeout - Request timeout in milliseconds (optional)
	 * @returns Response payload directly (not wrapped in SyncResponse)
	 */
	async request<TRes = unknown>(
		messageType: string,
		data?: unknown,
		_timeout?: number,
	): Promise<TRes> {
		if (!this.grpcClient) {
			throw new Error("Client is not connected");
		}

		if (!this.client.isConnected) {
			throw new Error("Client is not connected");
		}

		// Normalize data: if it has 'payload' property, treat as GrpcUnaryRequestOptions
		// Otherwise treat as raw payload (for proxy forwarding)
		const isOptions = data && typeof data === "object" && "payload" in data;
		const options = isOptions ? (data as GrpcUnaryRequestOptions) : undefined;
		const payload = isOptions ? options?.payload : data;

		// Create gRPC metadata from options.metadata
		const grpcMetadata = new grpc.Metadata();
		if (options?.metadata) {
			for (const [key, value] of Object.entries(options.metadata)) {
				grpcMetadata.add(key, value);
			}
		}

		const grpcClient = this.grpcClient as unknown as Record<
			string,
			(
				request: unknown,
				metadata: grpc.Metadata,
				callback: (err: grpc.ServiceError | null, response: TRes) => void,
			) => void
		>;

		if (typeof grpcClient[messageType] !== "function") {
			throw new Error(`Method ${messageType} not found on client`);
		}

		return new Promise((resolve, reject) => {
			grpcClient[messageType](payload, grpcMetadata, (err, response) => {
				if (err) {
					// Preserve gRPC error details
					const error = new Error(err.message) as Error & {
						code?: number;
						details?: string;
					};
					error.code = err.code;
					error.details = err.details;
					reject(error);
				} else {
					// Wrap response in { payload, metadata } format
					// Note: gRPC trailing metadata would need to be extracted from call if needed
					const wrappedResponse = { payload: response } as TRes;
					resolve(wrappedResponse);
				}
			});
		});
	}

	/**
	 * Respond to a request (not used for gRPC unary - responses are sent via callback)
	 */
	respond(_traceId: string, _payload: unknown): void {
		// gRPC unary responses are handled via callback in the handler
	}
}

/**
 * gRPC Stream protocol options
 */
export interface GrpcStreamProtocolOptions {
	/** Path to .proto file(s) */
	schema?: string | string[];
	/** Service name to use for client calls */
	serviceName?: string;
	/** Method name for streaming */
	methodName?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * gRPC Stream Adapter (async bidirectional streaming)
 *
 * Uses @grpc/grpc-js for proper gRPC streaming.
 */
export class GrpcStreamProtocol<
		S extends GrpcStreamServiceDefinition = GrpcStreamServiceDefinition,
	>
	extends BaseAsyncProtocol
	implements IAsyncProtocol
{
	/**
	 * Phantom type property for type inference.
	 * Used by components to infer message types.
	 */
	declare readonly __types: GrpcStreamProtocolTypes<S>;

	readonly type = "grpc-stream";

	readonly characteristics: ProtocolCharacteristics = {
		type: "grpc-stream",
		async: true,
		supportsProxy: true,
		supportsMock: true,
		streaming: true,
		requiresConnection: true,
		bidirectional: true,
	};

	/** Public server/client handles */
	public server: { isRunning: boolean; ref?: grpc.Server } = {
		isRunning: false,
	};
	public client: { isConnected: boolean; ref?: grpc.Client } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: GrpcStreamProtocolOptions;

	/** Loaded gRPC schema */
	private schema?: LoadedSchema;

	/** Active gRPC server instance */
	private grpcServer?: grpc.Server;

	/** Active gRPC client instance */
	private grpcClient?: grpc.Client;

	/** Active stream call */
	private streamCall?: grpc.ClientDuplexStream<unknown, unknown>;

	/** Pending messages waiting for response */
	private pendingMessages = new Map<string, PendingMessage>();

	/** Message queue for received messages */
	private messageQueue: Message[] = [];

	constructor(options: GrpcStreamProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
	}

	/**
	 * Load Protobuf schema from .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const inputPaths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
		const paths = inputPaths.map((p) => path.resolve(p));

		const derivedIncludeDirs = new Set<string>();

		for (const protoPath of paths) {
			const protoDir = path.dirname(protoPath);
			derivedIncludeDirs.add(protoDir);

			const parentDir = path.dirname(protoDir);
			if (parentDir && parentDir !== ".") {
				derivedIncludeDirs.add(parentDir);
			}
		}

		const packageDefinition = await protoLoader.load(paths, {
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
			includeDirs: Array.from(derivedIncludeDirs),
		});

		const grpcObject = grpc.loadPackageDefinition(packageDefinition);

		const services = new Map<string, grpc.ServiceDefinition>();
		this.extractServices(grpcObject, services);

		this.schema = { packageDefinition, grpcObject, services };

		return {
			type: "protobuf",
			content: {
				packageDefinition,
				grpcObject,
				services: Array.from(services.keys()),
			},
			validate: true,
		};
	}

	/**
	 * Extract services from gRPC object
	 */
	private extractServices(
		obj: grpc.GrpcObject,
		services: Map<string, grpc.ServiceDefinition>,
		prefix = "",
	): void {
		for (const [key, value] of Object.entries(obj)) {
			const fullName = prefix ? `${prefix}.${key}` : key;

			if (typeof value === "function" && "service" in value) {
				const serviceConstructor = value as grpc.ServiceClientConstructor;
				services.set(fullName, serviceConstructor.service);
				services.set(key, serviceConstructor.service);
			} else if (typeof value === "object" && value !== null) {
				this.extractServices(value as grpc.GrpcObject, services, fullName);
			}
		}
	}

	/**
	 * Get service client constructor by name
	 */
	getServiceClient(
		serviceName: string,
	): grpc.ServiceClientConstructor | undefined {
		if (!this.schema) return undefined;

		const parts = serviceName.split(".");
		let current: unknown = this.schema.grpcObject;

		for (const part of parts) {
			if (current && typeof current === "object" && part in current) {
				current = (current as Record<string, unknown>)[part];
			} else {
				return undefined;
			}
		}

		if (typeof current === "function" && "service" in current) {
			return current as grpc.ServiceClientConstructor;
		}

		return undefined;
	}

	/**
	 * Start a gRPC streaming server
	 */
	async startServer(config: ServerProtocolConfig): Promise<void> {
		// Auto-load schema from options if not already loaded
		if (!this.schema && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		return new Promise((resolve, reject) => {
			const server = new grpc.Server();

			// If we have a schema, add service implementations
			if (this.schema) {
				const addedServices = new Set<grpc.ServiceDefinition>();
				for (const [_serviceName, serviceDefinition] of this.schema.services) {
					if (addedServices.has(serviceDefinition)) continue;
					addedServices.add(serviceDefinition);

					const implementation =
						this.createStreamServiceImplementation(serviceDefinition);
					server.addService(serviceDefinition, implementation);
				}
			}

			const credentials = config.tls
				? grpc.ServerCredentials.createSsl(
						config.tls.ca ? Buffer.from(config.tls.ca) : null,
						config.tls.cert && config.tls.key
							? [
									{
										cert_chain: Buffer.from(config.tls.cert),
										private_key: Buffer.from(config.tls.key),
									},
								]
							: [],
					)
				: grpc.ServerCredentials.createInsecure();

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
	 * Extract gRPC metadata from call
	 */
	private extractGrpcMetadata(
		callMetadata: grpc.Metadata,
	): Record<string, string> {
		const result: Record<string, string> = {};
		const metadataMap = callMetadata.getMap();
		for (const [key, value] of Object.entries(metadataMap)) {
			if (typeof value === "string") {
				result[key] = value;
			} else if (Buffer.isBuffer(value)) {
				result[key] = value.toString("utf-8");
			}
		}
		return result;
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
			this.extractGrpcMetadata(call.metadata);

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
		if (!this.schema && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		const serviceName = this.protocolOptions.serviceName;
		const methodName = this.protocolOptions.methodName;

		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else if (this.schema) {
			for (const [name] of this.schema.services) {
				ServiceClient = this.getServiceClient(name);
				if (ServiceClient) break;
			}
		}

		if (!ServiceClient) {
			throw new Error(
				`Service ${serviceName || "any"} not found. Make sure to load schema first.`,
			);
		}

		const credentials = config.tls
			? grpc.credentials.createSsl(
					config.tls.ca ? Buffer.from(config.tls.ca) : undefined,
					config.tls.key ? Buffer.from(config.tls.key) : undefined,
					config.tls.cert ? Buffer.from(config.tls.cert) : undefined,
				)
			: grpc.credentials.createInsecure();

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

		let processedMessage = message;
		if (this.hookRegistry) {
			const hookResult = await this.hookRegistry.executeHooks(message);
			if (hookResult === null) {
				return;
			}
			processedMessage = hookResult;
		}

		// Check pending messages
		for (const [pendingId, pending] of Array.from(
			this.pendingMessages.entries(),
		)) {
			const types = Array.isArray(pending.messageType)
				? pending.messageType
				: [pending.messageType];

			if (types.includes(processedMessage.type)) {
				if (this.matchesPending(processedMessage, pending)) {
					clearTimeout(pending.timeout);
					this.pendingMessages.delete(pendingId);
					pending.resolve(processedMessage);
					return;
				}
			}
		}

		this.messageQueue.push(processedMessage);
	}

	/**
	 * Check if message matches pending request
	 */
	private matchesPending(message: Message, pending: PendingMessage): boolean {
		if (!pending.matcher) return true;

		if (typeof pending.matcher === "string") {
			return message.traceId === pending.matcher;
		}

		return pending.matcher(message.payload);
	}

	/**
	 * Close a gRPC streaming client
	 */
	async closeClient(): Promise<void> {
		// Reject all pending messages
		for (const [, pending] of Array.from(this.pendingMessages.entries())) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Client disconnected"));
		}
		this.pendingMessages.clear();
		this.messageQueue = [];

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

	/**
	 * Find message in queue
	 */
	private findInQueue(
		types: string[],
		matcher?: string | ((payload: unknown) => boolean),
	): Message | undefined {
		const index = this.messageQueue.findIndex((msg) => {
			if (!types.includes(msg.type)) return false;

			if (matcher) {
				if (typeof matcher === "string") {
					return msg.traceId === matcher;
				}
				return matcher(msg.payload);
			}

			return true;
		});

		if (index >= 0) {
			return this.messageQueue.splice(index, 1)[0];
		}

		return undefined;
	}
}

/**
 * Create gRPC unary protocol factory
 */
export function createGrpcUnaryProtocol(): GrpcUnaryProtocol {
	return new GrpcUnaryProtocol();
}

/**
 * Create gRPC stream protocol factory
 */
export function createGrpcStreamProtocol(): GrpcStreamProtocol {
	return new GrpcStreamProtocol();
}

