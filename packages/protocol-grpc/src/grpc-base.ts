/**
 * gRPC Base Protocol
 *
 * Shared base class for gRPC protocols with common functionality.
 */

import * as grpc from "@grpc/grpc-js";
import type { SchemaDefinition, TlsConfig } from "testurio";
import {
	getServiceClient as getServiceClientFromSchema,
	type LoadedSchema,
	loadGrpcSchema,
	toSchemaDefinition,
} from "./schema-loader";

/**
 * Server handle interface
 */
export interface ServerHandle {
	isRunning: boolean;
	ref?: grpc.Server;
}

/**
 * Client handle interface
 */
export interface ClientHandle {
	isConnected: boolean;
	ref?: grpc.Client;
}

/**
 * Base class for gRPC protocols with shared functionality
 */
export abstract class GrpcBaseProtocol {
	/** Public server handle */
	public server: ServerHandle = { isRunning: false };

	/** Public client handle */
	public client: ClientHandle = { isConnected: false };

	/** Loaded gRPC schema */
	protected _schema?: LoadedSchema;

	/**
	 * Get the loaded schema (for protocol access)
	 */
	get schema(): LoadedSchema | undefined {
		return this._schema;
	}

	/** Active gRPC server instance */
	protected grpcServer?: grpc.Server;

	/** Active gRPC client instance */
	protected grpcClient?: grpc.Client;

	/**
	 * Load Protobuf schema from .proto files
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		this._schema = await loadGrpcSchema(schemaPath);
		return toSchemaDefinition(this._schema);
	}

	/**
	 * Get service client constructor by name
	 */
	getServiceClient(serviceName: string): grpc.ServiceClientConstructor | undefined {
		if (!this._schema) return undefined;
		return getServiceClientFromSchema(this._schema, serviceName);
	}

	/**
	 * Create server credentials from TLS config
	 */
	protected createServerCredentials(tls?: TlsConfig): grpc.ServerCredentials {
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

	/**
	 * Create client credentials from TLS config
	 */
	protected createClientCredentials(tls?: TlsConfig): grpc.ChannelCredentials {
		if (tls) {
			return grpc.credentials.createSsl(
				tls.ca ? Buffer.from(tls.ca) : undefined,
				tls.key ? Buffer.from(tls.key) : undefined,
				tls.cert ? Buffer.from(tls.cert) : undefined
			);
		}
		return grpc.credentials.createInsecure();
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
	 * Close a gRPC client (base implementation)
	 */
	protected async closeClientBase(): Promise<void> {
		if (this.grpcClient) {
			this.grpcClient.close();
			this.grpcClient = undefined;
		}
		this.client.isConnected = false;
	}

	/**
	 * Dispose of the protocol
	 */
	async dispose(): Promise<void> {
		await this.stopServer();
		await this.closeClientBase();
	}
}
