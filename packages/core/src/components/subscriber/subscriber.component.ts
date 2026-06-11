/**
 * Subscriber Component — per-test-case isolation (task 037 v5.8)
 *
 * Always materializes a fresh subscriber adapter per test case via the
 * `IMQAdapter` factory. Each test case owns an entry in `subscribers` keyed by
 * `testCaseId` containing the adapter and the set of topics it has subscribed.
 * Per-TC handler closures route incoming messages, adapter errors, and
 * disconnect events strictly to the originating TC.
 */

import type { Codec } from "../../codecs";
import { defaultJsonCodec } from "../../codecs";
import type { MQValidationOptions } from "../../protocols/base";
import type { MQSchemaInput, SchemaLike } from "../../validation";
import { ValidationError } from "../../validation";
import { recordAssertion } from "../base/assertion-recording";
import { BaseComponent } from "../base/base.component";
import type { ITestCaseContext } from "../base/base.types";
import { stampMetadata } from "../base/base.utils";
import type { Hook } from "../base/hook.types";
import type { Handler, Step } from "../base/step.types";
import type { DefaultTopics, IMQAdapter, IMQSubscriberAdapter, Topics } from "../mq.base";
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

export interface SubscriberOptions<_T extends Topics<_T> = DefaultTopics, TMessage = unknown, P = unknown> {
	/**
	 * MQ adapter **factory** (e.g. `KafkaAdapter`). The Subscriber materializes
	 * a fresh `IMQSubscriberAdapter` per test case via `adapter.createSubscriber()`.
	 *
	 * **v5.8 BREAKING vs master**: previously took an already-materialized
	 * `IMQSubscriberAdapter`; now takes the factory `IMQAdapter`.
	 */
	adapter: IMQAdapter<TMessage, unknown, unknown, P>;
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
	 * Whether to auto-subscribe to topics referenced by `onMessage` /
	 * `waitMessage` / `waitMessageFrom` hooks in the current test case.
	 *
	 * - `true` (default): Phase 1.5 issues a single batched `adapter.subscribe`
	 *   call for every hook-derived topic for the TC. For Kafka this yields
	 *   one `consumer.subscribe + consumer.run` cycle per TC.
	 * - `false`: imperative-only — the test must call `ev.subscribe(...)` to
	 *   trigger broker subscription.
	 *
	 * **v5.8 BREAKING vs master**: the `Array<Topic>` form is removed.
	 */
	autoSubscribe?: boolean;
}

/**
 * Per-TC entry record. Owns the materialized subscriber adapter and the topic
 * set this TC has subscribed to (used for inspection + the empty-array
 * unsubscribe shortcut + per-TC cleanup at TC end).
 *
 * v5.8 — no `params` slot; adapter-wide defaults live on the adapter's own
 * config (e.g. `KafkaAdapterConfig.defaultSubscribeParams`).
 */
interface SubscriberTestCaseEntry<TMessage, P> {
	adapter: IMQSubscriberAdapter<TMessage, P>;
	topics: Set<string>;
}

/**
 * Subscriber Component
 *
 * Subscribes to messages from message queue topics under always-on per-TC
 * isolation. The component is constructed with an `IMQAdapter` factory; a
 * fresh subscriber adapter is materialized lazily for each test case at
 * `afterHooksRegistered` time (Phase 1.5) or on the first subscribe/unsubscribe
 * step (Phase 2).
 *
 * @template T - Topics type for topic validation
 * @template TMessage - Adapter-specific message type
 * @template P - Adapter-specific subscribe-time params (e.g. KafkaSubscribeParams)
 */
export class Subscriber<T extends Topics<T> = DefaultTopics, TMessage = unknown, P = unknown> extends BaseComponent<
	SubscriberStepBuilder<T, TMessage, P>
