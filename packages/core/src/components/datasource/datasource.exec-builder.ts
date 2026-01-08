/**
 * DataSource Exec Builder
 *
 * Fluent builder for chaining assertions after exec() calls.
 * This builder holds the step configuration and allows adding assertions.
 */

import type { ITestCaseBuilder, TestStep } from "../../execution";
import type { DATASOURCE_STEP_TYPE, DataSourceExecBuilder } from "./datasource.types";

/**
 * Internal step configuration
 */
interface ExecStepConfig<T> {
	componentName: string;
	execCallback: (client: unknown) => Promise<T>;
	execDescription?: string;
	timeout?: number;
	assertPredicate?: (result: T) => boolean | Promise<boolean>;
	assertDescription?: string;
}

/**
 * DataSource Exec Builder Implementation
 *
 * Builds the step configuration and registers it with the test case builder.
 * Supports chaining assert() calls.
 *
 * @typeParam T - Result type from exec callback
 */
export class DataSourceExecBuilderImpl<T> implements DataSourceExecBuilder<T> {
	private config: ExecStepConfig<T>;
	private stepRegistered = false;
	private registeredStep?: Omit<TestStep, "phase"> & { metadata: Record<string, unknown> };

	constructor(
		private builder: ITestCaseBuilder,
		private getClient: () => unknown,
		componentName: string,
		execCallback: (client: unknown) => Promise<T>,
		execDescription?: string,
		timeout?: number
	) {
		this.config = {
			componentName,
			execCallback,
			execDescription,
			timeout,
		};

		// Register step immediately (will be updated if assert() is called)
		this.registerStep();
	}

	/**
	 * Add assertion to the exec result
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 */
	assert(
		descriptionOrPredicate: string | ((result: T) => boolean | Promise<boolean>),
		predicate?: (result: T) => boolean | Promise<boolean>
	): this {
		const description = typeof descriptionOrPredicate === "string" ? descriptionOrPredicate : undefined;
		const assertFn = typeof descriptionOrPredicate === "function" ? descriptionOrPredicate : predicate;

		this.config.assertPredicate = assertFn;
		this.config.assertDescription = description;

		// Update the registered step's metadata with assertion description
		if (this.registeredStep) {
			this.registeredStep.metadata.assertDescription = description;
		}

		return this;
	}

	/**
	 * Register the step with the test case builder
	 */
	private registerStep(): void {
		if (this.stepRegistered) return;

		const step = this.createStep();
		this.registeredStep = step;
		this.builder.registerStep(step);
		this.stepRegistered = true;
	}

	/**
	 * Create the test step
	 */
	private createStep(): Omit<TestStep, "phase"> & { metadata: Record<string, unknown> } {
		const config = this.config;
		const getClient = this.getClient;

		const description = config.execDescription
			? `DataSource: ${config.execDescription}`
			: `DataSource: exec on ${config.componentName}`;

		return {
			type: "datasource" as typeof DATASOURCE_STEP_TYPE,
			componentName: config.componentName,
			description,
			timeout: config.timeout,
			metadata: {
				execDescription: config.execDescription,
				assertDescription: config.assertDescription,
			},
			action: async () => {
				const client = getClient();

				// Execute with timeout if specified
				let result: T;
				if (config.timeout) {
					result = await withTimeout(config.execCallback(client) as Promise<T>, config.timeout);
				} else {
					result = await config.execCallback(client);
				}

				// Run assertion if present
				if (config.assertPredicate) {
					const passed = await Promise.resolve(config.assertPredicate(result));
					if (!passed) {
						const errorMsg = config.assertDescription
							? `Assertion failed: ${config.assertDescription}`
							: `Assertion failed for DataSource exec on ${config.componentName}`;
						throw new Error(errorMsg);
					}
				}
			},
		};
	}
}

/**
 * Execute a promise with timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`DataSource exec timeout after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		const result = await Promise.race([promise, timeoutPromise]);
		timeoutId && clearTimeout(timeoutId);
		return result;
	} catch (error) {
		timeoutId && clearTimeout(timeoutId);
		throw error;
	}
}
