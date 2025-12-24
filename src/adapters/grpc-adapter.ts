/**
 * gRPC Protocol Adapter
 *
 * Adapter for gRPC protocol supporting:
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
	Message,
	ProtocolCharacteristics,
	SchemaDefinition,
	GrpcMessageMetadata,
	GrpcErrorResponse,
} from "../types";
import { BaseProtocolAdapter, generateHandleId } from "./base-adapter";
import type {
	AdapterClientHandle,
	AdapterServerHandle,
	AdapterClientConfig,
	ServerConfig,
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
 * gRPC-specific server handle
 */
interface GrpcServerHandle extends AdapterServerHandle {
	_internal: {
		server: grpc.Server;
		isProxy: boolean;
		targetAddress?: { host: string; port: number };
		isStreaming: boolean;
		schema?: LoadedSchema;
	};
}

/**
 * gRPC-specific client handle for unary calls
 */
interface GrpcUnaryClientHandle extends AdapterClientHandle {
	_internal: {
		client: grpc.Client;
		schema?: LoadedSchema;
		serviceName?: string;
	};
}

/**
 * gRPC-specific client handle for streaming
 */
interface GrpcStreamClientHandle extends AdapterClientHandle {
	_internal: {
		client: grpc.Client;
		call?: grpc.ClientDuplexStream<unknown, unknown>;
		pendingMessages: Map<string, PendingMessage>;
		messageQueue: Message[];
		schema?: LoadedSchema;
		serviceName?: string;
		methodName?: string;
	};
}

/**
 * gRPC Unary Adapter (sync request/response)
 *
 * Uses @grpc/grpc-js for proper gRPC unary calls.
 */
export class GrpcUnaryAdapter extends BaseProtocolAdapter {
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

	/** Loaded gRPC schema */
	private schema?: LoadedSchema;