> {
	private readonly _adapter: IMQAdapter<TMessage, unknown, unknown, P>;
	private readonly _codec: Codec;
	private readonly _schema?: MQSchemaInput;
	private readonly _validation?: MQValidationOptions;
	private readonly _autoSubscribe: boolean;

	/** Per-TC subscriber entries — `{ adapter, topics }`. */
	private readonly subscribers = new Map<string, SubscriberTestCaseEntry<TMessage, P>>();
	/**
	 * Topics derived from `onMessage` / `waitMessage` / `waitMessageFrom` hooks
	 * for each TC. Populated by `registerHook` regardless of `_autoSubscribe`
	 * so the v5.2 empty-array `subscribe()` shortcut can resolve them at any
	 * point inside the TC body.
	 */
	private readonly _hookDerivedTopics = new Map<string, Set<string>>();

	/**
	 * Set to `true` by `doStop` so late `ensureTestCaseEntry` calls bail out
	 * instead of materializing an adapter that would outlive scenario teardown.
	 */
	private _isStopping = false;
	/**
	 * In-flight `ensureTestCaseEntry` promises so `doStop` can drain them
	 * before walking `subscribers` for close.
	 */
	private readonly _materializing = new Set<Promise<unknown>>();

	constructor(name: string, options: SubscriberOptions<T, TMessage, P>) {
		super(name);
		this._adapter = options.adapter;
		this._codec = options.codec ?? defaultJsonCodec;
		this._schema = options.schema;
		this._validation = options.validation;
		this._autoSubscribe = options.autoSubscribe ?? true;
	}

	createStepBuilder(context: ITestCaseContext): SubscriberStepBuilder<T, TMessage, P> {
		return new SubscriberStepBuilder<T, TMessage, P>(context, this);
	}

	get validationOptions(): MQValidationOptions | undefined {
		return this._validation;
	}

	// =========================================================================
	// Per-TC entry management
	// =========================================================================

	/**
	 * Materialize this TC's subscriber adapter on first need.
	 * Idempotent — subsequent calls return the cached entry.
	 *
	 * Refuses to materialize once `doStop` has flipped `_isStopping`.
	 * Tracks the in-flight create promise in `_materializing` so `doStop`
	 * can await drain before tearing down.
	 */
	private async ensureTestCaseEntry(testCaseId: string): Promise<SubscriberTestCaseEntry<TMessage, P>> {
		const existing = this.subscribers.get(testCaseId);
		if (existing) return existing;

		if (this._isStopping) {
			throw new Error(`Subscriber "${this.name}" is stopping; cannot materialize entry for "${testCaseId}"`);
		}

		const materialization = this._adapter.createSubscriber(this._codec);
		this._materializing.add(materialization);
		let adapter: IMQSubscriberAdapter<TMessage, P>;
		try {
			adapter = await materialization;
		} finally {
			this._materializing.delete(materialization);
		}

		// Per-TC handler closures — capture testCaseId so deliveries, errors,
		// and disconnects from this adapter are attributed strictly to this TC.
		adapter.onMessage((topic, message) => this.handleMessage(testCaseId, topic, message));
		adapter.onError((error) => this.handleAdapterError(testCaseId, error));
		adapter.onDisconnect(() => this.handleAdapterDisconnect(testCaseId));

		const entry: SubscriberTestCaseEntry<TMessage, P> = { adapter, topics: new Set() };
		this.subscribers.set(testCaseId, entry);
		return entry;
	}

	/**
	 * Subscribe this TC's adapter to the given topics. `callParams` flows
	 * through unchanged — `undefined` means "auto-subscribe / no per-topic
	 * opinion" (Phase 1.5 path); an object means "explicit per-call" and the
	 * adapter records first-explicit-wins per topic.
	 */
	private async addTopics(testCaseId: string, topics: string[], callParams: Partial<P> | undefined): Promise<void> {
		if (topics.length === 0) return;
		const entry = await this.ensureTestCaseEntry(testCaseId);
		for (const t of topics) entry.topics.add(t);
		await entry.adapter.subscribe(topics, callParams);
	}

	/**
	 * Remove the given topics from this TC's adapter, filtered to topics the
	 * TC actually holds. No-op when the TC never materialized an adapter.
	 */
	private async removeTopics(testCaseId: string, topics: string[]): Promise<void> {
		const entry = this.subscribers.get(testCaseId);
		if (!entry) return;
		const heldTopics = topics.filter((t) => entry.topics.has(t));
		if (heldTopics.length === 0) return;
		for (const t of heldTopics) entry.topics.delete(t);
		await entry.adapter.unsubscribe(heldTopics);
	}

	// =========================================================================
	// Per-TC handler closures (wired at ensureTestCaseEntry)
	// =========================================================================

	/**
	 * Dispatch an incoming message to hooks registered under this TC only.
	 * Other TCs' hooks are untouched — per-TC adapters guarantee isolation.
	 */
	private handleMessage(testCaseId: string, topic: string, message: TMessage): void {
		// Auto-validate incoming message
		if (this._validation?.validateMessages !== false) {
			try {
				this.autoValidate(topic, message);
			} catch (error) {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)), testCaseId);
				return;
			}
		}

		const hook = this.findMatchingHookForTestCase(testCaseId, topic, message);
		if (!hook?.step) {
			return; // No matching hook in this TC's scope — ignore.
		}

		// Stamp incoming message for the reporter. For `waitMessage` the wait
		// step also stamps after `awaitHook` returns — same value, no harm.
		stampMetadata(hook.step, { message });

		if (hook.step.type === "waitMessage") {
			this.resolveHook(hook, message);
		} else if (hook.step.type === "onMessage") {
			this.executeHandlers(hook.step, message).catch((error) => {
				if (!(error instanceof DropMessageError)) {
					this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)), testCaseId);
				}
			});
		}
	}

	/**
	 * Attribute an adapter-level error to the originating TC. Other TCs run
	 * on independent adapters and are unaffected.
	 */
	private handleAdapterError(testCaseId: string, error: Error): void {
		this.trackUnhandledError(error, testCaseId);
	}

	/**
	 * Reject only this TC's pending hooks. Other TCs' pending hooks stay
	 * intact because their adapters remain connected.
	 */
	private handleAdapterDisconnect(testCaseId: string): void {
		for (const hook of this.hooks) {
			if (hook.pending && !hook.resolved && hook.testCaseId === testCaseId) {
				this.rejectHook(hook, new Error("Disconnected"));
			}
		}
	}

	private findMatchingHookForTestCase(testCaseId: string, topic: string, message: TMessage): Hook | null {
		for (const hook of this.hooks) {
			if (hook.resolved) continue;
			if (hook.testCaseId !== testCaseId) continue;
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
	// Hook Registration (Phase 1 + 1.5)
	// =========================================================================

	/**
	 * Register a hook for the step.
	 *
	 * **v5.6 BREAKING**: Subscriber hooks must be registered inside `testCase()`
	 * bodies. Persistent/scenario-level Subscriber hooks (and those registered
	 * inside `scenario.init` / `scenario.stop` handlers, which also arrive
	 * with `step.testCaseId === undefined`) are no longer supported.
	 */
	async registerHook(step: Step): Promise<Hook> {
		if (step.testCaseId === undefined) {
			throw new Error(
				`Subscriber "${this.name}" hooks must be registered inside testCase() bodies. ` +
					"Scenario-level / init / stop subscribe/onMessage/waitMessage is not supported " +
					"(see migration guide for task 037). Move the hook into a testCase() body."
			);
		}

		const withPending = step.type === "waitMessage";
		const hook = await super.registerHook(step, withPending);

		// Queue hook-derived topics for this TC unconditionally so the v5.2
		// empty-array `ev.subscribe()` shortcut can resolve them later.
		if (step.type === "waitMessage" || step.type === "onMessage") {
			const params = step.params as { topics?: string[] };
			if (params.topics && params.topics.length > 0) {
				let set = this._hookDerivedTopics.get(step.testCaseId);
				if (!set) {
					set = new Set();
					this._hookDerivedTopics.set(step.testCaseId, set);
				}
				for (const t of params.topics) set.add(t);
			}
		}

		return hook;
	}

	/**
	 * Phase 1.5 readiness hook.
	 *
	 * If `_autoSubscribe` is on (default) and this TC has accumulated any
	 * hook-derived topics, issue a single batched `addTopics` call. The
	 * adapter activates its delivery loop transparently on first subscribe.
	 */
	async afterHooksRegistered(testCaseId: string): Promise<void> {
		if (!this._autoSubscribe) return;
		const queued = this._hookDerivedTopics.get(testCaseId);
		if (!queued || queued.size === 0) return;
		await this.addTopics(testCaseId, [...queued], undefined);
	}

	// =========================================================================
	// Step Execution (Phase 2)
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "onMessage":
				// Hook mode - no-op, triggered by incoming messages
				return;
			case "waitMessage":
				return this.executeWaitMessage(step);
			case "subscribe":
				return this.executeSubscribe(step);
			case "unsubscribe":
				return this.executeUnsubscribe(step);
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
			stampMetadata(step, { message });

			// Execute handlers with the message
			await this.executeHandlers(step, message);
		} finally {
			// Clean up non-persistent hook after step completes
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	private async executeSubscribe(step: Step): Promise<void> {
		const { topics: requestedTopics, subscribeParams } = step.params as {
			topics: string[];
			subscribeParams?: Partial<P>;
		};
		if (step.testCaseId === undefined) {
			throw new Error(
				`Subscriber step "${step.description}" has no testCaseId — Subscriber must be used inside testCase() bodies`
			);
		}
		const testCaseId = step.testCaseId;
		// v5.2 — empty array → "subscribe to all hook-derived topics for this TC".
		const topics =
			requestedTopics.length === 0 ? [...(this._hookDerivedTopics.get(testCaseId) ?? [])] : requestedTopics;
		if (topics.length === 0) return; // No-op when the shortcut resolves empty.
		await this.addTopics(testCaseId, topics, subscribeParams);
	}

	private async executeUnsubscribe(step: Step): Promise<void> {
		const { topics: requestedTopics } = step.params as { topics: string[] };
		if (step.testCaseId === undefined) {
			throw new Error(
				`Subscriber step "${step.description}" has no testCaseId — Subscriber must be used inside testCase() bodies`
			);
		}
		const testCaseId = step.testCaseId;
		// v5.2 — empty array → "unsubscribe from all currently-held topics for this TC".
		const entry = this.subscribers.get(testCaseId);
		const topics = requestedTopics.length === 0 ? (entry ? [...entry.topics] : []) : requestedTopics;
		if (topics.length === 0) return; // No-op when shortcut resolves empty.
		await this.removeTopics(testCaseId, topics);
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
		step: Step,
		payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		const params = handler.params as Record<string, unknown>;

		switch (handler.type) {
			case "assert": {
				const predicate = params.predicate as (m: unknown) => boolean | undefined | Promise<boolean | undefined>;
				const description = handler.description;
				try {
					const result = await predicate(payload);
					if (result === false) {
						const errorMsg = description ? `Assertion failed: ${description}` : "Assertion failed";
						recordAssertion(step, { passed: false, description, error: errorMsg });
						throw new Error(errorMsg);
					}
					recordAssertion(step, { passed: true, description });
					return undefined;
				} catch (err) {
					if (err instanceof Error && !err.message.startsWith("Assertion failed")) {
						recordAssertion(step, { passed: false, description, error: err.message });
					}
					throw err;
				}
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
	// Phase 3: Per-TC cleanup
	// =========================================================================

	/**
	 * v5.7 (C1) — idempotent. `clearHooks(testCaseId)` is invoked twice per
	 * TC: once by `step-executor.ts` at the end of the step loop and once by
	 * `test-scenario.ts:452` after the TC completes. The second invocation
	 * finds no entry and returns without throwing.
	 *
	 * v5.7 (H2) — cleanup errors are routed via `trackUnhandledError(error,
	 * testCaseId)` so adapter-close failures surface as the originating TC's
	 * failure instead of being swallowed by step-executor's outer try/catch.
	 */
	clearHooks(testCaseId?: string): void | Promise<void> {
		if (testCaseId === undefined) {
			// Scenario-wide clear (e.g. from `doStop`). Base behavior + drop
			// everything per-TC; adapter teardown is owned by `doStop`.
			super.clearHooks();
			this._hookDerivedTopics.clear();
			return;
		}
		return this.clearHooksForTestCase(testCaseId);
	}

	private async clearHooksForTestCase(testCaseId: string): Promise<void> {
		super.clearHooks(testCaseId);
		const entry = this.subscribers.get(testCaseId);
		if (!entry) {
			// Second call (already cleared) OR TC that never materialized an entry.
			this._hookDerivedTopics.delete(testCaseId);
			return;
		}
		this.subscribers.delete(testCaseId);
		this._hookDerivedTopics.delete(testCaseId);
		try {
			await entry.adapter.close();
		} catch (err) {
			this.trackUnhandledError(err instanceof Error ? err : new Error(String(err)), testCaseId);
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		// No-op: subscriber adapters are materialized per-TC, not at scenario
		// start. The factory (`this._adapter`) is already constructed.
	}

	protected async doStop(): Promise<void> {
		this._isStopping = true;

		// Drain in-flight materializations so we don't tear down adapters that
		// are still being created.
		if (this._materializing.size > 0) {
			await Promise.allSettled([...this._materializing]);
		}

		// Reject any still-pending hooks first so any handler that races against
		// adapter close fails fast.
		for (const hook of this.hooks) {
			if (hook.pending && !hook.resolved) {
				this.rejectHook(hook, new Error("Subscriber stopped"));
			}
		}

		// Close every per-TC adapter still alive. Best-effort — errors during
		// teardown are logged via `trackUnhandledError` and swallowed so other
		// adapters still get closed.
		const closes: Promise<void>[] = [];
		for (const [testCaseId, entry] of this.subscribers) {
			closes.push(
				entry.adapter.close().catch((err) => {
					this.trackUnhandledError(err instanceof Error ? err : new Error(String(err)), testCaseId);
				})
			);
		}
		await Promise.allSettled(closes);

		this.subscribers.clear();
		this._hookDerivedTopics.clear();
		this.clearHooks();
	}
}
