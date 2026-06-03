/**
 * Subscriber Component
 *
 * Subscribes to messages from message queues.
 * Extends BaseComponent directly (no protocol required).
 *
 * Uses unified Hook pattern with pending for wait steps.
 * Messages are captured directly by Hook.pending - no buffer needed.
 */

import type { Codec } from "../../codecs";
import { defaultJsonCodec } from "../../codecs";
import type { MQValidationOptions } from "../../protocols/base";
import type { MQSchemaInput, SchemaLike } from "../../validation";
import { ValidationError } from "../../validation";
import { BaseComponent } from "../base/base.component";
import type { ITestCaseContext } from "../base/base.types";
import type { Hook } from "../base/hook.types";
import type { Handler, Step } from "../base/step.types";
import type { DefaultTopics, IMQAdapter, IMQSubscriberAdapter, Topic, Topics } from "../mq.base";
import { SubscriberStepBuilder } from "./subscriber.step-builder";

/**
 * Drop message error - thrown by drop handler.
 */
class DropMessageError extends Error {
	constructor() {
		super("Message dropped");
		this.name = "DropMessageError";
	}
}

export interface SubscriberOptions<T extends Topics<T> = DefaultTopics, TMessage = unknown> {
	adapter: IMQAdapter<TMessage>;
	/**
	 * Codec for message deserialization.
	 * Defaults to JSON codec.
	 */
	codec?: Codec;
	/** Schema for topic payload validation */
	schema?: MQSchemaInput;
	/** Control auto-validation behavior */
	validation?: MQValidationOptions;
	/**
	 * Eager subscription mode. Controls when the underlying subscriber adapter
	 * subscribes to topics and starts consuming.
	 *
	 * - `string[]` — Subscribe to the listed topics and call `startConsuming`
	 *   during `doStart()`, before any test case runs. Use when the topic set
	 *   is known statically.
	 *   **Foot-gun:** topics drift — adding a `.waitMessage('new.topic')` step
	 *   without updating this list silently falls back to the lazy path for
	 *   that topic.
	 *
	 * - `true` — Defer to the executor's post-hooks-registered seam: after
	 *   Phase 1 has subscribed every topic referenced by `onMessage`/
	 *   `waitMessage` steps for the current test case, the executor calls
	 *   `afterHooksRegistered()`, which triggers `startConsuming`. The
	 *   consumer is hot before the first action step runs. No double
	 *   declaration of topics; topics are derived from registered hooks.
	 *
	 * - `undefined` (default) — Lazy: `startConsuming` is triggered by the
	 *   first subscriber step inside the test case. Backward-compatible with
	 *   existing scenarios.
	 *
	 * Recommended for Kafka and any other adapter whose `startConsuming`
	 * incurs consumer-group coordination latency.
	 */
	autoSubscribe?: true | Array<Topic<T>>;
}

/**
 * Subscriber Component
 *
 * Subscribes to messages from message queue topics.
 *
 * Uses self-referential constraint `T extends Topics<T>` which:
 * - Does NOT require T to have an index signature
 * - Allows strict typing with specific topic keys
 * - Falls back to loose mode when T = DefaultTopics
 *
 * @template T - Topics type for topic validation
 * @template TMessage - Adapter-specific message type
 */
export class Subscriber<T extends Topics<T> = DefaultTopics, TMessage = unknown> extends BaseComponent<
	SubscriberStepBuilder<T, TMessage>
