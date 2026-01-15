/**
 * Subscriber Component
 *
 * Subscribes to messages from message queues.
 * Extends BaseComponent directly (no protocol required).
 *
 * Message handling modes:
 * - onMessage (non-strict): Works regardless of timing
 * - waitMessage (strict): Error if message arrives before step starts
 */

import { BaseComponent } from "../base/base.component";
import type { ITestCaseContext } from "../base/base.types";
import type { Step, Handler } from "../base/step.types";
import type { Hook } from "../base/hook.types";
import type { IMQAdapter, IMQSubscriberAdapter, Topics, DefaultTopics } from "../mq.base";
import { SubscriberStepBuilder } from "./subscriber.step-builder";
import { createDeferred, type Deferred } from "../../utils";

/**
 * Pending request state for wait steps.
 */
interface PendingRequest extends Deferred<unknown> {
	isWaiting: boolean;
}

/**
 * Buffered message for race condition handling.
 */
interface BufferedMessage<TMessage> {
	topic: string;
	message: TMessage;
	timestamp: number;
}

/**
 * Drop message error - thrown by drop handler.
 */
class DropMessageError extends Error {
	constructor() {
		super("Message dropped");
		this.name = "DropMessageError";
	}
}

export interface SubscriberOptions<TMessage = unknown> {
	adapter: IMQAdapter<TMessage>;
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
export class Subscriber<
	T extends Topics<T> = DefaultTopics,
	TMessage = unknown,
> extends BaseComponent<SubscriberStepBuilder<T, TMessage>> {
	private readonly _adapter: IMQAdapter<TMessage>;
	private _subscriberAdapter?: IMQSubscriberAdapter<TMessage>;

	// Pending request management (from ServiceComponent pattern)
	private _pendingRequests: Map<string, PendingRequest> = new Map();

	// Message buffer for race condition handling
	private _messageBuffer: BufferedMessage<TMessage>[] = [];

	// Topics to subscribe (collected during step registration)
	private _topicsToSubscribe: Set<string> = new Set();

	constructor(name: string, options: SubscriberOptions<TMessage>) {
		super(name);
		this._adapter = options.adapter;
	}

	createStepBuilder(context: ITestCaseContext): SubscriberStepBuilder<T, TMessage> {
		return new SubscriberStepBuilder<T, TMessage>(context, this);
	}

	/**
	 * Mark topic for subscription.
	 * Called by step builder during step registration.
	 */
	ensureSubscribed(topic: string): void {
		this._topicsToSubscribe.add(topic);
	}

	// =========================================================================
	// Pending Request Management
	// =========================================================================

	private createPending(stepId: string, isWaiting: boolean): PendingRequest {
		const deferred = createDeferred<unknown>();
		const pending = { ...deferred, isWaiting };
		this._pendingRequests.set(stepId, pending);
		return pending;
	}

	private getPending(stepId: string): PendingRequest | undefined {
		return this._pendingRequests.get(stepId);
	}

	private setWaiting(stepId: string): void {
		const pending = this._pendingRequests.get(stepId);
		if (pending) {
			pending.isWaiting = true;
		}
	}

	private cleanupPending(stepId: string): void {
		this._pendingRequests.delete(stepId);
		const hook = this.findHookByStepId(stepId);
		if (hook && !hook.persistent) {
			this.removeHook(hook.id);
		}
	}

	private findHookByStepId(stepId: string): Hook<unknown> | undefined {
		return this.hooks.find((h) => h.step?.id === stepId);
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
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

		// Check message buffer first
		const bufferedIndex = this.findInBuffer(params.topics, params.matcher);
		if (bufferedIndex >= 0) {
			const buffered = this._messageBuffer.splice(bufferedIndex, 1)[0];
			await this.executeHandlers(step, buffered.message);
			return;
		}

		// Get existing pending (if message arrived first) or create new one
		let pending = this.getPending(step.id);
		if (pending) {
			this.setWaiting(step.id);
		} else {
			pending = this.createPending(step.id, true);
		}

		try {
			// Wait for handleIncomingMessage to resolve
			const message = await Promise.race([
				pending.promise,
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error(`Timeout waiting for message from [${params.topics.join(", ")}] (${timeout}ms)`));
					}, timeout);
				}),
			]);

			// Execute handlers with the message
			await this.executeHandlers(step, message);
		} finally {
			this.cleanupPending(step.id);
		}
	}

	private findInBuffer(
		topics: string[],
		matcher?: (message: TMessage) => boolean
	): number {
		return this._messageBuffer.findIndex((buffered) => {
			if (!topics.includes(buffered.topic)) {
				return false;
			}
			if (matcher) {
				try {
					return matcher(buffered.message);
				} catch {
					return false;
				}
			}
			return true;
		});
	}

	// =========================================================================
	// Message Handling
	// =========================================================================

	/**
	 * Handle incoming message from adapter.
	 * Topic is passed separately from adapter-specific message.
	 */
	private handleIncomingMessage(topic: string, message: TMessage): void {
		const hook = this.findMatchingHookForMessage(topic, message);
		if (!hook) {
			// No hook registered - add to buffer for potential future waitMessage
			this._messageBuffer.push({
				topic,
				message,
				timestamp: Date.now(),
			});
			return;
		}

		const step = hook.step;
		if (!step) {
			return;
		}

		const isWaitStep = step.type === "waitMessage";

		// For wait steps, check strict ordering
		if (isWaitStep) {
			let pending = this.getPending(step.id);
			if (!pending) {
				// Message arrived before step started - buffer it
				this._messageBuffer.push({
					topic,
					message,
					timestamp: Date.now(),
				});
				return;
			}
			if (!pending.isWaiting) {
				// Step not yet waiting - buffer the message
				this._messageBuffer.push({
					topic,
					message,
					timestamp: Date.now(),
				});
				return;
			}
			// Resolve with message - handlers will be executed in executeWaitMessage
			pending.resolve(message);
		} else {
			// onMessage (non-strict) - execute handlers immediately
			this.executeHandlers(step, message).catch((error) => {
				if (!(error instanceof DropMessageError)) {
					this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
				}
			});
		}
	}

	private findMatchingHookForMessage(topic: string, message: TMessage): Hook<TMessage> | null {
		for (const hook of this.hooks) {
			try {
				// Create a wrapper object for matching
				const matchData = { topic, message };
				if (hook.isMatch(matchData)) {
					return hook as Hook<TMessage>;
				}
			} catch {
				// Matcher error = no match
			}
		}
		return null;
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

			// First check topic match
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
					const errorMsg = handler.description
						? `Assertion failed: ${handler.description}`
						: "Assertion failed";
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

			default:
				return undefined;
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._subscriberAdapter = await this._adapter.createSubscriber();

		// Set up message handler (topic delivered separately)
		this._subscriberAdapter.onMessage((topic, message) => {
			this.handleIncomingMessage(topic, message);
		});

		// Set up error handler
		this._subscriberAdapter.onError((error) => {
			this.trackUnhandledError(error);
		});

		// Set up disconnect handler
		this._subscriberAdapter.onDisconnect(() => {
			// Reject all pending waits
			for (const [stepId, pending] of this._pendingRequests.entries()) {
				pending.reject(new Error(`Disconnected while waiting for message (step: ${stepId})`));
			}
		});

		// Subscribe to all topics collected during step registration
		for (const topic of this._topicsToSubscribe) {
			await this._subscriberAdapter.subscribe(topic);
		}
	}

	protected async doStop(): Promise<void> {
		// Reject pending requests
		for (const [, pending] of this._pendingRequests.entries()) {
			pending.reject(new Error("Subscriber stopped"));
		}
		this._pendingRequests.clear();

		// Clear message buffer
		this._messageBuffer = [];

		// Close adapter
		if (this._subscriberAdapter) {
			await this._subscriberAdapter.close();
			this._subscriberAdapter = undefined;
		}

		// Clear topics
		this._topicsToSubscribe.clear();

		this.clearHooks();
	}
}
