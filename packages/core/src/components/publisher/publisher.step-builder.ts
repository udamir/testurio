/**
 * Publisher Step Builder
 *
 * Provides test DSL integration for Publisher component.
 * Registers steps for publish operations.
 */

import type { ITestCaseBuilder } from "../../execution";
import type { BatchMessage, DefaultTopics, Payload, PublishOptions, Topic, Topics } from "../mq.base";
import type { Publisher } from "./publisher.component";

/**
 * Step builder for Publisher component.
 *
 * @template T - Topic definitions type
 */
export class PublisherStepBuilder<T extends Topics = DefaultTopics> {
	private readonly publisher: Publisher<T>;
	private readonly builder: ITestCaseBuilder;

	constructor(publisher: Publisher<T>, builder: ITestCaseBuilder) {
		this.publisher = publisher;
		this.builder = builder;
	}

	/**
	 * Register a step to publish a message.
	 *
	 * @param topic - Topic name
	 * @param payload - Message payload
	 * @param options - Optional publish options
	 * @returns this for chaining
	 *
	 * @example
	 * ```typescript
	 * pub.publish("orders", { orderId: "123" });
	 * pub.publish("orders", { orderId: "123" }, { key: "customer-1" });
	 * ```
	 */
	publish<K extends Topic<T>>(topic: K, payload: Payload<T, K>, options?: PublishOptions): this {
		const publisherName = this.publisher.name;

		this.builder.registerStep({
			type: "custom",
			componentName: publisherName,
			messageType: String(topic),
			description: `Publish message to "${String(topic)}"`,
			action: async () => {
				await this.publisher.publish(topic, payload, options);
			},
			metadata: {
				operation: "publish",
				topic: String(topic),
				hasKey: !!options?.key,
				hasHeaders: !!options?.headers,
			},
		});

		return this;
	}

	/**
	 * Register a step to publish multiple messages in a batch.
	 *
	 * @param topic - Topic name
	 * @param messages - Array of messages to publish
	 * @returns this for chaining
	 *
	 * @example
	 * ```typescript
	 * pub.publishBatch("orders", [
	 *   { payload: { orderId: "1" } },
	 *   { payload: { orderId: "2" } },
	 * ]);
	 * ```
	 */
	publishBatch<K extends Topic<T>>(topic: K, messages: BatchMessage<Payload<T, K>>[]): this {
		const publisherName = this.publisher.name;

		this.builder.registerStep({
			type: "custom",
			componentName: publisherName,
			messageType: String(topic),
			description: `Publish ${messages.length} messages to "${String(topic)}"`,
			action: async () => {
				await this.publisher.publishBatch(topic, messages);
			},
			metadata: {
				operation: "publishBatch",
				topic: String(topic),
				messageCount: messages.length,
			},
		});

		return this;
	}
}