> {
	private readonly _adapter: IMQAdapter<TMessage>;
	private readonly _codec: Codec;
	private readonly _schema?: MQSchemaInput;
	private readonly _validation?: MQValidationOptions;
	private readonly _autoSubscribe?: true | Array<Topic<T>>;
	private _subscriberAdapter?: IMQSubscriberAdapter<TMessage>;

	constructor(name: string, options: SubscriberOptions<T, TMessage>) {
		super(name);
		this._adapter = options.adapter;
		this._codec = options.codec ?? defaultJsonCodec;
		this._schema = options.schema;
		this._validation = options.validation;
		this._autoSubscribe = options.autoSubscribe;
	}

	createStepBuilder(context: ITestCaseContext): SubscriberStepBuilder<T, TMessage> {
		return new SubscriberStepBuilder<T, TMessage>(context, this);
	}

	get validationOptions(): MQValidationOptions | undefined {
		return this._validation;
	}

	// =========================================================================
	// Hook Registration
	// =========================================================================

	/**
	 * Register hook and subscribe to topics.
	 * Awaits subscriptions to ensure they're ready before returning.
	 */
	async registerHook(step: Step): Promise<Hook> {
		// Use withPending=true for wait steps to capture messages
		const withPending = step.type === "waitMessage";
		const hook = await super.registerHook(step, withPending);

		// Subscribe and await completion
		await this.subscribeToTopics(step);

		return hook;
	}

	private async subscribeToTopics(step: Step): Promise<void> {
		if (step.type !== "waitMessage" && step.type !== "onMessage") {
			return;
		}

		const params = step.params as { topics?: string[] };
		if (params.topics && this._subscriberAdapter) {
			const subscriptionPromises: Promise<void>[] = [];

			for (const topic of params.topics) {
				if (!this._subscriberAdapter.getSubscribedTopics().includes(topic)) {
					subscriptionPromises.push(
						this._subscriberAdapter.subscribe(topic).catch((err) => {
							this.trackUnhandledError(err instanceof Error ? err : new Error(String(err)));
						})
					);
				}
			}

			if (subscriptionPromises.length > 0) {
				await Promise.all(subscriptionPromises);
			}
		}
	}

	/**
	 * Phase 1.5 readiness hook.
	 *
	 * When `autoSubscribe: true`, every topic referenced by `onMessage` /
	 * `waitMessage` steps in the current test case has already been subscribed
	 * during Phase 1 (`registerHook` awaits `subscribeToTopics`). Calling
	 * `startConsuming` here ensures the consumer is hot before any action step
	 * runs, eliminating the publish-before-consumer-join race.
	 *
	 * No-op when `autoSubscribe` is not `true` — the `string[]` mode handles
	 * startConsuming in `doStart`, and the default (undefined) mode keeps the
	 * lazy executeStep trigger.
	 */
	async afterHooksRegistered(): Promise<void> {
		if (this._autoSubscribe === true && this._subscriberAdapter?.startConsuming) {
			await this._subscriberAdapter.startConsuming();
		}
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		// Start consumer if not running (for Kafka-like adapters with deferred start)
		// By this point, all hooks are registered and topics are subscribed
		if (this._subscriberAdapter?.startConsuming) {
			await this._subscriberAdapter.startConsuming();
		}
		switch (step.type) {
			case "onMessage":
				// Hook mode - no-op, triggered by incoming messages
				break;
			case "waitMessage":
				return this.executeWaitMessage(step);
			default:
				throw new Error(`Unknown step type: ${step.type} for Subscriber ${this.name}`);
		}
	}

	private async executeWaitMessage(step: Step): Promise<void> {
		const params = step.params as {
			topics: string[];
			matcher?: (message: TMessage) => boolean;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		// Find the hook registered in Phase 1
		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for step ${step.id}`);
		}

		try {
			// Await the hook (may already be resolved if message arrived)
			const message = await this.awaitHook(hook, timeout);

			// Execute handlers with the message
			await this.executeHandlers(step, message);
		} finally {
			// Clean up non-persistent hook after step completes
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	// =========================================================================
	// Message Handling
	// =========================================================================

	/**
	 * Handle incoming message from adapter.
	 * Topic is passed separately from adapter-specific message.
	 */
	private handleIncomingMessage(topic: string, message: TMessage): void {
		// Auto-validate incoming message
		if (this._validation?.validateMessages !== false) {
			try {
				this.autoValidate(topic, message);
			} catch (error) {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
				return;
			}
		}

		const hook = this.findMatchingHookForMessage(topic, message);
		if (!hook?.step) {
			return; // No matching hook - ignore
		}

		if (hook.step.type === "waitMessage") {
			// Resolve the hook's pending - step will receive message
			this.resolveHook(hook, message);
		} else if (hook.step.type === "onMessage") {
			// Execute handlers immediately for hook mode
			this.executeHandlers(hook.step, message).catch((error) => {
				if (!(error instanceof DropMessageError)) {
					this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
				}
			});
		}
	}

	private findMatchingHookForMessage(topic: string, message: TMessage): Hook | null {
		for (const hook of this.hooks) {
			// Skip already-resolved hooks (for multiple messages on same topic)
			if (hook.resolved) {
				continue;
			}
			try {
				const matchData = { topic, message };
				if (hook.isMatch(matchData)) {
					return hook;
				}
			} catch {
				// Matcher error = no match
			}
		}
		return null;
	}

	// =========================================================================
	// Schema Lookup
	// =========================================================================

	/**
	 * Look up schema for a topic.
	 * Used by validate handler and auto-validation.
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
			throw new ValidationError(`Auto-validation failed for ${this.name} '${topic}' (subscribe)`, {
				componentName: this.name,
				operationId: topic,
				direction: "subscribe",
				cause,
			});
		}
	}

	// =========================================================================
	// Hook Matching
	// =========================================================================

	protected createHookMatcher(step: Step): (data: unknown) => boolean {
		if (step.type !== "onMessage" && step.type !== "waitMessage") {
			return () => false;
		}

		const params = step.params as {
			topics: string[];
			matcher?: (message: TMessage) => boolean;
		};

		return (data: unknown): boolean => {
			const { topic, message } = data as { topic: string; message: TMessage };

			// Check exact topic match (adapter handles pattern resolution)
			if (!params.topics.includes(topic)) {
				return false;
			}

			// Then check matcher if provided
			if (params.matcher) {
				try {
					return params.matcher(message);
				} catch {
					return false;
				}
			}

			return true;
		};
	}

	// =========================================================================
	// Handler Execution
	// =========================================================================

	protected async executeHandler<TContext = unknown>(
		handler: Handler,
		payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		const params = handler.params as Record<string, unknown>;

		switch (handler.type) {
			case "assert": {
				const predicate = params.predicate as (m: unknown) => boolean | Promise<boolean>;
				const result = await predicate(payload);
				if (!result) {
					const errorMsg = handler.description ? `Assertion failed: ${handler.description}` : "Assertion failed";
					throw new Error(errorMsg);
				}
				return undefined;
			}

			case "transform": {
				const transformFn = params.handler as (m: unknown) => unknown | Promise<unknown>;
				return await transformFn(payload);
			}

			case "drop": {
				throw new DropMessageError();
			}

			case "validate": {
				const explicitSchema = params.schema as SchemaLike | undefined;
				const lookupKey = params.lookupKey as string;
				const lookupDirection = params.lookupDirection as string;

				const schema = explicitSchema ?? this.lookupSchema(lookupKey);
				if (!schema) {
					throw new ValidationError(`No schema registered for '${lookupKey}' (${lookupDirection})`, {
						componentName: this.name,
						operationId: lookupKey,
						direction: lookupDirection,
					});
				}

				try {
					return schema.parse(payload);
				} catch (cause) {
					if (cause instanceof ValidationError) throw cause;
					throw new ValidationError(`Validation failed for ${this.name} '${lookupKey}' (${lookupDirection})`, {
						componentName: this.name,
						operationId: lookupKey,
						direction: lookupDirection,
						cause,
					});
				}
			}

			default:
				return undefined;
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._subscriberAdapter = await this._adapter.createSubscriber(this._codec);

		// Set up message handler
		this._subscriberAdapter.onMessage((topic, message) => {
			this.handleIncomingMessage(topic, message);
		});

		// Set up error handler
		this._subscriberAdapter.onError((error) => {
			this.trackUnhandledError(error);
		});

		// Set up disconnect handler - reject all pending hooks
		this._subscriberAdapter.onDisconnect(() => {
			for (const hook of this.hooks) {
				if (hook.pending) {
					this.rejectHook(hook, new Error("Disconnected"));
				}
			}
		});

		// Eager-subscribe explicit topic list (autoSubscribe: string[] mode).
		// After this returns, the consumer has joined the group (Kafka) and any
		// subsequently-published message on these topics will be delivered.
		if (Array.isArray(this._autoSubscribe)) {
			for (const topic of this._autoSubscribe) {
				await this._subscriberAdapter.subscribe(topic);
			}
			if (this._subscriberAdapter.startConsuming) {
				await this._subscriberAdapter.startConsuming();
			}
		}
	}

	protected async doStop(): Promise<void> {
		// Reject pending hooks
		for (const hook of this.hooks) {
			if (hook.pending) {
				this.rejectHook(hook, new Error("Subscriber stopped"));
			}
		}

		// Close adapter
		if (this._subscriberAdapter) {
			await this._subscriberAdapter.close();
			this._subscriberAdapter = undefined;
		}

		this.clearHooks();
	}
}
