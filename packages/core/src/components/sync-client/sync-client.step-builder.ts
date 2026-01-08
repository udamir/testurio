/**
 * Sync Client Step Builder
 *
 * Builder for sync client operations (HTTP/gRPC unary requests).
 * Implements the declarative sequential pattern:
 *   request() -> mock handles -> onResponse()
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import type { ISyncProtocol, SyncOperationId } from "../../protocols/base";
import { generateId } from "../../utils";
import type { Client } from "./sync-client.component";
import { SyncClientHookBuilder } from "./sync-client.hook-builder";
import type { ExtractClientResponse, ExtractRequestData } from "./sync-client.types";

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
		const id = traceId ?? generateId("req_");
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

/**
 * Sync Client Step Builder
 *
 * Provides declarative API for sync request/response flows.
 *
 * @template A - Protocol type (ISyncProtocol) - contains service definition via __types.service
 */
export class SyncClientStepBuilder<A extends ISyncProtocol = ISyncProtocol> {
	private requestTracker: RequestTracker;

	constructor(
		private client: Client<A>,
		private testBuilder: ITestCaseBuilder
	) {
		// Get or create request tracker from the client component
		// This keeps internal state out of the user-facing test context
		this.requestTracker = this.client.getRequestTracker(() => new RequestTracker());
	}

	/**
	 * Send a request (generic API for all sync protocols)
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - data is typed as the protocol's raw request type (e.g., HttpRequest)
	 *
	 * In strict mode (with type parameter):
	 * - messageType is constrained to defined operation IDs
	 * - data is typed according to service definition
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param data - Request data (type comes directly from service definition)
	 * @param timeout - Optional request timeout in milliseconds
	 */
	request<K extends SyncOperationId<A>>(messageType: K, data: ExtractRequestData<A, K>, timeout?: number): void {
		const traceId = this.requestTracker.trackRequest(messageType);

		this.testBuilder.registerStep({
			type: "request",
			componentName: this.client.name,
			messageType,
			description: `Request ${messageType}`,
			action: async () => {
				const response = await this.client.request(messageType, data, timeout);
				this.requestTracker.storeResponse(traceId, response);
			},
		});
	}

	/**
	 * Handle a response (declarative, sequential)
	 *
	 * In loose mode (no type parameter on protocol):
	 * - Returns hook builder with protocol's raw response type (e.g., HttpResponse)
	 *
	 * In strict mode (with type parameter):
	 * - Returns hook builder with typed response from service definition
	 *
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 *                  If omitted, matches last request of this messageType
	 */
	onResponse<K extends SyncOperationId<A>, TResponse = ExtractClientResponse<A, K>>(
		messageType: K,
		traceId?: string
	): SyncClientHookBuilder<TResponse> {
		return new SyncClientHookBuilder<TResponse>(
			this.client.name,
			this.testBuilder,
			this.requestTracker,
			messageType,
			traceId
		);
	}
}