	/**
	 * Load Protobuf schema from .proto files using @grpc/proto-loader
	 * 
	 * Automatically derives include directories from proto file paths to resolve imports.
	 * For example, if proto file is at "src/router/proto/services.proto" and imports "proto/auth.proto",
	 * the include path "src/router" will be added automatically.
	 * 
	 * @param schemaPath - Path(s) to .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];

		// Automatically derive include directories from proto file paths
		// This handles imports like "proto/auth.proto" by adding parent directories
		const derivedIncludeDirs = new Set<string>();
		
		for (const protoPath of paths) {
			// Resolve to absolute path for deriving include dirs
			const absolutePath = path.resolve(protoPath);
			
			// Add the directory containing the proto file
			const protoDir = path.dirname(absolutePath);
			derivedIncludeDirs.add(protoDir);
			
			// Add parent directory to handle imports like "proto/file.proto"
			const parentDir = path.dirname(protoDir);
			if (parentDir && parentDir !== ".") {
				derivedIncludeDirs.add(parentDir);
			}
		}

		// Use absolute paths for loading to avoid cwd issues
		const absolutePaths = paths.map(p => path.resolve(p));

		const packageDefinition = await protoLoader.load(absolutePaths, {
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
			includeDirs: Array.from(derivedIncludeDirs),
		});

		const grpcObject = grpc.loadPackageDefinition(packageDefinition);

		// Extract services from the package definition
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
				// This is a service constructor
				const serviceConstructor = value as grpc.ServiceClientConstructor;
				services.set(fullName, serviceConstructor.service);
				services.set(key, serviceConstructor.service);
			} else if (typeof value === "object" && value !== null) {
				// Recurse into nested namespaces
				this.extractServices(value as grpc.GrpcObject, services, fullName);
			}
		}
	}

	/**
	 * Get service client constructor by name
	 */
	getServiceClient(serviceName: string): grpc.ServiceClientConstructor | undefined {
		if (!this.schema) return undefined;

		// Navigate to the service in the grpc object
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
	async startServer(config: ServerConfig): Promise<GrpcServerHandle> {
		const id = generateHandleId("grpc-server");
		const isProxy = !!config.targetAddress;

		return new Promise((resolve, reject) => {
			const server = new grpc.Server();

			// If we have a schema, add service implementations
			// Use Set to track added services and avoid duplicates
			if (this.schema) {
				const addedServices = new Set<grpc.ServiceDefinition>();
				for (const [_serviceName, serviceDefinition] of this.schema.services) {
					if (addedServices.has(serviceDefinition)) continue;
					addedServices.add(serviceDefinition);

					const implementation = this.createServiceImplementation(
						id,
						serviceDefinition,
						isProxy,
						config.targetAddress,
					);
					server.addService(serviceDefinition, implementation);
				}
			}

			const credentials = config.tls
				? grpc.ServerCredentials.createSsl(
						config.tls.ca ? Buffer.from(config.tls.ca) : null,
						config.tls.cert && config.tls.key
							? [{ cert_chain: Buffer.from(config.tls.cert), private_key: Buffer.from(config.tls.key) }]
							: [],
					)
				: grpc.ServerCredentials.createInsecure();

			server.bindAsync(
				`${config.listenAddress.host}:${config.listenAddress.port}`,
				credentials,
				(err, port) => {
					if (err) {
						reject(err);
						return;
					}

					const handle: GrpcServerHandle = {
						id,
						type: this.type,
						address: { ...config.listenAddress, port },
						isRunning: true,
						_internal: {
							server,
							isProxy,
							targetAddress: config.targetAddress,
							isStreaming: false,
							schema: this.schema,
						},
					};

					this.servers.set(id, handle);
					resolve(handle);
				},
			);
		});
	}

	/**
	 * Create service implementation for mock server
	 */
	private createServiceImplementation(
		serverId: string,
		serviceDefinition: grpc.ServiceDefinition,
		isProxy: boolean,
		targetAddress?: { host: string; port: number },
	): grpc.UntypedServiceImplementation {
		const implementation: grpc.UntypedServiceImplementation = {};

		for (const [methodName, methodDefinition] of Object.entries(serviceDefinition)) {
			if (!methodDefinition.requestStream && !methodDefinition.responseStream) {
				// Unary method
				implementation[methodName] = this.createUnaryHandler(
					serverId,
					methodName,
					isProxy,
					targetAddress,
				);
			}
		}

		return implementation;
	}

	/**
	 * Extract gRPC metadata from call
	 */
	private extractGrpcMetadata(callMetadata: grpc.Metadata): Record<string, string> {
		const result: Record<string, string> = {};
		const metadataMap = callMetadata.getMap();
		for (const [key, value] of Object.entries(metadataMap)) {
			if (typeof value === 'string') {
				result[key] = value;
			} else if (Buffer.isBuffer(value)) {
				result[key] = value.toString('utf-8');
			}
		}
		return result;
	}

	/**
	 * Create unary method handler
	 */
	private createUnaryHandler(
		serverId: string,
		methodName: string,
		isProxy: boolean,
		targetAddress?: { host: string; port: number },
	): grpc.handleUnaryCall<unknown, unknown> {
		return async (call, callback) => {
			const request = call.request;
			const grpcMetadata = this.extractGrpcMetadata(call.metadata);

			// Try hook-based handlers first
			if (this.hookRegistry) {
				const message: Message = {
					type: methodName,
					payload: { method: methodName, payload: request },
					metadata: {
						method: methodName,
						path: methodName,
						grpcMetadata,
					},
				};

				const hookResult = await this.hookRegistry.executeHooks(message);

				if (hookResult === null) {
					callback({ code: grpc.status.CANCELLED, message: "Request dropped" });
					return;
				}

				if (hookResult.type === "response") {
					const response = hookResult.payload as { body?: unknown; grpcStatus?: number; grpcMessage?: string };
					// Check if response body contains gRPC error status
					const body = response.body as Record<string, unknown> | undefined;
					if (body && typeof body === 'object' && 'grpcStatus' in body) {
						const grpcStatus = body.grpcStatus as number;
						if (grpcStatus !== 0) {
							callback({
								code: grpcStatus,
								message: (body.grpcMessage as string) || 'Error',
							});
							return;
						}
					}
					callback(null, response.body ?? response);
					return;
				}
			}

			// Fall back to direct handlers
			const handler = this.getRequestHandler(serverId, methodName, methodName);

			if (handler) {
				const metadata: GrpcMessageMetadata = {
					timestamp: Date.now(),
					direction: "inbound",
					method: methodName,
					grpcMetadata,
				};

				try {
					const result = await handler({ method: methodName, payload: request }, metadata);
					// Check if result contains gRPC error status
					if (result && typeof result === 'object' && 'grpcStatus' in result) {
						const grpcResult = result as GrpcErrorResponse;
						if (grpcResult.grpcStatus !== 0) {
							callback({
								code: grpcResult.grpcStatus,
								message: grpcResult.grpcMessage || 'Error',
							});
							return;
						}
						callback(null, grpcResult.body ?? result);
						return;
					}
					callback(null, result);
				} catch (error) {
					callback({
						code: grpc.status.INTERNAL,
						message: error instanceof Error ? error.message : "Unknown error",
					});
				}
				return;
			}

			// No handler - check if proxy mode
			if (isProxy && targetAddress && this.schema) {
				// Forward request to target server
				try {
					const response = await this.forwardUnaryRequest(
						targetAddress,
						methodName,
						request,
						grpcMetadata,
					);
					callback(null, response);
				} catch (error) {
					// Preserve original gRPC status code if available
					if (error && typeof error === 'object' && 'code' in error) {
						const grpcError = error as grpc.ServiceError;
						callback({
							code: grpcError.code,
							message: grpcError.message || "Proxy error",
							details: grpcError.details,
						});
					} else {
						callback({
							code: grpc.status.INTERNAL,
							message: error instanceof Error ? error.message : "Proxy error",
						});
					}
				}
				return;
			}

			callback({ code: grpc.status.UNIMPLEMENTED, message: `No handler for method: ${methodName}` });
		};
	}

	/**
	 * Forward unary request to target server (proxy mode)
	 */
	private async forwardUnaryRequest(
		targetAddress: { host: string; port: number },
		methodName: string,
		request: unknown,
		incomingMetadata?: Record<string, string>,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.schema) {
				reject(new Error("Schema not loaded"));
				return;
			}

			// Find the service that contains this method
			let ServiceClient: grpc.ServiceClientConstructor | undefined;
			for (const [serviceName] of this.schema.services) {
				const client = this.getServiceClient(serviceName);
				if (client) {
					ServiceClient = client;
					break;
				}
			}

			if (!ServiceClient) {
				reject(new Error("No service client found"));
				return;
			}

			const client = new ServiceClient(
				`${targetAddress.host}:${targetAddress.port}`,
				grpc.credentials.createInsecure(),
			);

			// Create metadata for forwarding
			const metadata = new grpc.Metadata();
			if (incomingMetadata) {
				for (const [key, value] of Object.entries(incomingMetadata)) {
					metadata.add(key, value);
				}
			}

			const grpcClient = client as unknown as Record<
				string,
				(request: unknown, metadata: grpc.Metadata, callback: (err: grpc.ServiceError | null, response: unknown) => void) => void
			>;

			if (typeof grpcClient[methodName] !== "function") {
				client.close();
				reject(new Error(`Method ${methodName} not found`));
				return;
			}

			grpcClient[methodName](request, metadata, (err, response) => {
				client.close();
				if (err) {
					reject(err);
				} else {
					resolve(response);
				}
			});
		});
	}

	/**
	 * Stop a gRPC server
	 */
	async stopServer(server: AdapterServerHandle): Promise<void> {
		const handle = this.servers.get(server.id) as GrpcServerHandle | undefined;
		if (!handle) {
			throw new Error(`Server ${server.id} not found`);
		}

		return new Promise((resolve) => {
			handle._internal.server.tryShutdown(() => {
				handle.isRunning = false;
				this.cleanupServer(server.id);
				resolve();
			});
		});
	}

	/**
	 * Create a gRPC client
	 */
	async createClient(config: AdapterClientConfig): Promise<GrpcUnaryClientHandle> {
		const id = generateHandleId("grpc-client");

		// Get the service client constructor
		const serviceName = (config.options as Record<string, unknown> | undefined)?.serviceName as string | undefined;
		
		// If no service name provided, try to get the first available service (for proxy mode)
		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else if (this.schema) {
			// Get first available service for proxy mode
			for (const [name] of this.schema.services) {
				ServiceClient = this.getServiceClient(name);
				if (ServiceClient) break;
			}
		}

		if (!ServiceClient) {
			throw new Error(`Service ${serviceName || "any"} not found. Make sure to load schema first.`);
		}

		const credentials = config.tls
			? grpc.credentials.createSsl(
					config.tls.ca ? Buffer.from(config.tls.ca) : undefined,
					config.tls.key ? Buffer.from(config.tls.key) : undefined,
					config.tls.cert ? Buffer.from(config.tls.cert) : undefined,
				)
			: grpc.credentials.createInsecure();

		const client = new ServiceClient(
			`${config.targetAddress.host}:${config.targetAddress.port}`,
			credentials,
		);

		const handle: GrpcUnaryClientHandle = {
			id,
			type: this.type,
			address: config.targetAddress,
			isConnected: true,
			_internal: {
				client,
				schema: this.schema,
				serviceName,
			},
		};

		this.clients.set(id, handle);
		return handle;
	}

	/**
	 * Close a gRPC client
	 */
	async closeClient(client: AdapterClientHandle): Promise<void> {
		const handle = this.clients.get(client.id) as GrpcUnaryClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		handle._internal.client.close();
		handle.isConnected = false;
		this.cleanupClient(client.id);
	}

	/**
	 * Make unary RPC call (request/response)
	 */
	async request<TReq = unknown, TRes = unknown>(
		client: AdapterClientHandle,
		method: string,
		_path: string,
		payload?: TReq,
		headers?: Record<string, string>,
	): Promise<TRes> {
		const handle = this.clients.get(client.id) as GrpcUnaryClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		// Create metadata from headers
		const metadata = new grpc.Metadata();
		if (headers) {
			for (const [key, value] of Object.entries(headers)) {
				metadata.add(key, value);
			}
		}

		const grpcClient = handle._internal.client as unknown as Record<
			string,
			(request: TReq, metadata: grpc.Metadata, callback: (err: grpc.ServiceError | null, response: TRes) => void) => void
		>;

		if (typeof grpcClient[method] !== "function") {
			throw new Error(`Method ${method} not found on client`);
		}

		return new Promise((resolve, reject) => {
			grpcClient[method](payload as TReq, metadata, (err, response) => {
				if (err) {
					// Preserve gRPC error details
					const error = new Error(err.message) as Error & { code?: number; details?: string };
					error.code = err.code;
					error.details = err.details;
					reject(error);
				} else {
					resolve(response);
				}
			});
		});
	}
}

