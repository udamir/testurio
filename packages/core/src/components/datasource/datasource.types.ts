/**
 * DataSource Types
 *
 * Types and interfaces for DataSource component and adapters.
 * DataSource provides direct SDK access to data stores (Redis, PostgreSQL, MongoDB, etc.)
 */

import type { ITestCaseBuilder, StepType, TestStep } from "../../execution";

// =============================================================================
// Core Types
// =============================================================================

/**
 * Unsubscribe function returned by event subscriptions
 */
export type Unsubscribe = () => void;

/**
 * Component state (same as BaseComponent)
 */
export type DataSourceState = "created" | "starting" | "started" | "stopping" | "stopped" | "error";

/**
 * Events emitted by DataSource adapters
 */
export interface DataSourceAdapterEvents {
	/** Emitted when connection is established */
	connected: undefined;
	/** Emitted when connection is closed */
	disconnected: undefined;
	/** Emitted on connection/operation error */
	error: Error;
}

// =============================================================================
// Adapter Interface
// =============================================================================

/**
 * Base adapter interface for all data source adapters
 *
 * @typeParam TClient - Native SDK client type (e.g., Redis from ioredis, Pool from pg)
 * @typeParam TConfig - Adapter configuration type
 */
export interface DataSourceAdapter<TClient, TConfig = unknown> {
	/** Adapter type identifier (e.g., "redis", "postgres", "mongodb") */
	readonly type: string;

	/** Configuration used to create this adapter */
	readonly config: TConfig;

	/**
	 * Initialize the adapter and establish connection
	 * Called by DataSource.start()
	 */
	init(): Promise<void>;

	/**
	 * Dispose of the adapter and close connection
	 * Called by DataSource.stop()
	 */
	dispose(): Promise<void>;

	/**
	 * Get the native SDK client
	 * Returns the underlying client for direct SDK access
	 */
	getClient(): TClient;

	/**
	 * Check if adapter is connected
	 */
	isConnected(): boolean;

	/**
	 * Subscribe to adapter events
	 */
	on<K extends keyof DataSourceAdapterEvents>(
		event: K,
		handler: (data: DataSourceAdapterEvents[K]) => void
	): Unsubscribe;
}

// =============================================================================
// Component Options
// =============================================================================

/**
 * DataSource component options
 *
 * @typeParam TClient - Native SDK client type
 * @typeParam A - Adapter type
 */
export interface DataSourceOptions<TClient, A extends DataSourceAdapter<TClient, unknown>> {
	/** Adapter instance for the data store */
	adapter: A;
}

// =============================================================================
// Exec Options
// =============================================================================

/**
 * Options for exec() operation
 */
export interface ExecOptions {
	/** Timeout in milliseconds. Operation fails if exceeded. */
	timeout?: number;
}

// =============================================================================
// Step Builder Interfaces
// =============================================================================

/**
 * Step builder for DataSource operations in testCase
 *
 * @typeParam TClient - Native SDK client type
 */
export interface DataSourceStepBuilder<TClient> {
	/**
	 * Execute an operation as a test step
	 *
	 * @param callback - Callback function receiving the native client
	 * @param options - Optional execution options (timeout)
	 * @returns Exec builder for chaining assert()
	 *
	 * @example
	 * // Without description
	 * .exec(async (client) => client.get("key"))
	 *
	 * @example
	 * // With description (for better reports)
	 * .exec("fetch user from cache", async (client) => client.get("user:123"))
	 *
	 * @example
	 * // With timeout
	 * .exec(async (client) => client.get("key"), { timeout: 5000 })
	 */
	exec<T>(callback: (client: TClient) => Promise<T>, options?: ExecOptions): DataSourceExecBuilder<T>;
	exec<T>(
		description: string,
		callback: (client: TClient) => Promise<T>,
		options?: ExecOptions
	): DataSourceExecBuilder<T>;
}

/**
 * Exec chain builder for assertions
 *
 * @typeParam T - Result type from exec callback
 */
export interface DataSourceExecBuilder<T> {
	/**
	 * Assert on the execution result
	 *
	 * @param predicate - Predicate function to validate the result
	 * @returns this for chaining
	 *
	 * @example
	 * // Without description
	 * .assert((val) => val !== null)
	 *
	 * @example
	 * // With description (for better reports)
	 * .assert("user should exist in cache", (val) => val !== null)
	 */
	assert(predicate: (result: T) => boolean | Promise<boolean>): this;
	assert(description: string, predicate: (result: T) => boolean | Promise<boolean>): this;
}

// =============================================================================
// Test Step Type
// =============================================================================

/**
 * DataSource step type - added to StepType union
 */
export const DATASOURCE_STEP_TYPE = "datasource" as StepType;

/**
 * DataSource test step
 */
export interface DataSourceTestStep<T = unknown> extends Omit<TestStep, "action"> {
	type: typeof DATASOURCE_STEP_TYPE;
	/** The exec callback */
	execCallback: (client: unknown) => Promise<T>;
	/** Optional exec description for reports */
	execDescription?: string;
	/** Optional timeout in milliseconds */
	timeout?: number;
	/** Optional assertion predicate */
	assertPredicate?: (result: T) => boolean | Promise<boolean>;
	/** Optional assertion description for reports */
	assertDescription?: string;
	/** The action to execute (wraps execCallback with assertion) */
	action: () => Promise<void>;
}

// =============================================================================
// Component Interface
// =============================================================================

/**
 * DataSource component interface
 *
 * Unlike network components, DataSource does not use protocols or hooks.
 * It provides direct SDK access through the adapter pattern.
 *
 * @typeParam TClient - Native SDK client type
 * @typeParam A - Adapter type
 */
export interface IDataSource<TClient, A extends DataSourceAdapter<TClient, unknown>> {
	/** Component name */
	readonly name: string;

	/** Adapter instance */
	readonly adapter: A;

	/** Current component state */
	getState(): DataSourceState;

	/** Check if component is started */
	isStarted(): boolean;

	/** Check if component is stopped */
	isStopped(): boolean;

	/**
	 * Start the component (connects adapter)
	 */
	start(): Promise<void>;

	/**
	 * Stop the component (disconnects adapter)
	 */
	stop(): Promise<void>;

	/**
	 * Execute an operation using the native client
	 *
	 * @param callback - Function receiving the native client
	 * @returns Result of the callback
	 */
	exec<T>(callback: (client: TClient) => Promise<T>): Promise<T>;

	/**
	 * Create a step builder for use in testCase
	 */
	createStepBuilder(builder: ITestCaseBuilder): DataSourceStepBuilder<TClient>;
}
