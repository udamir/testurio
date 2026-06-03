/**
 * Kafka adapter errors.
 */

/**
 * Thrown when the Kafka consumer fails to join its consumer group within
 * the configured `groupJoinTimeoutMs` window.
 *
 * Indicates that `KafkaSubscriberAdapter.startConsuming()` could not confirm
 * a `consumer.events.GROUP_JOIN` event before the timeout elapsed — typically
 * a misconfigured broker address, an unreachable cluster, or a stuck rebalance.
 */
export class ConsumerJoinTimeoutError extends Error {
	/**
	 * Timeout window (in milliseconds) that was exceeded.
	 */
	readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		super(
			`Kafka consumer did not emit GROUP_JOIN within ${timeoutMs}ms. ` +
				"Check broker reachability, groupId configuration, and rebalance state."
		);
		this.name = "ConsumerJoinTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}