/**
 * gRPC Stream Adapter (async bidirectional streaming)
 *
 * Uses @grpc/grpc-js for proper gRPC streaming.
 */
export class GrpcStreamAdapter extends BaseProtocolAdapter {
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

	/** Loaded gRPC schema */
	private schema?: LoadedSchema;

	/**
	 * Load Protobuf schema from .proto files
	 * 
	 * Automatically derives include directories from proto file paths to resolve imports.
	 * For example, if proto file is at "src/router/proto/services.proto" and imports "proto/auth.proto",
	 * the include path "src/router" will be added automatically.
	 * 
	 * @param schemaPath - Path(s) to .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const inputPaths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
		
		// Resolve all paths to absolute paths
		const paths = inputPaths.map(p => path.resolve(p));

		// Automatically derive include directories from proto file paths
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
	getServiceClient(serviceName: string): grpc.ServiceClientConstructor | undefined {
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
	async startServer(config: ServerConfig): Promise<GrpcServerHandle> {
		const id = generateHandleId("grpc-stream-server");
		const isProxy = !!config.targetAddress;

		return new Promise((resolve, reject) => {
			const server = new grpc.Server();

			// If we have a schema, add service implementations
			// Use Set to track added services and avoid duplicates
			if (this.schema) {
				const addedServices = new Set<grpc.ServiceDefinition>();
				for (const [_serviceName, serviceDefinition] of this.schema.services) {
					if (addedServices.has(serviceDefinition)) continue;
					addedServices.add(serviceDefinition);

					const implementation = this.createStreamServiceImplementation(
						id,
						serviceDefinition,
						isProxy,
						config.targetAddress,
					);
					server.addService(serviceDefinition, implementation);
				}
			}

			const credentials = config.tls
				? grpc.ServerCredentials.createSsl(
						config.tls.ca ? Buffer.from(config.tls.ca) : null,
						config.tls.cert && config.tls.key
							? [{ cert_chain: Buffer.from(config.tls.cert), private_key: Buffer.from(config.tls.key) }]
							: [],
					)
				: grpc.ServerCredentials.createInsecure();

			server.bindAsync(
				`${config.listenAddress.host}:${config.listenAddress.port}`,
				credentials,
				(err, port) => {
					if (err) {
						reject(err);
						return;
					}

					const handle: GrpcServerHandle = {
						id,
						type: this.type,
						address: { ...config.listenAddress, port },
						isRunning: true,
						_internal: {
							server,
							isProxy,
							targetAddress: config.targetAddress,
							isStreaming: true,
							schema: this.schema,
						},
					};

					this.servers.set(id, handle);
					resolve(handle);
				},
			);
		});
	}

	/**
	 * Extract gRPC metadata from call
	 */
	private extractGrpcMetadata(callMetadata: grpc.Metadata): Record<string, string> {
		const result: Record<string, string> = {};
		const metadataMap = callMetadata.getMap();
		for (const [key, value] of Object.entries(metadataMap)) {
			if (typeof value === 'string') {
				result[key] = value;
			} else if (Buffer.isBuffer(value)) {
				result[key] = value.toString('utf-8');
			}
		}
		return result;
	}

