/**
 * Publisher Step Builder
 *
 * Builder for publisher operations.
 * Pure data builder - contains NO execution logic.
 */

import { BaseStepBuilder } from "../base/step-builder";
import type { Topics, Topic, Payload } from "../mq.base";

/**
 * Publisher Step Builder
 *
 * Provides declarative API for publishing messages.
 * All methods register steps - no execution logic here.
 *
 * @template T - Topics type for topic/payload validation
 * @template TOptions - Adapter-specific publish options
 * @template TBatchMessage - Adapter-specific batch message type
 */
export class PublisherStepBuilder<
	T extends Topics = Topics,
	TOptions = unknown,
	TBatchMessage = unknown,
> extends BaseStepBuilder {
	/**
	 * Publish a single message to a topic (action step).
	 *
	 * @param topic - Topic name (validated against Topics type)
	 * @param payload - Message payload (typed per topic)
	 * @param options - Adapter-specific publish options
	 */
	publish<K extends Topic<T>>(topic: K, payload: Payload<T, K>, options?: TOptions): void {
		this.registerStep({
			type: "publish",
			description: `Publish to ${topic}`,
			params: {
				topic,
				payload,
				options,
			},
			handlers: [],
			mode: "action",
		});
	}

	/**
	 * Publish multiple messages in a batch (action step).
	 *
	 * @param topic - Topic name
	 * @param messages - Adapter-specific batch messages
	 */
	publishBatch<K extends Topic<T>>(topic: K, messages: TBatchMessage[]): void {
		this.registerStep({
			type: "publishBatch",
			description: `Publish batch to ${topic}`,
			params: {
				topic,
				messages,
			},
			handlers: [],
			mode: "action",
		});
	}
}
