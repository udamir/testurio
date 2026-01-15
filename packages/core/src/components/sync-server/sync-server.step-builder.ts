/**
 * Sync Server Step Builder - Declarative API for server request/response handling.
 */

import type { ISyncProtocol, ProtocolRequestOptions, SyncOperationId } from "../../protocols/base";
import { BaseStepBuilder } from "../base/step-builder";
import { SyncServerHookBuilder } from "./sync-server.hook-builder";
import type { ExtractServerRequest, ExtractServerResponse } from "./sync-server.types";

export class SyncServerStepBuilder<P extends ISyncProtocol = ISyncProtocol> extends BaseStepBuilder {
	/**
	 * Handle incoming request (non-strict).
	 * Works regardless of timing - request can arrive before or after step executes.
	 */
	onRequest<K extends SyncOperationId<P>>(
		messageType: K,
		options?: ProtocolRequestOptions<P>
	): SyncServerHookBuilder<ExtractServerRequest<P, K>, ExtractServerResponse<P, K>> {
		return this.registerStep(
			{
				type: "onRequest",
				description: `Handle request ${messageType}`,
				params: { messageType, options },
				handlers: [],
				mode: "hook",
			},
			SyncServerHookBuilder<ExtractServerRequest<P, K>, ExtractServerResponse<P, K>>
		);
	}

	/**
	 * Wait for incoming request (strict).
	 * Error if request arrives before this step starts executing.
	 */
	waitRequest<K extends SyncOperationId<P>>(
		messageType: K,
		options?: ProtocolRequestOptions<P> & { timeout?: number }
	): SyncServerHookBuilder<ExtractServerRequest<P, K>, ExtractServerResponse<P, K>> {
		return this.registerStep(
			{
				type: "waitRequest",
				description: `Wait for request ${messageType}`,
				params: { messageType, options, timeout: options?.timeout },
				handlers: [],
				mode: "wait",
			},
			SyncServerHookBuilder<ExtractServerRequest<P, K>, ExtractServerResponse<P, K>>
		);
	}

	/**
	 * Handle response from target (proxy mode, non-strict).
	 */
	onResponse<K extends SyncOperationId<P>>(
		messageType: K,
		options?: ProtocolRequestOptions<P>
	): SyncServerHookBuilder<ExtractServerResponse<P, K>, ExtractServerResponse<P, K>> {
		return this.registerStep(
			{
				type: "onResponse",
				description: `Handle response ${messageType}`,
				params: { messageType, options },
				handlers: [],
				mode: "hook",
			},
			SyncServerHookBuilder<ExtractServerResponse<P, K>, ExtractServerResponse<P, K>>
		);
	}
}
