/**
 * Publisher Component
 *
 * Publishes messages to message queues/topics.
 * Fire-and-forget pattern - no hooks.
 *
 * @example Loose mode
 * ```typescript
 * const publisher = new Publisher("pub", { adapter });
 * await publisher.publish("orders", { orderId: "123" });
 * ```
 *
 * @example Strict mode
 * ```typescript
 * interface MyTopics {
 *   orders: { orderId: string };
 * }
 * const publisher = new Publisher<MyTopics>("pub", { adapter });
 * await publisher.publish("orders", { orderId: "123" }); // Type-safe
 * ```
 */

import type { Codec } from "../../codecs";
import { defaultJsonCodec } from "../../codecs";
import type { ITestCaseBuilder } from "../../execution";
import { BaseMQComponent } from "../mq.base";
import type {
	BatchMessage,
	DefaultTopics,
	IMQAdapter,
	IMQPublisherAdapter,
	Payload,
	PublishOptions,
	Topic,
	Topics,
} from "../mq.base";
import { PublisherStepBuilder } from "./publisher.step-builder";

/**
 * Publisher component options
 */
export interface PublisherOptions {
	/**
	 * Message queue adapter
	 */
	adapter: IMQAdapter;

	/**
	 * Codec for payload serialization (defaults to JSON)
	 */
	codec?: Codec;
}

/**
 * Publisher component for sending messages to message queues.
 *
 * @template T - Topic definitions for type-safe publish (defaults to loose mode)
 */
export class Publisher<T extends Topics = DefaultTopics> extends BaseMQComponent<PublisherStepBuilder<T>> {
	private readonly adapter: IMQAdapter;
	private readonly codec: Codec;
	private publisherAdapter: IMQPublisherAdapter | null = null;

	constructor(name: string, options: PublisherOptions) {
		super(name);
		this.adapter = options.adapter;
		this.codec = options.codec ?? defaultJsonCodec;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this.publisherAdapter = await this.adapter.createPublisher(this.codec);
	}

	protected async doStop(): Promise<void> {
		if (this.publisherAdapter) {
			await this.publisherAdapter.close();
			this.publisherAdapter = null;
		}
	}

	// =========================================================================
	// Publishing API
	// =========================================================================

	/**
	 * Publish a single message to a topic.
	 *
	 * @param topic - Topic name
	 * @param payload - Message payload
	 * @param options - Optional publish options (key, headers)
	 *
	 * @example
	 * ```typescript
	 * await publisher.publish("orders", { orderId: "123" });
	 * await publisher.publish("orders", { orderId: "123" }, { key: "customer-1" });
	 * ```
	 */
	async publish<K extends Topic<T>>(topic: K, payload: Payload<T, K>, options?: PublishOptions): Promise<void> {
		if (!this.publisherAdapter) {
			throw new Error(`Publisher ${this.name} is not started`);
		}
		await this.publisherAdapter.publish(topic, payload, options);
	}

	/**
	 * Publish multiple messages to a topic in a batch.
	 *
	 * @param topic - Topic name
	 * @param messages - Array of messages to publish
	 *
	 * @example
	 * ```typescript
	 * await publisher.publishBatch("orders", [
	 *   { payload: { orderId: "1" } },
	 *   { payload: { orderId: "2" }, key: "customer-1" },
	 * ]);
	 * ```
	 */
	async publishBatch<K extends Topic<T>>(topic: K, messages: BatchMessage<Payload<T, K>>[]): Promise<void> {
		if (!this.publisherAdapter) {
			throw new Error(`Publisher ${this.name} is not started`);
		}
		await this.publisherAdapter.publishBatch(topic, messages);
	}

	// =========================================================================
	// Step Builder
	// =========================================================================

	createStepBuilder(builder: ITestCaseBuilder): PublisherStepBuilder<T> {
		return new PublisherStepBuilder<T>(this, builder);
	}
}
