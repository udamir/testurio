/**
 * Sync Server Step Builder
 *
 * Builder for sync server operations (HTTP/gRPC request handlers).
 * Works for both mock mode and proxy mode.
 * Implements the declarative sequential pattern.
 */

import { generateHookId } from "../../base-component";
import { SyncHookBuilderImpl } from "./sync-server.hook-builder";
import type { Hook } from "../../base-component";
import type { ExtractServerRequest, ExtractServerResponse } from "./sync-server.types";
import type { Server } from "./sync-server.component";

/**
 * Server request options - adapter-specific configuration
 * This is a generic interface that allows any adapter-specific options.
 */
export interface ServerRequestOptions {
	/** Additional adapter-specific options */
	[key: string]: unknown;
}

// Type extraction utilities imported from ../../types/adapter-types

/**
 * Sync Server Step Builder
 *
 * Provides declarative API for server request/response handling.
 * Works for both mock mode (generates responses) and proxy mode (intercepts/transforms).
 *
 * @template S - Service definition (operation/method -> { request, response/responses })
 */
export class SyncServerStepBuilder<
	S extends Record<string, unknown> = Record<string, unknown>,
> {
	constructor(private server: Server) {}

	/**
	 * Register request handler
	 *
	 * In mock mode: Use to define mock responses
	 * In proxy mode: Use to intercept/transform requests before forwarding
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param options - Optional adapter-specific options (method/path for HTTP)
	 */
	onRequest<K extends keyof S & string>(
		messageType: K,
		options?: ServerRequestOptions,
	): SyncHookBuilderImpl<ExtractServerRequest<S, K>> {
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

		return new SyncHookBuilderImpl<ExtractServerRequest<S, K>>(hook);
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
	onResponse<K extends keyof S & string>(
		messageType: K,
		options?: ServerRequestOptions,
	): SyncHookBuilderImpl<ExtractServerResponse<S, K>> {
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

		return new SyncHookBuilderImpl<ExtractServerResponse<S, K>>(hook);
	}
}