	/**
	 * Create streaming service implementation
	 */
	private createStreamServiceImplementation(
		serverId: string,
		serviceDefinition: grpc.ServiceDefinition,
		isProxy: boolean,
		targetAddress?: { host: string; port: number },
	): grpc.UntypedServiceImplementation {
		const implementation: grpc.UntypedServiceImplementation = {};

		for (const [methodName, methodDefinition] of Object.entries(serviceDefinition)) {
			if (methodDefinition.requestStream && methodDefinition.responseStream) {
				// Bidirectional streaming
				implementation[methodName] = this.createBidiStreamHandler(
					serverId,
					methodName,
					isProxy,
					targetAddress,
				);
			} else if (methodDefinition.requestStream) {
				// Client streaming
				implementation[methodName] = this.createClientStreamHandler(
					serverId,
					methodName,
				);
			} else if (methodDefinition.responseStream) {
				// Server streaming
				implementation[methodName] = this.createServerStreamHandler(
					serverId,
					methodName,
				);
			} else {
				// Unary (fallback)
				implementation[methodName] = this.createUnaryHandler(serverId, methodName);
			}
		}

		return implementation;
	}

	/**
	 * Create bidirectional stream handler
	 */
	private createBidiStreamHandler(
		serverId: string,
		methodName: string,
		isProxy: boolean,
		targetAddress?: { host: string; port: number },
	): grpc.handleBidiStreamingCall<unknown, unknown> {
		return (call) => {
			// Extract metadata once at connection time
			const grpcMetadata = this.extractGrpcMetadata(call.metadata);

			// If proxy mode, set up forwarding to target
			let proxyCall: grpc.ClientDuplexStream<unknown, unknown> | undefined;
			if (isProxy && targetAddress && this.schema) {
				proxyCall = this.createProxyStream(targetAddress, methodName, call, grpcMetadata);
			}

			call.on("data", async (request: unknown) => {
				// Extract message type from payload if available, otherwise use method name
				const requestObj = request as Record<string, unknown>;
				const messageType = (requestObj.message_type as string) || methodName;

				// Try hook-based handlers first
				if (this.hookRegistry) {
					const message: Message = {
						type: messageType,
						payload: request,
						metadata: {
							method: methodName,
							timestamp: Date.now(),
							direction: "inbound",
							grpcMetadata,
						},
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

				// Fall back to direct handlers
				const handlers = this.getMessageHandlers(serverId, messageType);

				if (handlers.length > 0) {
					for (const handler of handlers) {
						try {
							const result = await handler(request, {
								timestamp: Date.now(),
								direction: "inbound",
								grpcMetadata,
							});
							if (result !== null && result !== undefined) {
								call.write(result);
							}
						} catch (_error) {
							// Handler error
						}
					}
					return;
				}

				// No handlers - forward to proxy if available
				if (proxyCall) {
					proxyCall.write(request);
				}
			});

			call.on("end", () => {
				if (proxyCall) {
					proxyCall.end();
				} else {
					call.end();
				}
			});

			call.on("error", () => {
				if (proxyCall) {
					proxyCall.cancel();
				}
			});
		};
	}

	/**
	 * Create proxy stream to target server
	 */
	private createProxyStream(
		targetAddress: { host: string; port: number },
		methodName: string,
		clientCall: grpc.ServerDuplexStream<unknown, unknown>,
		incomingMetadata?: Record<string, string>,
	): grpc.ClientDuplexStream<unknown, unknown> | undefined {
		if (!this.schema) return undefined;

		// Find the service client
		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		for (const [serviceName] of this.schema.services) {
			const client = this.getServiceClient(serviceName);
			if (client) {
				ServiceClient = client;
				break;
			}
		}

		if (!ServiceClient) return undefined;

		const client = new ServiceClient(
			`${targetAddress.host}:${targetAddress.port}`,
			grpc.credentials.createInsecure(),
		);

		// Create metadata for forwarding
		const metadata = new grpc.Metadata();
		if (incomingMetadata) {
			for (const [key, value] of Object.entries(incomingMetadata)) {
				metadata.add(key, value);
			}
		}

		const grpcClient = client as unknown as Record<
			string,
			(metadata: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>
		>;

		if (typeof grpcClient[methodName] !== "function") {
			client.close();
			return undefined;
		}

		const proxyCall = grpcClient[methodName](metadata);

		// Forward responses back to client
		proxyCall.on("data", (response: unknown) => {
			clientCall.write(response);
		});

		proxyCall.on("end", () => {
			clientCall.end();
			client.close();
		});

		proxyCall.on("error", (err: Error) => {
			clientCall.destroy(err);
			client.close();
		});

		return proxyCall;
	}

	/**
	 * Create client stream handler
	 */
	private createClientStreamHandler(
		serverId: string,
		methodName: string,
	): grpc.handleClientStreamingCall<unknown, unknown> {
		return (call, callback) => {
			const messages: unknown[] = [];

			call.on("data", (request: unknown) => {
				messages.push(request);
			});

			call.on("end", async () => {
				const handler = this.getRequestHandler(serverId, methodName, methodName);
				if (handler) {
					try {
						const result = await handler(messages, {
							timestamp: Date.now(),
							direction: "inbound",
						});
						callback(null, result);
					} catch (error) {
						callback({
							code: grpc.status.INTERNAL,
							message: error instanceof Error ? error.message : "Unknown error",
						});
					}
				} else {
					callback({ code: grpc.status.UNIMPLEMENTED, message: `No handler for ${methodName}` });
				}
			});
		};
	}

	/**
	 * Create server stream handler
	 */
	private createServerStreamHandler(
		serverId: string,
		methodName: string,
	): grpc.handleServerStreamingCall<unknown, unknown> {
		return async (call) => {
			const request = call.request;
			const handler = this.getRequestHandler(serverId, methodName, methodName);

			if (handler) {
				try {
					const result = await handler(request, {
						timestamp: Date.now(),
						direction: "inbound",
					});
					if (Array.isArray(result)) {
						for (const item of result) {
							call.write(item);
						}
					} else if (result !== null && result !== undefined) {
						call.write(result);
					}
				} catch (_error) {
					// Handler error
				}
			}

			call.end();
		};
	}

	/**
	 * Create unary handler (fallback)
	 */
	private createUnaryHandler(
		serverId: string,
		methodName: string,
	): grpc.handleUnaryCall<unknown, unknown> {
		return async (call, callback) => {
			const handler = this.getRequestHandler(serverId, methodName, methodName);

			if (handler) {
				try {
					const result = await handler(call.request, {
						timestamp: Date.now(),
						direction: "inbound",
					});
					callback(null, result);
				} catch (error) {
					callback({
						code: grpc.status.INTERNAL,
						message: error instanceof Error ? error.message : "Unknown error",
					});
				}
			} else {
				callback({ code: grpc.status.UNIMPLEMENTED, message: `No handler for ${methodName}` });
			}
		};
	}

	/**
	 * Stop a gRPC streaming server
	 */
	async stopServer(server: AdapterServerHandle): Promise<void> {
		const handle = this.servers.get(server.id) as GrpcServerHandle | undefined;
		if (!handle) {
			throw new Error(`Server ${server.id} not found`);
		}

		return new Promise((resolve) => {
			handle._internal.server.tryShutdown(() => {
				handle.isRunning = false;
				this.cleanupServer(server.id);
				resolve();
			});
		});
	}

	/**
	 * Create a gRPC streaming client
	 */
	async createClient(config: AdapterClientConfig): Promise<GrpcStreamClientHandle> {
		const id = generateHandleId("grpc-stream-client");

		const serviceName = (config.options as Record<string, unknown> | undefined)?.serviceName as string | undefined;
		const methodName = (config.options as Record<string, unknown> | undefined)?.methodName as string | undefined;
		
		// If no service name provided, try to get the first available service (for proxy mode)
		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else if (this.schema) {
			// Get first available service for proxy mode
			for (const [name] of this.schema.services) {
				ServiceClient = this.getServiceClient(name);
				if (ServiceClient) break;
			}
		}

		if (!ServiceClient) {
			throw new Error(`Service ${serviceName || "any"} not found. Make sure to load schema first.`);
		}

		const credentials = config.tls
			? grpc.credentials.createSsl(
					config.tls.ca ? Buffer.from(config.tls.ca) : undefined,
					config.tls.key ? Buffer.from(config.tls.key) : undefined,
					config.tls.cert ? Buffer.from(config.tls.cert) : undefined,
				)
			: grpc.credentials.createInsecure();

		const client = new ServiceClient(
			`${config.targetAddress.host}:${config.targetAddress.port}`,
			credentials,
		);

		const handle: GrpcStreamClientHandle = {
			id,
			type: this.type,
			address: config.targetAddress,
			isConnected: true,
			_internal: {
				client,
				pendingMessages: new Map(),
				messageQueue: [],
				schema: this.schema,
				serviceName,
				methodName,
			},
		};

		// If method name is provided, open the stream
		if (methodName) {
			const grpcClient = client as unknown as Record<
				string,
				() => grpc.ClientDuplexStream<unknown, unknown>
			>;

			if (typeof grpcClient[methodName] === "function") {
				const call = grpcClient[methodName]();
				handle._internal.call = call;

				call.on("data", (response: unknown) => {
					this.handleStreamMessage(handle, response);
				});

				call.on("error", () => {
					handle.isConnected = false;
				});

				call.on("end", () => {
					handle.isConnected = false;
				});
			}
		}

		this.clients.set(id, handle);
		return handle;
	}

	/**
	 * Handle incoming stream message
	 */
	private async handleStreamMessage(handle: GrpcStreamClientHandle, data: unknown): Promise<void> {
		// Extract message type from payload if available
		const dataObj = data as Record<string, unknown>;
		const messageType = (dataObj.message_type as string) || handle._internal.methodName || "unknown";

		const message: Message = {
			type: messageType,
			payload: data,
			metadata: {
				timestamp: Date.now(),
				direction: "inbound",
			},
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
		for (const [pendingId, pending] of Array.from(handle._internal.pendingMessages.entries())) {
			const types = Array.isArray(pending.messageType)
				? pending.messageType
				: [pending.messageType];

			if (types.includes(processedMessage.type)) {
				if (this.matchesPending(processedMessage, pending)) {
					clearTimeout(pending.timeout);
					handle._internal.pendingMessages.delete(pendingId);
					pending.resolve(processedMessage);
					return;
				}
			}
		}

		handle._internal.messageQueue.push(processedMessage);
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
	async closeClient(client: AdapterClientHandle): Promise<void> {
		const handle = this.clients.get(client.id) as GrpcStreamClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		// Reject all pending messages
		for (const [, pending] of Array.from(handle._internal.pendingMessages.entries())) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Client disconnected"));
		}
		handle._internal.pendingMessages.clear();
		handle._internal.messageQueue = [];

		if (handle._internal.call) {
			handle._internal.call.end();
		}

		handle._internal.client.close();
		handle.isConnected = false;
		this.cleanupClient(client.id);
	}

	/**
	 * Send message on stream
	 */
	async sendMessage<T = unknown>(
		client: AdapterClientHandle,
		_messageType: string,
		payload: T,
		_metadata?: Partial<GrpcMessageMetadata>,
	): Promise<void> {
		const handle = this.clients.get(client.id) as GrpcStreamClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		if (!handle._internal.call) {
			throw new Error(`Client ${client.id} has no active stream`);
		}

		handle._internal.call.write(payload);
	}

	/**
	 * Wait for message on stream
	 */
	async waitForMessage<T = unknown>(
		client: AdapterClientHandle,
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout = 30000,
	): Promise<Message> {
		const handle = this.clients.get(client.id) as GrpcStreamClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		const types = Array.isArray(messageType) ? messageType : [messageType];

		// Check queue first
		const queuedMessage = this.findInQueue(
			handle,
			types,
			matcher as string | ((payload: unknown) => boolean) | undefined,
		);
		if (queuedMessage) {
			return queuedMessage;
		}

		return new Promise<Message>((resolve, reject) => {
			const pendingId = generateHandleId("pending");

			const timeoutHandle = setTimeout(() => {
				handle._internal.pendingMessages.delete(pendingId);
				reject(new Error(`Timeout waiting for message type: ${types.join(", ")}`));
			}, timeout);

			handle._internal.pendingMessages.set(pendingId, {
				resolve,
				reject,
				messageType,
				matcher: matcher as string | ((payload: unknown) => boolean) | undefined,
				timeout: timeoutHandle,
			});
		});
	}

	/**
	 * Find message in queue
	 */
	private findInQueue(
		handle: GrpcStreamClientHandle,
		types: string[],
		matcher?: string | ((payload: unknown) => boolean),
	): Message | undefined {
		const index = handle._internal.messageQueue.findIndex((msg) => {
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
			return handle._internal.messageQueue.splice(index, 1)[0];
		}

		return undefined;
	}
}

/**
 * Create gRPC unary adapter factory
 */
export function createGrpcUnaryAdapter(): GrpcUnaryAdapter {
	return new GrpcUnaryAdapter();
}

/**
 * Create gRPC stream adapter factory
 */
export function createGrpcStreamAdapter(): GrpcStreamAdapter {
	return new GrpcStreamAdapter();
}
