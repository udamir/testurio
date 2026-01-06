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
export class SyncClientHookBuilder<TResponse = unknown> {
	private assertions: Array<(res: TResponse) => boolean | undefined> = [];

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
				const response = this.requestTracker.findResponse(this.messageType, this.traceId) as TResponse;

				// Run all assertions
				for (const assertion of this.assertions) {
					const result = assertion(response);
					if (result === false) {
						throw new Error(`Response assertion failed for ${this.messageType}`);
					}
				}
			},
		});
	}
}
