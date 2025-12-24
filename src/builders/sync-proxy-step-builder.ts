/**
 * Sync Proxy Step Builder
 *
 * Builder for sync proxy operations (HTTP/gRPC request/response handlers).
 * Implements the declarative sequential pattern.
 */

import type { ProxyComponent } from "../components";
import { SyncHookBuilderImpl } from "../hooks";
import { generateHookId } from "../hooks";
import type { Hook, HttpRequest } from "../types";
import type { MockRequestOptions } from "./sync-mock-step-builder";

/**
 * Type guard for HTTP options
 */
function isHttpOptions(options?: MockRequestOptions): options is { method: string; path: string } {
	return options !== undefined && "method" in options && "path" in options;
}

/**
 * Sync Proxy Step Builder
 *
 * Provides declarative API for proxy request/response handling.
 */
export class SyncProxyStepBuilder {
	constructor(private proxy: ProxyComponent) {}

	/**
	 * Register request handler for requests from client (downstream: client → proxy → target)
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
			componentName: this.proxy.name,
			phase: "test",
			messageTypes: messageType,
			matcher: isHttpOptions(options)
				? { type: "httpEndpoint", method: options.method, path: options.path }
				: undefined,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "downstream",
			},
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.proxy.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new SyncHookBuilderImpl<HttpRequest<TRequest>>(hook);
	}

	/**
	 * Register response handler for responses from target server (upstream: target → proxy → client)
	 *
	 * @param messageType - Message type identifier (gRPC method name or HTTP operationId)
	 * @param options - Optional adapter-specific options (HTTP: method/path, gRPC: metadata)
	 */
	onResponse<TResponse = unknown>(
		messageType: string,
		options?: MockRequestOptions,
	): SyncHookBuilderImpl<TResponse> {
		const hook: Hook = {
			id: generateHookId(),
			componentName: this.proxy.name,
			phase: "test",
			messageTypes: messageType,
			matcher: isHttpOptions(options)
				? { type: "httpEndpoint", method: options.method, path: options.path }
				: undefined,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "upstream",
			},
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.proxy.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new SyncHookBuilderImpl<TResponse>(hook);
	}
}
