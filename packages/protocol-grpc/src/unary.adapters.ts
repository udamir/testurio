/**
 * gRPC Unary Protocol Adapters (v3 Design)
 *
 * Server and client adapters for gRPC unary protocol.
 */

import * as grpc from "@grpc/grpc-js";
import type { ISyncServerAdapter, ISyncClientAdapter } from "testurio";
import { extractGrpcMetadata, createGrpcMetadata } from "./metadata";
import type {
	GrpcUnaryRequestOptions,
	GrpcOperationRequest,
	GrpcOperationResponse,
} from "./types";

/**
 * gRPC Unary Server Adapter
 * Wraps grpc.Server instance, owned by component
 */
export class GrpcUnaryServerAdapter implements ISyncServerAdapter {
	private server: grpc.Server;
	private requestHandler?: (messageType: string, request: GrpcOperationRequest) => Promise<GrpcOperationResponse | null>;

	constructor(server: grpc.Server) {
		this.server = server;
	}

	/**
	 * Create and start gRPC server adapter
	 */
	static async create(
		host: string,
		port: number,
		serviceDefinitions: Map<string, grpc.ServiceDefinition>,
		tls?: { ca?: string; cert?: string; key?: string },
	): Promise<GrpcUnaryServerAdapter> {
		return new Promise((resolve, reject) => {
			const server = new grpc.Server();
			const adapter = new GrpcUnaryServerAdapter(server);

			// Add service implementations
			const addedServices = new Set<grpc.ServiceDefinition>();
			for (const [_serviceName, serviceDefinition] of serviceDefinitions) {
				if (addedServices.has(serviceDefinition)) continue;
				addedServices.add(serviceDefinition);

				const implementation = adapter.createServiceImplementation(serviceDefinition);
				server.addService(serviceDefinition, implementation);
			}

			const credentials = adapter.createServerCredentials(tls);

			server.bindAsync(
				`${host}:${port}`,
				credentials,
				(err, _port) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(adapter);
				},
			);
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
					: [],
			);
		}
		return grpc.ServerCredentials.createInsecure();
	}

	private createServiceImplementation(
		serviceDefinition: grpc.ServiceDefinition,
	): grpc.UntypedServiceImplementation {
		const implementation: grpc.UntypedServiceImplementation = {};

		for (const [methodName, methodDefinition] of Object.entries(serviceDefinition)) {
			if (!methodDefinition.requestStream && !methodDefinition.responseStream) {
				implementation[methodName] = this.createUnaryHandler(methodName);
			}
		}

		return implementation;
	}

	private createUnaryHandler(methodName: string): grpc.handleUnaryCall<unknown, unknown> {
		return async (call, callback) => {
			const rawPayload = call.request;
			const metadata = extractGrpcMetadata(call.metadata);
			const wrappedRequest = { payload: rawPayload, metadata };

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

					const response = result as {
						payload?: unknown;
						metadata?: Record<string, string>;
						grpcStatus?: number;
						grpcMessage?: string;
					} | undefined;

					if (response && typeof response === "object" && "grpcStatus" in response) {
						const grpcStatus = response.grpcStatus as number;
						if (grpcStatus !== 0) {
							callback({
								code: grpcStatus,
								message: (response.grpcMessage as string) || "Error",
							});
							return;
						}
					}

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

	onRequest<TReq = unknown, TRes = unknown>(
		handler: (messageType: string, request: TReq) => Promise<TRes | null>,
	): void {
		this.requestHandler = handler as (messageType: string, request: GrpcOperationRequest) => Promise<GrpcOperationResponse | null>;
	}

	async stop(): Promise<void> {
		return new Promise((resolve) => {
			this.server.tryShutdown(() => {
				resolve();
			});
		});
	}
}

/**
 * gRPC Unary Client Adapter
 * Wraps grpc.Client instance, owned by component
 */
export class GrpcUnaryClientAdapter implements ISyncClientAdapter {
	private client: grpc.Client;

	constructor(client: grpc.Client) {
		this.client = client;
	}

	/**
	 * Create gRPC client adapter
	 */
	static async create(
		host: string,
		port: number,
		ServiceClient: grpc.ServiceClientConstructor,
		tls?: { ca?: string; cert?: string; key?: string },
	): Promise<GrpcUnaryClientAdapter> {
		const credentials = tls
			? grpc.credentials.createSsl(
					tls.ca ? Buffer.from(tls.ca) : undefined,
					tls.key ? Buffer.from(tls.key) : undefined,
					tls.cert ? Buffer.from(tls.cert) : undefined,
				)
			: grpc.credentials.createInsecure();

		const client = new ServiceClient(`${host}:${port}`, credentials);
		return new GrpcUnaryClientAdapter(client);
	}

	async request<TReq = unknown, TRes = unknown>(
		messageType: string,
		data: TReq,
		_timeout?: number,
	): Promise<TRes> {
		const isOptions = data && typeof data === "object" && "payload" in data;
		const options = isOptions ? (data as GrpcUnaryRequestOptions) : undefined;
		const payload = isOptions ? options?.payload : data;

		const grpcMetadata = createGrpcMetadata(options?.metadata);

		const grpcClient = this.client as unknown as Record<
			string,
			(
				request: unknown,
				metadata: grpc.Metadata,
				callback: (err: grpc.ServiceError | null, response: unknown) => void,
			) => void
		>;

		if (typeof grpcClient[messageType] !== "function") {
			throw new Error(`Method ${messageType} not found on client`);
		}

		return new Promise((resolve, reject) => {
			grpcClient[messageType](payload, grpcMetadata, (err, response) => {
				if (err) {
					const error = new Error(err.message) as Error & {
						code?: number;
						details?: string;
					};
					error.code = err.code;
					error.details = err.details;
					reject(error);
				} else {
					const wrappedResponse = { payload: response } as TRes;
					resolve(wrappedResponse);
				}
			});
		});
	}

	async close(): Promise<void> {
		this.client.close();
	}
}
