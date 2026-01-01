/**
 * Sync Server Step Builder
 *
 * Builder for sync server operations (HTTP/gRPC request handlers).
 * Works for both mock mode and proxy mode.
 * Implements the declarative sequential pattern.
 */

import { generateHookId } from "../base";
import { SyncHookBuilderImpl } from "./sync-server.hook-builder";
import type { Hook } from "../base";
import type { ExtractServerRequest, ExtractServerResponse } from "./sync-server.types";
import type { Server } from "./sync-server.component";
import type { TestPhase } from "../../execution";
import type { ISyncProtocol, ProtocolService, ProtocolRequestOptions } from "../../protocols/base";

/**
 * Sync Server Step Builder
 *
 * Provides declarative API for server request/response handling.
 * Works for both mock mode (generates responses) and proxy mode (intercepts/transforms).
 *
 * @template A - Protocol type (ISyncProtocol) - contains service definition via __types.service
 */
export class SyncServerStepBuilder<A extends ISyncProtocol = ISyncProtocol> {
	constructor(private server: Server, private testPhase: TestPhase) {}

	/**
	 * Register request handler
	 *
	 * In mock mode: Use to define mock responses
	 * In proxy mode: Use to intercept/transform requests before forwarding
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param options - Optional protocol-specific options (method/path for HTTP)
	 */
	onRequest<K extends keyof ProtocolService<A> & string>(
		messageType: K,
		options?: ProtocolRequestOptions<A>,
	): SyncHookBuilderImpl<ExtractServerRequest<A, K>, ExtractServerResponse<A, K>> {
		// For HTTP, construct message type from method + path if provided
		// This matches how HttpProtocol creates message types: "GET /users"
		const httpOptions = options as { method?: string; path?: string } | undefined;
		const effectiveMessageType = httpOptions?.method && httpOptions?.path
			? `${httpOptions.method} ${httpOptions.path}`
			: messageType;

		const hook: Hook<ExtractServerRequest<A, K>> = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: this.testPhase,
			messageTypes: effectiveMessageType,
			options,
			handlers: [],
			persistent: false,
			metadata: this.server.isProxy ? { direction: "downstream" } : undefined,
		};

		// Register hook first, then pass to builder
		this.server.registerHook(hook as Hook);

		return new SyncHookBuilderImpl<ExtractServerRequest<A, K>, ExtractServerResponse<A, K>>(hook);
	}

	/**
	 * Register response handler (proxy mode only)
	 *
	 * Use to intercept/transform responses from the target server before
	 * returning to the client.
	 *
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Optional protocol-specific options (method/path for HTTP)
	 */
	onResponse<K extends keyof ProtocolService<A> & string>(
		messageType: K,
		options?: ProtocolRequestOptions<A>,
	): SyncHookBuilderImpl<ExtractServerResponse<A, K>, ExtractServerResponse<A, K>> {
		if (!this.server.isProxy) {
			throw new Error(
				`onResponse() is only available in proxy mode. Server "${this.server.name}" is in mock mode.`,
			);
		}

		const hook: Hook<ExtractServerResponse<A, K>> = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: this.testPhase,
			messageTypes: messageType,
			options,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "upstream",
			},
		};

		// Register hook first, then pass to builder
		this.server.registerHook(hook as Hook);

		return new SyncHookBuilderImpl<ExtractServerResponse<A, K>, ExtractServerResponse<A, K>>(hook);
	}
}
