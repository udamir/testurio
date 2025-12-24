/**
 * Sync Mock Step Builder
 *
 * Builder for sync mock server operations (HTTP/gRPC request handlers).
 * Implements the declarative sequential pattern.
 */

import type { MockComponent } from "../components";
import { SyncHookBuilderImpl } from "../hooks";
import { generateHookId } from "../hooks";
import type { Hook, HttpRequest } from "../types";

/**
 * Adapter-specific options for mock request handling
 */
export interface GrpcMockRequestOptions {
	/** gRPC metadata to match */
	metadata?: Record<string, string>;
}

export interface HttpMockRequestOptions {
	/** HTTP method to match */
	method: string;
	/** URL path pattern to match */
	path: string;
}

export type MockRequestOptions = GrpcMockRequestOptions | HttpMockRequestOptions;

/**
 * Type guard for HTTP options
 */
function isHttpMockOptions(options?: MockRequestOptions): options is HttpMockRequestOptions {
	return options !== undefined && "method" in options && "path" in options;
}

/**
 * Sync Mock Step Builder
 *
 * Provides declarative API for mock request handling.
 */
export class SyncMockStepBuilder {
	constructor(private mock: MockComponent) {}

	/**
	 * Register request handler
	 *
	 * @param messageType - Message type identifier (gRPC method name or HTTP operationId)
	 * @param options - Optional adapter-specific options (HTTP: method/path, gRPC: metadata)
	 */
	onRequest<TRequest = unknown>(
		messageType: string,
		options?: MockRequestOptions,
	): SyncHookBuilderImpl<HttpRequest<TRequest>> {
		const hook: Hook = {
			id: generateHookId(),
			componentName: this.mock.name,
			phase: "test",
			messageTypes: messageType,
			matcher: isHttpMockOptions(options)
				? { type: "httpEndpoint", method: options.method, path: options.path }
				: undefined,
			handlers: [],
			persistent: false,
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.mock.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new SyncHookBuilderImpl<HttpRequest<TRequest>>(hook);
	}
}
