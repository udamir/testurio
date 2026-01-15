/**
 * AsyncClient Component - Async client for persistent connections (WebSocket, TCP, gRPC streams).
 *
 * Event handling modes:
 * - onEvent (non-strict): Works regardless of timing
 * - waitEvent (strict): Error if event arrives before step starts
 *
 * Key features:
 * - Pre-generated connectionId available at design time
 * - Passes connectionId to protocol adapter at runtime
 */

import type { Address, IAsyncClientAdapter, IAsyncProtocol, Message, TlsConfig } from "../../protocols/base";
import type { ITestCaseContext } from "../base/base.types";
import type { Step, Handler } from "../base/step.types";
import { ServiceComponent } from "../base/service.component";
import { AsyncClientStepBuilder } from "./async-client.step-builder";
import { generateId } from "../../utils";

interface EventMessage {
	type: string;
	payload: unknown;
}

export interface AsyncClientOptions<P extends IAsyncProtocol = IAsyncProtocol> {
	protocol: P;
	targetAddress: Address;
	tls?: TlsConfig;
}

export class AsyncClient<P extends IAsyncProtocol = IAsyncProtocol> extends ServiceComponent<P, AsyncClientStepBuilder<P>> {
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;
	private _connection?: IAsyncClientAdapter;

	/**
	 * Pre-generated connection ID.
	 * Available immediately at design time (after component construction).
	 * Passed to protocol adapter at runtime for consistent chain propagation.
	 */
	readonly connectionId: string;

	constructor(name: string, options: AsyncClientOptions<P>) {
		super(name, options.protocol);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
		this.connectionId = generateId("conn_");
	}

	static create<P extends IAsyncProtocol>(name: string, options: AsyncClientOptions<P>): AsyncClient<P> {
		return new AsyncClient<P>(name, options);
	}

	createStepBuilder(context: ITestCaseContext): AsyncClientStepBuilder<P> {
		return new AsyncClientStepBuilder<P>(context, this);
	}

