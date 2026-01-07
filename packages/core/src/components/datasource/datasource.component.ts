/**
 * DataSource Component
 *
 * Provides direct SDK access to data stores (Redis, PostgreSQL, MongoDB, etc.)
 * via pluggable adapters. Unlike network components, DataSource does not use
 * protocols or hooks - it provides direct exec() access to native clients.
 *
 * This is a standalone component that does NOT extend BaseComponent.
 */

import type { ITestCaseBuilder } from "../../execution";
import { DataSourceStepBuilderImpl } from "./datasource.step-builder";
import type {
	DataSourceAdapter,
	DataSourceOptions,
	DataSourceState,
	DataSourceStepBuilder,
	IDataSource,
} from "./datasource.types";

/**
 * DataSource Component
 *
 * @typeParam TClient - Native SDK client type (e.g., Redis, Pool, Db)
 * @typeParam A - Adapter type extending DataSourceAdapter
 *
 * @example
 * ```typescript
 * const cache = new DataSource("cache", {
 *   adapter: new RedisAdapter({ host: "localhost", port: 6379 }),
 * });
 *
 * const tc = testCase("test", (test) => {
 *   const redis = test.use(cache);
 *   redis.exec("get user", async (client) => client.get("user:123"))
 *     .assert("user should exist", (val) => val !== null);
 * });
 * ```
 */
export class DataSource<TClient, A extends DataSourceAdapter<TClient, unknown>>
	implements IDataSource<TClient, A>
{
	private state: DataSourceState = "created";
	private error?: Error;

	/** Component name */
	readonly name: string;

	/** Adapter instance */
	readonly adapter: A;

	/**
	 * Create a new DataSource component
	 *
	 * @param name - Component name (must be unique within scenario)
	 * @param options - Component options including adapter
	 */
	constructor(name: string, options: DataSourceOptions<TClient, A>) {
		this.name = name;
		this.adapter = options.adapter;
	}

	// =========================================================================
	// State Management
	// =========================================================================

	/**
	 * Get current component state
	 */
	getState(): DataSourceState {
		return this.state;
	}

	/**
	 * Check if component is started
	 */
	isStarted(): boolean {
		return this.state === "started";
	}

	/**
	 * Check if component is stopped
	 */
	isStopped(): boolean {
		return this.state === "stopped";
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Start the component (connects adapter)
	 */
	async start(): Promise<void> {
		if (this.state !== "created" && this.state !== "stopped") {
			throw new Error(`Cannot start DataSource "${this.name}" in state ${this.state}`);
		}

		this.state = "starting";

		try {
			await this.adapter.init();
			this.state = "started";
		} catch (error) {
			this.state = "error";
			this.error = error instanceof Error ? error : new Error(String(error));
			throw error;
		}
	}

	/**
	 * Stop the component (disconnects adapter)
	 */
	async stop(): Promise<void> {
		if (this.state === "stopped") {
			return;
		}

		if (this.state !== "started" && this.state !== "error") {
			throw new Error(`Cannot stop DataSource "${this.name}" in state ${this.state}`);
		}

		this.state = "stopping";

		try {
			await this.adapter.dispose();
			this.state = "stopped";
		} catch (error) {
			this.state = "error";
			this.error = error instanceof Error ? error : new Error(String(error));
			throw error;
		}
	}

	// =========================================================================
	// Client Access
	// =========================================================================

	/**
	 * Get the native SDK client
	 *
	 * @throws Error if component is not started
	 */
	getClient(): TClient {
		if (!this.isStarted()) {
			throw new Error(`DataSource "${this.name}" is not started. Call start() first.`);
		}
		return this.adapter.getClient();
	}

	/**
	 * Execute an operation using the native client
	 *
	 * This is the direct exec method for programmatic use outside of testCase.
	 * Inside testCase, use the step builder: test.use(dataSource).exec(...)
	 *
	 * @param callback - Function receiving the native client
	 * @returns Result of the callback
	 */
	async exec<T>(callback: (client: TClient) => Promise<T>): Promise<T> {
		const client = this.getClient();
		return callback(client);
	}

	// =========================================================================
	// Step Builder
	// =========================================================================

	/**
	 * Create a step builder for use in testCase
	 *
	 * Called by TestCaseBuilder.use()
	 */
	createStepBuilder(builder: ITestCaseBuilder): DataSourceStepBuilder<TClient> {
		return new DataSourceStepBuilderImpl<TClient>(this, builder);
	}

	// =========================================================================
	// For BaseComponent compatibility (used by TestScenario)
	// =========================================================================

	/**
	 * Clear test case hooks (no-op for DataSource, no hooks)
	 */
	clearTestCaseHooks(): void {
		// DataSource doesn't have hooks - no-op
	}

	/**
	 * Clear all hooks (no-op for DataSource, no hooks)
	 */
	clearHooks(): void {
		// DataSource doesn't have hooks - no-op
	}

	/**
	 * Get unhandled errors (DataSource doesn't track these)
	 */
	getUnhandledErrors(): Error[] {
		return this.error ? [this.error] : [];
	}

	/**
	 * Clear unhandled errors
	 */
	clearUnhandledErrors(): void {
		this.error = undefined;
	}
}
