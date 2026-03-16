/**
 * DataSource Step Builder
 *
 * Builder for DataSource operations in testCase.
 * Provides declarative API for direct SDK callback operations.
 *
 * Per design:
 * - Contains NO logic, only step registration
 * - All execution logic is in the Component
 */

import { BaseStepBuilder } from "../base/step-builder";
import { DataSourceHookBuilder } from "./datasource.hook-builder";

/**
 * DataSource Step Builder
 *
 * Provides declarative API for DataSource exec operations.
 * All methods register steps - no execution logic here.
 *
 * @template TClient - Native SDK client type
 */
export class DataSourceStepBuilder<TClient = unknown> extends BaseStepBuilder {
	/**
	 * Execute an operation using the native client
	 *
	 * Overloads:
	 * - exec(callback) - Execute with callback only
	 * - exec(description, callback) - Execute with description for reports
	 *
	 * @returns DataSourceHookBuilder for chaining assert() and timeout()
	 *
	 * @example
	 * // Without description
	 * redis.exec(async (client) => client.get("key"))
	 *
	 * @example
	 * // With description (for better reports)
	 * redis.exec("fetch user from cache", async (client) => client.get("user:123"))
	 *
	 * @example
	 * // With timeout via chain
	 * redis.exec(async (client) => client.get("key")).timeout(5000)
	 *
	 * @example
	 * // With assertion
	 * redis.exec("get user", async (client) => client.get("user:123"))
	 *   .assert("user should exist", (val) => val !== null)
	 */
	exec<T>(callback: (client: TClient) => Promise<T>): DataSourceHookBuilder<T>;
	exec<T>(description: string, callback: (client: TClient) => Promise<T>): DataSourceHookBuilder<T>;
	exec<T>(
		descriptionOrCallback: string | ((client: TClient) => Promise<T>),
		callbackOrOptions?: (client: TClient) => Promise<T>
	): DataSourceHookBuilder<T> {
		// Parse overloaded arguments
		let description: string | undefined;
		let callback: (client: TClient) => Promise<T>;

		if (typeof descriptionOrCallback === "string") {
			// exec(description, callback)
			description = descriptionOrCallback;
			callback = callbackOrOptions as (client: TClient) => Promise<T>;
		} else {
			// exec(callback)
			callback = descriptionOrCallback;
		}

		return this.registerStep(
			{
				type: "exec",
				description: description ?? "exec",
				params: {
					callback,
					description,
				},
				handlers: [],
				mode: "action",
			},
			DataSourceHookBuilder<T>
		);
	}
}
