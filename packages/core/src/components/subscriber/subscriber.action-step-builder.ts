/**
 * Subscriber Action Step Builder
 *
 * Returned by `SubscriberStepBuilder.subscribe(...)` /
 * `SubscriberStepBuilder.unsubscribe(...)`. Exposes only `.timeout()` —
 * subscribe/unsubscribe are imperative action steps with no hooks attached.
 */

import { BaseHookBuilder } from "../base/hook-builder";

export class SubscriberSubscribeStepBuilder extends BaseHookBuilder {
	/**
	 * Set the timeout (ms) for the subscribe/unsubscribe broker call. The
	 * Subscriber awaits per-TC adapter materialization + broker subscribe;
	 * adapters like Kafka may need a coordinator join inside this window.
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}
}
