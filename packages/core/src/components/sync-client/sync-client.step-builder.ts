/**
 * Sync Client Step Builder
 *
 * Builder for sync client operations (HTTP/gRPC unary requests).
 * Implements the declarative sequential pattern:
 *   request() -> mock handles -> onResponse()
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import { generateRequestId } from "../../base-component";
import type { Client } from "./sync-client.component";
import type { ExtractClientRequest, ExtractClientResponse } from "./sync-client.types";
import { SyncClientHookBuilder } from "./sync-client.hook-builder";

/**
 * Base request options for sync protocols
 * Adapters extend this with protocol-specific fields.
 * @template TPayload - Request payload type
 */
export interface RequestOptions<TPayload = unknown> {
	/** Request payload/body */
	payload?: TPayload;
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Additional adapter-specific options (method, path for HTTP, etc.) */
	[key: string]: unknown;
}

/**
 * Request entry for tracking correlation
 */
interface RequestEntry {
	traceId: string;
	messageType: string;
	response?: unknown;
	matched: boolean;
}

/**
 * Request tracker for correlating requests with responses
 */
export class RequestTracker {
	private requests: Map<string, RequestEntry[]> = new Map();
	private responsesByTraceId: Map<string, unknown> = new Map();

	/**
	 * Track a request
	 */
	trackRequest(messageType: string, traceId?: string): string {
		const id = traceId ?? generateRequestId();
		const entries = this.requests.get(messageType) ?? [];
		entries.push({ traceId: id, messageType, matched: false });
		this.requests.set(messageType, entries);
		return id;
	}

	/**
	 * Store response for a traceId
	 */
	storeResponse(traceId: string, response: unknown): void {
		this.responsesByTraceId.set(traceId, response);
	}

	/**
	 * Find request and get its response
	 */
	findResponse(messageType: string, traceId?: string): unknown {
		const entries = this.requests.get(messageType);
		if (!entries?.length) {
			throw new Error(`No request found for messageType: ${messageType}`);
		}

		if (traceId) {
			// Explicit match by traceId
			const entry = entries.find((e) => e.traceId === traceId);
			if (!entry) {
				throw new Error(`No request found with traceId: ${traceId}`);
			}
			return this.responsesByTraceId.get(entry.traceId);
		}

		// Implicit match - return last unmatched request's response
		const unmatchedEntries = entries.filter((e) => !e.matched);
		if (!unmatchedEntries.length) {
			throw new Error(`All ${messageType} requests already matched`);
		}
		const lastEntry = unmatchedEntries[unmatchedEntries.length - 1];
		lastEntry.matched = true;
		return this.responsesByTraceId.get(lastEntry.traceId);
	}

	/**
	 * Clear all tracked requests
	 */
	clear(): void {
		this.requests.clear();
		this.responsesByTraceId.clear();
	}
}

// Type extraction utilities imported from ../../types/adapter-types

/**
 * Sync Client Step Builder
 *
 * Provides declarative API for sync request/response flows.
 *
 * @template S - Service definition (operation/method -> { request, response/responses })
 */
export class SyncClientStepBuilder<
	S extends Record<string, unknown> = Record<string, unknown>,
> {
	private requestTracker: RequestTracker;

	constructor(
		private client: Client,
		private testBuilder: ITestCaseBuilder,
	) {
		// Get or create request tracker from the client component
		// This keeps internal state out of the user-facing test context
		this.requestTracker = this.client.getRequestTracker(() => new RequestTracker());
	}

	/**
	 * Send a request (generic API for all sync protocols)
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param options - Adapter-specific request options with type-safe payload
	 * @param traceId - Optional traceId for correlation with onResponse
	 */
	request<K extends keyof S & string>(
		messageType: K,
		options?: RequestOptions<ExtractClientRequest<S, K>>,
		traceId?: string,
	): void {
		const actualTraceId = this.requestTracker.trackRequest(
			messageType,
			traceId,
		);

		this.testBuilder.registerStep({
			type: "request",
			componentName: this.client.name,
			messageType,
			description: `Request ${messageType}`,
			action: async () => {
				const response = await this.client.request(messageType, options);
				this.requestTracker.storeResponse(actualTraceId, response);
			},
		});
	}

	/**
	 * Handle a response (declarative, sequential)
	 *
	 * For typed adapters (e.g., GrpcUnaryAdapter<Service>), the response type
	 * is inferred from the service definition.
	 * For untyped adapters, use explicit type parameter: onResponse<"messageType", MyType>("messageType")
	 *
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 *                  If omitted, matches last request of this messageType
	 */
	onResponse<K extends keyof S & string, TResponse = ExtractClientResponse<S, K>>(
		messageType: K,
		traceId?: string,
	): SyncClientHookBuilder<TResponse> {
		return new SyncClientHookBuilder<TResponse>(
			this.client.name,
			this.testBuilder,
			this.requestTracker,
			messageType,
			traceId,
		);
	}
}

