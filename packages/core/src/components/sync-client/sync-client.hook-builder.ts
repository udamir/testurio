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

type Predicate<T> = (res: T) => boolean;

interface Assertion<T> {
	fn: Predicate<T>;
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
	assert<T extends string | Predicate<TResponse>>(
		descriptionOrPredicate: T,
		predicate?: T extends string ? Predicate<TResponse> : never
	): this {
		const [description, fn] =
			typeof descriptionOrPredicate === "string"
				? [descriptionOrPredicate, predicate as Predicate<TResponse>]
				: ["", descriptionOrPredicate];

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
