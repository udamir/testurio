/**
 * Protocol Adapters
 *
 * Central export for all protocol adapters.
 * Adapter registry is now in TestScenario.adapters
 */

import { GrpcStreamAdapter, GrpcUnaryAdapter } from "./grpc-adapter";
import { WebSocketAdapter } from "./ws-adapter";
import { HttpAdapter } from "./http-adapter";
import { TcpAdapter } from "./tcp-adapter";

// Types
export * from "./types";

// Base adapter
export * from "./base-adapter";
export * from "./http-adapter";
export * from "./grpc-adapter";
export * from "./tcp-adapter";
export * from "./ws-adapter";

export const builtInAdapters = [
	["http", HttpAdapter],
	["grpc-unary", GrpcUnaryAdapter],
	["grpc-stream", GrpcStreamAdapter],
	["tcp-proto", TcpAdapter],
	["websocket", WebSocketAdapter],
] as const;
