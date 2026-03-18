/**
 * Publisher Component
 *
 * Fire-and-forget message publishing to message queues.
 * Extends BaseComponent directly (no protocol required).
 */

import type { Codec } from "../../codecs";
import { defaultJsonCodec } from "../../codecs";
import type { MQValidationOptions } from "../../protocols/base";
import type { MQSchemaInput, SchemaLike } from "../../validation";
import { ValidationError } from "../../validation";
import { BaseComponent } from "../base/base.component";
import type { ITestCaseContext } from "../base/base.types";
import type { Handler, Step, ValueOrFactory } from "../base/step.types";
import { resolveValue } from "../base/step.types";
import type { DefaultTopics, IMQAdapter, IMQPublisherAdapter, Topics } from "../mq.base";
import { PublisherStepBuilder } from "./publisher.step-builder";

export interface PublisherOptions<TOptions = unknown, TBatchMessage = unknown> {
	adapter: IMQAdapter<unknown, TOptions, TBatchMessage>;
	/**
	 * Codec for message serialization.
	 * Defaults to JSON codec.
	 */
	codec?: Codec;
	/** Schema for topic payload validation */
	schema?: MQSchemaInput;
	/** Control auto-validation behavior */
	validation?: MQValidationOptions;
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
	private readonly _codec: Codec;
	private readonly _schema?: MQSchemaInput;
	private readonly _validation?: MQValidationOptions;
	private _publisherAdapter?: IMQPublisherAdapter<TOptions, TBatchMessage>;

	constructor(name: string, options: PublisherOptions<TOptions, TBatchMessage>) {
		super(name);
		this._adapter = options.adapter;
		this._codec = options.codec ?? defaultJsonCodec;
		this._schema = options.schema;
		this._validation = options.validation;
	}

	createStepBuilder(context: ITestCaseContext): PublisherStepBuilder<T, TOptions, TBatchMessage> {
		return new PublisherStepBuilder<T, TOptions, TBatchMessage>(context, this);
	}

	get validationOptions(): MQValidationOptions | undefined {
		return this._validation;
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
			payload: ValueOrFactory<unknown>;
			options?: TOptions;
		};

		const payload = resolveValue(params.payload);

		// Auto-validate outgoing message
		if (this._validation?.validateMessages !== false) {
			this.autoValidate(params.topic, payload);
		}

		if (!this._publisherAdapter) {
			throw new Error(`Publisher ${this.name} is not started`);
		}

		await this._publisherAdapter.publish(params.topic, payload, params.options);
	}

	private async executePublishBatch(step: Step): Promise<void> {
		const params = step.params as {
			topic: string;
			messages: ValueOrFactory<TBatchMessage[]>;
		};

		const messages = resolveValue(params.messages);

		// Auto-validate each message in batch
		if (this._validation?.validateMessages !== false) {
			for (const message of messages) {
				this.autoValidate(params.topic, message);
			}
		}

		if (!this._publisherAdapter) {
			throw new Error(`Publisher ${this.name} is not started`);
		}

		await this._publisherAdapter.publishBatch(params.topic, messages);
	}

	// =========================================================================
	// Schema Lookup
	// =========================================================================

	/**
	 * Look up schema for a topic.
	 * Used by auto-validation.
	 */
	lookupSchema(topic: string): SchemaLike | undefined {
		return this._schema?.[topic];
	}

	/**
	 * Auto-validate data against registered schema.
	 * No-op if no schema is registered for the given topic.
	 */
	private autoValidate(topic: string, data: unknown): void {
		const schema = this.lookupSchema(topic);
		if (!schema) return;

		try {
			schema.parse(data);
		} catch (cause) {
			throw new ValidationError(`Auto-validation failed for ${this.name} '${topic}' (publish)`, {
				componentName: this.name,
				operationId: topic,
				direction: "publish",
				cause,
			});
		}
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
		this._publisherAdapter = await this._adapter.createPublisher(this._codec);
	}

	protected async doStop(): Promise<void> {
		if (this._publisherAdapter) {
			await this._publisherAdapter.close();
			this._publisherAdapter = undefined;
		}
		this.clearHooks();
	}
}