	get targetAddress(): Address {
		return this._targetAddress;
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "sendMessage":
				return this.executeSendMessage(step);
			case "disconnect":
				return this.executeDisconnect();
			case "waitDisconnect":
				return this.executeWaitDisconnect(step);
			case "onEvent":
				// Hook mode - no-op, triggered by incoming events
				break;
			case "waitEvent":
				return this.executeWaitEvent(step);
			default:
				throw new Error(`Unknown step type: ${step.type} for AsyncClient ${this.name}`);
		}
	}

	private async executeDisconnect(): Promise<void> {
		if (this._connection) {
			await this._connection.close();
			this._connection = undefined;
		}
	}

	private async executeWaitDisconnect(step: Step): Promise<void> {
		const params = step.params as { timeout?: number };
		const timeout = params.timeout ?? 5000;

		// Get existing pending (if disconnect happened first) or create new one
		let pending = this.getPending(step.id);
		if (pending) {
			this.setWaiting(step.id);
		} else {
			pending = this.createPending(step.id, true);
		}

		try {
			// Wait for onClose handler to resolve
			await Promise.race([
				pending.promise,
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error(`Timeout waiting for disconnection (${timeout}ms)`));
					}, timeout);
				}),
			]);

			// Execute handlers (e.g., assert)
			await this.executeHandlers(step, undefined);
		} finally {
			this.cleanupPending(step.id);
		}
	}

	private async executeSendMessage(step: Step): Promise<void> {
		const params = step.params as {
			messageType: string;
			payload: unknown;
		};

		if (!this._connection) {
			throw new Error(`AsyncClient ${this.name} is not connected`);
		}

		const message: Message = {
			type: params.messageType,
			payload: params.payload,
		};

		await this._connection.send(message);
	}

	private async executeWaitEvent(step: Step): Promise<void> {
		const params = step.params as {
			eventType: string;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		// Get existing pending (if event arrived first) or create new one
		let pending = this.getPending(step.id);
		if (pending) {
			this.setWaiting(step.id);
		} else {
			pending = this.createPending(step.id, true);
		}

		try {
			// Wait for handleIncomingEvent to resolve (after executing handlers)
			const payload = await Promise.race([
				pending.promise,
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error(`Timeout waiting for event: ${params.eventType} (${timeout}ms)`));
					}, timeout);
				}),
			]);

			// Execute handlers with the payload
			await this.executeHandlers(step, payload);
		} finally {
			this.cleanupPending(step.id);
		}
	}

	// =========================================================================
	// Event Handling
	// =========================================================================

	/**
	 * Handle incoming event from server.
	 * Called by adapter.onMessage callback.
	 */
	private handleIncomingEvent(message: Message): void {
		const eventMessage: EventMessage = {
			type: message.type,
			payload: message.payload,
		};

		const hook = this.findMatchingHook(eventMessage);
		if (!hook) {
			// No hook registered for this event type - ignore
			return;
		}

		const step = hook.step;
		if (!step) {
			return;
		}

		const isWaitStep = step.type === "waitEvent";

		// For wait steps, check strict ordering
		if (isWaitStep) {
			let pending = this.getPending(step.id);
			if (!pending) {
				pending = this.createPending(step.id, false);
			}
			if (!pending.isWaiting) {
				const error = new Error(
					`Strict sequence violation: Event arrived before waitEvent started. ` +
						`Step: ${step.id}, eventType: ${message.type}`
				);
				pending.reject(error);
				this.trackUnhandledError(error);
				return;
			}
			// Resolve with payload - handlers will be executed in executeWaitEvent
			pending.resolve(message.payload);
		} else {
			// onEvent (non-strict) - execute handlers immediately
			this.executeHandlers(step, message.payload).catch((error) => {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			});
		}
	}

	// =========================================================================
	// Hook Matching
	// =========================================================================

	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		if (step.type !== "onEvent" && step.type !== "waitEvent") {
			return () => false;
		}

		const params = step.params as {
			eventType: string;
			matcher?: (payload: unknown) => boolean;
		};

		return (message: unknown): boolean => {
			const msg = message as EventMessage;
			// First check type match
			if (msg.type !== params.eventType) {
				return false;
			}
			// Then check matcher if provided
			if (params.matcher) {
				try {
					return params.matcher(msg.payload);
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
				const predicate = params.predicate as (p: unknown) => boolean | Promise<boolean>;
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
				const transformFn = params.handler as (p: unknown) => unknown | Promise<unknown>;
				return await transformFn(payload);
			}

			default:
				return undefined;
		}
	}

	// =========================================================================
	// Disconnect Handling
	// =========================================================================

	/**
	 * Handle waitDisconnect steps when connection closes.
	 * Finds waitDisconnect steps and resolves their pending promises.
	 */
	private handleWaitDisconnectSteps(): void {
		const hooks = this.hooks.filter((h) => h.step?.type === "waitDisconnect");

		for (const hook of hooks) {
			if (!hook?.step) continue;

			const stepId = hook.step.id;

			// Check pending state for strict ordering
			let pending = this.getPending(stepId);
			if (!pending) {
				pending = this.createPending(stepId, false);
			}

			if (!pending.isWaiting) {
				// Disconnect happened before waitDisconnect started - strict violation
				const error = new Error(
					`Strict sequence violation: Disconnect happened before waitDisconnect started. ` +
						`Step: ${stepId}`
				);
				pending.reject(error);
				this.trackUnhandledError(error);
				continue;
			}

			// Resolve the pending promise
			pending.resolve(undefined);
			// Clean up so the generic handler doesn't reject it
			this.cleanupPending(stepId);
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._connection = await this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
			connectionId: this.connectionId,
		});

		// Set up message handler
		this._connection.onMessage((message) => {
			this.handleIncomingEvent(message);
		});

		// Set up error handler
		this._connection.onError((error) => {
			this.trackUnhandledError(error);
		});

		// Set up close handler
		this._connection.onClose(() => {
			// Handle waitDisconnect steps first
			this.handleWaitDisconnectSteps();

			// Connection closed - reject any remaining pending waits
			for (const [stepId, pending] of this._pendingRequests.entries()) {
				pending.reject(new Error(`Connection closed while waiting for event (step: ${stepId})`));
			}
		});
	}

	protected async doStop(): Promise<void> {
		if (this._connection) {
			await this._connection.close();
			this._connection = undefined;
		}
		this.clearPendingRequests();
		this.clearHooks();
	}
}
