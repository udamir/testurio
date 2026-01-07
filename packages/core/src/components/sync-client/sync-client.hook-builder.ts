/**
 * Sync Client Hook Builder
 *
 * Builder for handling sync client responses in a declarative way.
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import type { RequestTracker } from "./sync-client.step-builder";

/**
 * Sync Client Hook Builder
 *
 * Builder for handling responses in a declarative way.
 */
/**
 * Assertion with optional description
 */
interface Assertion<T> {
	fn: (res: T) => boolean | undefined;
	description?: string;
}

export class SyncClientHookBuilder<TResponse = unknown> {
	private assertions: Array<Assertion<TResponse>> = [];

	constructor(
		private componentName: string,
		private testBuilder: ITestCaseBuilder,
		private requestTracker: RequestTracker,
		private messageType: string,
		private traceId?: string
	) {
		// Register the response handling step immediately
		this.registerResponseStep();
	}

	/**
	 * Assert on response - can also capture data in callback
	 * Return true/false for assertion, or undefined to just capture data
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 */
	assert(
		descriptionOrPredicate: string | ((res: TResponse) => boolean | undefined),
		predicate?: (res: TResponse) => boolean | undefined
	): this {
		const description = typeof descriptionOrPredicate === "string" ? descriptionOrPredicate : undefined;
		const fn = typeof descriptionOrPredicate === "function" ? descriptionOrPredicate : predicate!;

		this.assertions.push({ fn, description });
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
				const response = this.requestTracker.findResponse(this.messageType, this.traceId) as TResponse;

				// Run all assertions
				for (const assertion of this.assertions) {
					const result = assertion.fn(response);
					if (result === false) {
						const errorMsg = assertion.description
							? `Assertion failed: ${assertion.description}`
							: `Response assertion failed for ${this.messageType}`;
						throw new Error(errorMsg);
					}
				}
			},
		});
	}
}
