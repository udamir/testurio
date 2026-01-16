/**
 * DataSource Component
 *
 * Provides direct SDK access to data stores (Redis, PostgreSQL, MongoDB, etc.)
 * via pluggable adapters. Unlike network components, DataSource does not use
 * protocols or hooks - it provides direct exec() access to native clients.
 *
 * Extends BaseComponent for consistent lifecycle and error handling.
 *
 * Key differences from network components:
 * - No hooks (registerHook/clearHooks are no-ops effectively)
 * - All steps are mode: "action" (direct execution)
 * - No protocol layer (adapter provides direct client access)
 */

import { BaseComponent } from "../base/base.component";
import type { ITestCaseContext } from "../base/base.types";
import type { Handler, Step } from "../base/step.types";
import { DataSourceStepBuilder } from "./datasource.step-builder";
import type { DataSourceAdapter, DataSourceOptions } from "./datasource.types";

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
export class DataSource<TClient, A extends DataSourceAdapter<TClient, unknown>> extends BaseComponent<
	DataSourceStepBuilder<TClient>
> {
	/** Adapter instance */
	readonly adapter: A;

	/**
	 * Create a new DataSource component
	 *
	 * @param name - Component name (must be unique within scenario)
	 * @param options - Component options including adapter
	 */
	constructor(name: string, options: DataSourceOptions<TClient, A>) {
		super(name);
		this.adapter = options.adapter;
	}

	// =========================================================================
	// Step Builder Creation
	// =========================================================================

	/**
	 * Create a step builder for use in testCase
	 *
	 * Called by TestCaseBuilder.use()
	 */
	createStepBuilder(context: ITestCaseContext): DataSourceStepBuilder<TClient> {
		return new DataSourceStepBuilder<TClient>(context, this);
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	/**
	 * Execute a step based on its type.
	 *
	 * DataSource only supports "exec" step type with mode: "action".
	 */
	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "exec":
				await this.executeExec(step);
				break;
			default:
				throw new Error(`Unknown step type: ${step.type} for DataSource ${this.name}`);
		}
	}

	/**
	 * Execute an exec step.
	 *
	 * 1. Get native client from adapter
	 * 2. Execute callback with optional timeout
	 * 3. Run handlers on result (e.g., assert)
	 */
	private async executeExec(step: Step): Promise<void> {
		const params = step.params as {
			callback: (client: TClient) => Promise<unknown>;
			description?: string;
			timeout?: number;
		};

		// Get native client
		const client = this.getClient();

		// Execute callback with optional timeout
		let result: unknown;
		if (params.timeout) {
			result = await this.withTimeout(params.callback(client), params.timeout, params.description);
		} else {
			result = await params.callback(client);
		}

		// Execute handlers (e.g., assert)
		await this.executeHandlers(step, result);
	}

	/**
	 * Wrap a promise with a timeout.
	 */
	private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, description?: string): Promise<T> {
		return Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				setTimeout(() => {
					const desc = description ? `"${description}"` : "exec";
					reject(new Error(`DataSource ${desc} timeout after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
	}

	// =========================================================================
	// Handler Execution
	// =========================================================================

	/**
	 * Execute a single handler.
	 *
	 * DataSource supports:
	 * - assert: Validate result with predicate
	 */
	protected async executeHandler<TContext = unknown>(
		handler: Handler,
		payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		const params = handler.params as Record<string, unknown>;

		switch (handler.type) {
			case "assert": {
				const predicate = params.predicate as (p: unknown) => boolean | Promise<boolean>;
				const result = await predicate(payload);
				if (!result) {
					const errorMsg = handler.description ? `Assertion failed: ${handler.description}` : "Assertion failed";
					throw new Error(errorMsg);
				}
				return undefined;
			}

			default:
				// Unknown handler type - ignore (or could throw)
				return undefined;
		}
	}

	// =========================================================================
	// Hook Matching (No-op for DataSource)
	// =========================================================================

	/**
	 * Create hook matcher.
	 *
	 * DataSource doesn't use hooks - all steps are action mode.
	 * This is required by abstract base class but never called.
	 */
	protected createHookMatcher(_step: Step): (message: unknown) => boolean {
		// DataSource doesn't use hooks - return always-false matcher
		return () => false;
	}

	// =========================================================================
	// Client Access
	// =========================================================================

	/**
	 * Get the native SDK client.
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
	 * Execute an operation using the native client.
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
	// Lifecycle
	// =========================================================================

	/**
	 * Start the component (connects adapter).
	 */
	protected async doStart(): Promise<void> {
		await this.adapter.init();
	}

	/**
	 * Stop the component (disconnects adapter).
	 */
	protected async doStop(): Promise<void> {
		await this.adapter.dispose();
	}
}
