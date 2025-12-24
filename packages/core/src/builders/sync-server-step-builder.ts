/**
 * Sync Server Step Builder
 *
 * Builder for sync server operations (HTTP/gRPC request handlers).
 * Works for both mock mode and proxy mode.
 * Implements the declarative sequential pattern.
 */

import type { Server } from "../components";
import { SyncHookBuilderImpl } from "../hooks";
import { generateHookId } from "../hooks";
import type { Hook } from "../types";

/**
 * Server request options - adapter-specific configuration
 * This is a generic interface that allows any adapter-specific options.
 */
export interface ServerRequestOptions {
	/** Additional adapter-specific options */
	[key: string]: unknown;
}

/**
 * Sync Server Step Builder
 *
 * Provides declarative API for server request/response handling.
 * Works for both mock mode (generates responses) and proxy mode (intercepts/transforms).
 */
export class SyncServerStepBuilder {
	constructor(private server: Server) {}

	/**
	 * Register request handler
	 *
	 * In mock mode: Use to define mock responses
	 * In proxy mode: Use to intercept/transform requests before forwarding
	 *
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Optional adapter-specific options (method/path for HTTP)
	 */
	onRequest<TRequest = unknown>(
		messageType: string,
		options?: ServerRequestOptions,
	): SyncHookBuilderImpl<TRequest> {
		// Delegate message type resolution to the adapter
		// This removes protocol-specific knowledge from the builder
		const adapter = this.server.getAdapter();
		const hookMessageType = adapter.resolveMessageType(messageType, options);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: "test",
			messageTypes: hookMessageType,
			handlers: [],
			persistent: false,
			metadata: this.server.isProxy ? { direction: "downstream" } : undefined,
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.server.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new SyncHookBuilderImpl<TRequest>(hook);
	}

	/**
	 * Register response handler (proxy mode only)
	 *
	 * Use to intercept/transform responses from the target server before
	 * returning to the client.
	 *
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Optional adapter-specific options (method/path for HTTP)
	 */
	onResponse<TResponse = unknown>(
		messageType: string,
		options?: ServerRequestOptions,
	): SyncHookBuilderImpl<TResponse> {
		if (!this.server.isProxy) {
			throw new Error(
				`onResponse() is only available in proxy mode. Server "${this.server.name}" is in mock mode.`,
			);
		}

		// Delegate message type resolution to the adapter
		const adapter = this.server.getAdapter();
		const hookMessageType = adapter.resolveMessageType(messageType, options);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: "test",
			messageTypes: hookMessageType,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "upstream",
			},
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.server.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new SyncHookBuilderImpl<TResponse>(hook);
	}
}
