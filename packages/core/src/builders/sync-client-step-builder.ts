/**
 * Sync Client Step Builder
 *
 * Builder for sync client operations (HTTP/gRPC unary requests).
 * Implements the declarative sequential pattern:
 *   request() -> mock handles -> onResponse()
 */

import type { Client } from "../components";
import { generateRequestId } from "../hooks";
import type { TestCaseBuilder } from "./test-case-builder";

/**
 * Base request options for sync protocols
 * Adapters extend this with protocol-specific fields.
 */
export interface RequestOptions {
	/** Request payload/body */
	payload?: unknown;
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

/**
 * Sync Client Step Builder
 *
 * Provides declarative API for sync request/response flows.
 */
export class SyncClientStepBuilder<
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	private requestTracker: RequestTracker;

	constructor(
		private client: Client,
		private testBuilder: TestCaseBuilder<TContext>,
	) {
		// Get or create request tracker from the client component
		// This keeps internal state out of the user-facing test context
		this.requestTracker = this.client.getRequestTracker(() => new RequestTracker());
	}

	/**
	 * Send a request (generic API for all sync protocols)
	 *
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Adapter-specific request options
	 * @param traceId - Optional traceId for correlation with onResponse
	 */
	request(
		messageType: string,
		options?: RequestOptions,
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
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 *                  If omitted, matches last request of this messageType
	 */
	onResponse<TResponse = unknown>(
		messageType: string,
		traceId?: string,
	): ResponseBuilder<TResponse> {
		return new ResponseBuilder<TResponse>(
			this.client.name,
			this.testBuilder,
			this.requestTracker,
			messageType,
			traceId,
		);
	}
}

/**
 * Response Builder
 *
 * Builder for handling responses in a declarative way.
 */
export class ResponseBuilder<TResponse = unknown> {
	private assertions: Array<(res: TResponse) => boolean | undefined> = [];

	constructor(
		private componentName: string,
		private testBuilder: TestCaseBuilder,
		private requestTracker: RequestTracker,
		private messageType: string,
		private traceId?: string,
	) {
		// Register the response handling step immediately
		this.registerResponseStep();
	}

	/**
	 * Assert on response - can also capture data in callback
	 * Return true/false for assertion, or undefined to just capture data
	 */
	assert(predicate: (res: TResponse) => boolean | undefined): this {
		this.assertions.push(predicate);
		return this;
	}

	/**
	 * Register the response handling step
	 */
	private registerResponseStep(): void {
		this.testBuilder.registerStep({
			type: "onResponse",
			componentName: this.componentName,
			messageType: this.messageType,
			description: `Handle response for ${this.messageType}${this.traceId ? ` (${this.traceId})` : ""}`,
			action: async () => {
				const response = this.requestTracker.findResponse(
					this.messageType,
					this.traceId,
				) as TResponse;

				// Run all assertions
				for (const assertion of this.assertions) {
					const result = assertion(response);
					if (result === false) {
						throw new Error(
							`Response assertion failed for ${this.messageType}`,
						);
					}
				}
			},
		});
	}
}
