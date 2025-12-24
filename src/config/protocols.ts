/**
 * Protocol Configuration Classes
 *
 * Type-safe protocol configuration helpers for component setup.
 */

import type {
	ProtocolType,
	ProtocolOptions,
	GrpcOptions,
	HttpOptions,
	TcpProtoOptions,
	WebSocketOptions,
	SchemaDefinition,
} from "../types";

/**
 * Base protocol configuration
 */
export abstract class ProtocolConfigBase<TOptions extends ProtocolOptions = ProtocolOptions> {
	abstract readonly type: ProtocolType;
	
	constructor(
		public readonly schema?: string | SchemaDefinition,
		public readonly options?: TOptions,
	) {}

	/**
	 * Get the protocol type string
	 */
	getType(): ProtocolType {
		return this.type;
	}

	/**
	 * Get protocol options
	 */
	getOptions(): TOptions | undefined {
		return this.options;
	}

	/**
	 * Get schema
	 */
	getSchema(): string | SchemaDefinition | undefined {
		return this.schema;
	}
}

/**
 * gRPC Unary protocol configuration
 */
export class GrpcUnary extends ProtocolConfigBase<GrpcOptions> {
	readonly type = "grpc-unary" as const;

	constructor(config: {
		schema: string | SchemaDefinition;
		serviceName?: string;
		timeout?: number;
		channelOptions?: Record<string, unknown>;
		reflection?: boolean;
		metadata?: Record<string, string>;
	}) {
		super(config.schema, {
			serviceName: config.serviceName,
			timeout: config.timeout,
			channelOptions: config.channelOptions,
			reflection: config.reflection,
			metadata: config.metadata,
		});
	}
}

/**
 * gRPC Streaming protocol configuration
 */
export class GrpcStream extends ProtocolConfigBase<GrpcOptions> {
	readonly type = "grpc-stream" as const;

	constructor(config: {
		schema: string | SchemaDefinition;
		serviceName?: string;
		methodName?: string;
		timeout?: number;
		channelOptions?: Record<string, unknown>;
		reflection?: boolean;
		metadata?: Record<string, string>;
	}) {
		super(config.schema, {
			serviceName: config.serviceName,
			methodName: config.methodName,
			timeout: config.timeout,
			channelOptions: config.channelOptions,
			reflection: config.reflection,
			metadata: config.metadata,
		});
	}
}

/**
 * HTTP protocol configuration
 */
export class Http extends ProtocolConfigBase<HttpOptions> {
	readonly type = "http" as const;

	constructor(config?: {
		schema?: string | SchemaDefinition;
		baseUrl?: string;
		timeout?: number;
		headers?: Record<string, string>;
		followRedirects?: boolean;
		maxRedirects?: number;
		validateSchema?: boolean;
		retryPolicy?: {
			maxRetries: number;
			backoff: "linear" | "exponential";
			retryableStatusCodes?: number[];
		};
	}) {
		super(config?.schema, {
			baseUrl: config?.baseUrl,
			timeout: config?.timeout,
			headers: config?.headers,
			followRedirects: config?.followRedirects,
			maxRedirects: config?.maxRedirects,
			validateSchema: config?.validateSchema,
			retryPolicy: config?.retryPolicy,
		});
	}
}

/**
 * TCP Proto protocol configuration
 */
export class TcpProto extends ProtocolConfigBase<TcpProtoOptions> {
	readonly type = "tcp-proto" as const;

	constructor(config: {
		schema: string | SchemaDefinition;
		delimiter?: Buffer;
		heartbeat?: boolean;
		heartbeatInterval?: number;
		connectionTimeout?: number;
		reconnect?: boolean;
		reconnectInterval?: number;
	}) {
		super(config.schema, {
			delimiter: config.delimiter,
			heartbeat: config.heartbeat,
			heartbeatInterval: config.heartbeatInterval,
			connectionTimeout: config.connectionTimeout,
			reconnect: config.reconnect,
			reconnectInterval: config.reconnectInterval,
		});
	}
}

/**
 * WebSocket protocol configuration
 */
export class WebSocket extends ProtocolConfigBase<WebSocketOptions> {
	readonly type = "websocket" as const;

	constructor(config?: {
		schema?: string | SchemaDefinition;
		protocols?: string[];
		pingInterval?: number;
		pongTimeout?: number;
		compression?: boolean;
		maxPayload?: number;
	}) {
		super(config?.schema, {
			protocols: config?.protocols,
			pingInterval: config?.pingInterval,
			pongTimeout: config?.pongTimeout,
			compression: config?.compression,
			maxPayload: config?.maxPayload,
		});
	}
}

/**
 * Protocol configuration type union
 */
export type ProtocolConfig = GrpcUnary | GrpcStream | Http | TcpProto | WebSocket;
