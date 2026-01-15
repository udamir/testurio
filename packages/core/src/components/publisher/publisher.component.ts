/**
 * Publisher Component
 *
 * Fire-and-forget message publishing to message queues.
 * Extends BaseComponent directly (no protocol required).
 */

import { BaseComponent } from "../base/base.component";
import type { ITestCaseContext } from "../base/base.types";
import type { Step, Handler } from "../base/step.types";
import type { IMQAdapter, IMQPublisherAdapter, Topics, DefaultTopics } from "../mq.base";
import { PublisherStepBuilder } from "./publisher.step-builder";

export interface PublisherOptions<
	TOptions = unknown,
	TBatchMessage = unknown,
> {
	adapter: IMQAdapter<unknown, TOptions, TBatchMessage>;
}

/**
 * Publisher Component
 *
 * Publishes messages to message queue topics.
 * No hooks - fire-and-forget only.
 *
 * Uses self-referential constraint `T extends Topics<T>` which:
 * - Does NOT require T to have an index signature
 * - Allows strict typing with specific topic keys
 * - Falls back to loose mode when T = DefaultTopics
 *
 * @template T - Topics type for topic/payload validation
 * @template TOptions - Adapter-specific publish options
 * @template TBatchMessage - Adapter-specific batch message type
 */
export class Publisher<
	T extends Topics<T> = DefaultTopics,
	TOptions = unknown,
	TBatchMessage = unknown,
> extends BaseComponent<PublisherStepBuilder<T, TOptions, TBatchMessage>> {
	private readonly _adapter: IMQAdapter<unknown, TOptions, TBatchMessage>;
	private _publisherAdapter?: IMQPublisherAdapter<TOptions, TBatchMessage>;

	constructor(name: string, options: PublisherOptions<TOptions, TBatchMessage>) {
		super(name);
		this._adapter = options.adapter;
	}

	createStepBuilder(context: ITestCaseContext): PublisherStepBuilder<T, TOptions, TBatchMessage> {
		return new PublisherStepBuilder<T, TOptions, TBatchMessage>(context, this);
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "publish":
				return this.executePublish(step);
			case "publishBatch":
				return this.executePublishBatch(step);
			default:
				throw new Error(`Unknown step type: ${step.type} for Publisher ${this.name}`);
		}
	}

	private async executePublish(step: Step): Promise<void> {
		const params = step.params as {
			topic: string;
			payload: unknown;
			options?: TOptions;
		};

		if (!this._publisherAdapter) {
			throw new Error(`Publisher ${this.name} is not started`);
		}

		await this._publisherAdapter.publish(params.topic, params.payload, params.options);
	}

	private async executePublishBatch(step: Step): Promise<void> {
		const params = step.params as {
			topic: string;
			messages: TBatchMessage[];
		};

		if (!this._publisherAdapter) {
			throw new Error(`Publisher ${this.name} is not started`);
		}

		await this._publisherAdapter.publishBatch(params.topic, params.messages);
	}

	// =========================================================================
	// Hook Matching (Publisher has no hooks)
	// =========================================================================

	protected createHookMatcher(_step: Step): (message: unknown) => boolean {
		// Publisher has no hooks - always return false
		return () => false;
	}

	// =========================================================================
	// Handler Execution (Publisher has no handlers)
	// =========================================================================

	protected async executeHandler<TContext = unknown>(
		_handler: Handler,
		_payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		// Publisher has no handlers
		return undefined;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._publisherAdapter = await this._adapter.createPublisher();
	}

	protected async doStop(): Promise<void> {
		if (this._publisherAdapter) {
			await this._publisherAdapter.close();
			this._publisherAdapter = undefined;
		}
		this.clearHooks();
	}
}
