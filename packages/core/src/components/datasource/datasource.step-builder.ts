/**
 * DataSource Step Builder
 *
 * Provides fluent API for DataSource operations in testCase.
 * Returned by test.use(dataSource).
 */

import type { ITestCaseBuilder } from "../../execution";
import type { DataSource } from "./datasource.component";
import { DataSourceExecBuilderImpl } from "./datasource.exec-builder";
import type { DataSourceAdapter, DataSourceExecBuilder, DataSourceStepBuilder, ExecOptions } from "./datasource.types";

/**
 * DataSource Step Builder Implementation
 *
 * @typeParam TClient - Native SDK client type
 */
export class DataSourceStepBuilderImpl<TClient> implements DataSourceStepBuilder<TClient> {
	constructor(
		private dataSource: DataSource<TClient, DataSourceAdapter<TClient, unknown>>,
		private builder: ITestCaseBuilder
	) {}

	/**
	 * Execute an operation as a test step
	 *
	 * Overloaded to support:
	 * - exec(callback)
	 * - exec(callback, options)
	 * - exec(description, callback)
	 * - exec(description, callback, options)
	 */
	exec<T>(callback: (client: TClient) => Promise<T>, options?: ExecOptions): DataSourceExecBuilder<T>;
	exec<T>(
		description: string,
		callback: (client: TClient) => Promise<T>,
		options?: ExecOptions
	): DataSourceExecBuilder<T>;
	exec<T>(
		descriptionOrCallback: string | ((client: TClient) => Promise<T>),
		callbackOrOptions?: ((client: TClient) => Promise<T>) | ExecOptions,
		options?: ExecOptions
	): DataSourceExecBuilder<T> {
		// Parse overloaded arguments
		let description: string | undefined;
		let callback: (client: TClient) => Promise<T>;
		let execOptions: ExecOptions | undefined;

		if (typeof descriptionOrCallback === "string") {
			// exec(description, callback, options?)
			description = descriptionOrCallback;
			callback = callbackOrOptions as (client: TClient) => Promise<T>;
			execOptions = options;
		} else {
			// exec(callback, options?)
			callback = descriptionOrCallback;
			execOptions = callbackOrOptions as ExecOptions | undefined;
		}

		// Create exec builder
		return new DataSourceExecBuilderImpl<T>(
			this.builder,
			() => this.dataSource.getClient(),
			this.dataSource.name,
			callback as (client: unknown) => Promise<T>,
			description,
			execOptions?.timeout
		);
	}
}
