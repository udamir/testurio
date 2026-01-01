/**
 * gRPC Unary Protocol
 *
 * Protocol for gRPC unary (request/response) calls.
 * Supports client connections, mock servers, and proxy servers.
 */

import * as grpc from "@grpc/grpc-js";
import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	ISyncProtocol,
	SchemaDefinition,
} from "testurio";
import { BaseSyncProtocol } from "testurio";
import { GrpcBaseProtocol } from "./grpc-base";
import { extractGrpcMetadata, createGrpcMetadata } from "./metadata";
import type {
	GrpcUnaryProtocolOptions,
	GrpcUnaryRequestOptions,
	GrpcOperationRequest,
	GrpcOperationResponse,
	GrpcOperations,
} from "./types";

/**
 * gRPC Unary Protocol
 *
 * Implements synchronous request/response pattern for gRPC unary calls.
 *
 * @template T - Service definition type for type-safe method calls
 */
export class GrpcUnaryProtocol<T extends GrpcOperations<T> = GrpcOperations>
	extends BaseSyncProtocol<T, GrpcOperationRequest, GrpcOperationResponse>
	implements ISyncProtocol<T, GrpcOperationRequest, GrpcOperationResponse>
{
	readonly type = "grpc-unary";

	/** Public server/client handles required by ISyncProtocol */
	public server: { isRunning: boolean; ref?: grpc.Server } = {
		isRunning: false,
	};
	public client: { isConnected: boolean; ref?: grpc.Client } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: GrpcUnaryProtocolOptions;

	/** Base protocol for shared functionality */
	private base: GrpcBaseProtocol;

	/** Active gRPC server instance */
	private grpcServer?: grpc.Server;

	/** Active gRPC client instance */
	private grpcClient?: grpc.Client;

	constructor(options: GrpcUnaryProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
		this.base = new (class extends GrpcBaseProtocol {})();
	}

	/**
	 * Load Protobuf schema from .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const result = await this.base.loadSchema(schemaPath);
		return result;
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
	 * Start a gRPC server (mock or proxy)
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
						this.createServiceImplementation(serviceDefinition);
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
	 * Create unary method handler
	 */
	private createUnaryHandler(
		methodName: string,
	): grpc.handleUnaryCall<unknown, unknown> {
		return async (call, callback) => {
			const rawPayload = call.request;
			// Extract metadata from gRPC call
			const metadata = extractGrpcMetadata(call.metadata);

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
		if (!this.base.getServiceClient("") && this.protocolOptions.schema) {
			await this.loadSchema(this.protocolOptions.schema);
		}

		// Get the service client constructor
		const serviceName = this.protocolOptions.serviceName;

		let ServiceClient: grpc.ServiceClientConstructor | undefined;
		if (serviceName) {
			ServiceClient = this.getServiceClient(serviceName);
		} else {
			// Get first available service
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
		const grpcMetadata = createGrpcMetadata(options?.metadata);

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
 * Create gRPC unary protocol factory
 */
export function createGrpcUnaryProtocol(): GrpcUnaryProtocol {
	return new GrpcUnaryProtocol();
}
