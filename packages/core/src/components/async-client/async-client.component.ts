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

import type {
	Address,
	AsyncValidationOptions,
	IAsyncClientAdapter,
	IAsyncProtocol,
	Message,
	TlsConfig,
} from "../../protocols/base";
import { generateId } from "../../utils";
import type { AsyncSchemaInput, SchemaLike } from "../../validation";
import { ValidationError } from "../../validation";
import type { ITestCaseContext } from "../base/base.types";
import type { Hook } from "../base/hook.types";
import { ServiceComponent } from "../base/service.component";
import type { Handler, Step } from "../base/step.types";
import { AsyncClientStepBuilder } from "./async-client.step-builder";

interface EventMessage {
	type: string;
	payload: unknown;
}

export interface AsyncClientOptions<P extends IAsyncProtocol = IAsyncProtocol> {
	protocol: P;
	targetAddress: Address;
	tls?: TlsConfig;
	/** Control auto-validation behavior */
	validation?: AsyncValidationOptions;
}

export class AsyncClient<P extends IAsyncProtocol = IAsyncProtocol> extends ServiceComponent<
	P,
	AsyncClientStepBuilder<P>
> {
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;
	private readonly _schema?: AsyncSchemaInput;
	private readonly _validation?: AsyncValidationOptions;
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
		this._schema = options.protocol.schema as AsyncSchemaInput | undefined;
		this._validation = options.validation;
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

	get validationOptions(): AsyncValidationOptions | undefined {
		return this._validation;
	}

	// =========================================================================
	// Hook Registration
	// =========================================================================

	async registerHook(step: Step): Promise<Hook> {
		const withPending = step.type === "waitEvent" || step.type === "waitDisconnect";
		return super.registerHook(step, withPending);
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

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for waitDisconnect`);
		}

		// Strict ordering check for waitDisconnect
		if (hook.resolved) {
			throw new Error(
				`Strict ordering violation: Disconnect happened before waitDisconnect started. ` +
					`Step: ${step.id}. ` +
					`Use onDisconnect() if ordering doesn't matter.`
			);
		}

		try {
			// Wait for onClose handler to resolve
			await this.awaitHook(hook, timeout);

			// Execute handlers (e.g., assert)
			await this.executeHandlers(step, undefined);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	private async executeSendMessage(step: Step): Promise<void> {
		const params = step.params as {
			messageType: string;
			payload: unknown;
		};

		// Auto-validate outgoing message
		if (this._validation?.validateMessages !== false) {
			this.autoValidate(params.messageType, "clientMessage", params.payload);
		}

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

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for waitEvent: ${params.eventType}`);
		}

		// Strict ordering check for waitEvent
		if (hook.resolved) {
			throw new Error(
				`Strict ordering violation: Event arrived before waitEvent started. ` +
					`Step: ${step.id}, eventType: ${params.eventType}. ` +
					`Use onEvent() if ordering doesn't matter.`
			);
		}

		try {
			// Wait for handleIncomingEvent to resolve
			const payload = await this.awaitHook(hook, timeout);

			// Execute handlers with the payload
			await this.executeHandlers(step, payload);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
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
		// Auto-validate incoming event
		if (this._validation?.validateEvents !== false) {
			try {
				this.autoValidate(message.type, "serverMessage", message.payload);
			} catch (error) {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
				return;
			}
		}

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

		if (step.type === "waitEvent") {
			// Resolve hook - wait step will receive payload
			this.resolveHook(hook, message.payload);
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
					const errorMsg = handler.description ? `Assertion failed: ${handler.description}` : "Assertion failed";
					throw new Error(errorMsg);
				}
				return undefined;
			}

			case "transform": {
				const transformFn = params.handler as (p: unknown) => unknown | Promise<unknown>;
				return await transformFn(payload);
			}

			case "validate": {
				const explicitSchema = params.schema as SchemaLike | undefined;
				const lookupKey = params.lookupKey as string;
				const lookupDirection = params.lookupDirection as string;

				const schema = explicitSchema ?? this.lookupSchema(lookupKey, lookupDirection);
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
	// Schema Lookup
	// =========================================================================

	/**
	 * Look up schema for a message type by key and direction.
	 * Used by validate handler and auto-validation.
	 */
	lookupSchema(key: string, direction: string): SchemaLike | undefined {
		if (!this._schema) return undefined;
		if (direction === "clientMessage") return this._schema.clientMessages?.[key];
		if (direction === "serverMessage") return this._schema.serverMessages?.[key];
		return undefined;
	}

	/**
	 * Auto-validate data against registered schema.
	 * No-op if no schema is registered for the given key/direction.
	 */
	private autoValidate(key: string, direction: string, data: unknown): void {
		const schema = this.lookupSchema(key, direction);
		if (!schema) return;

		try {
			schema.parse(data);
		} catch (cause) {
			throw new ValidationError(`Auto-validation failed for ${this.name} '${key}' (${direction})`, {
				componentName: this.name,
				operationId: key,
				direction,
				cause,
			});
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

			// Resolve the hook - executeWaitDisconnect will check hook.resolved for strict ordering
			this.resolveHook(hook, undefined);
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

			// Connection closed - reject any remaining pending hooks
			for (const hook of this.hooks) {
				if (hook.pending && !hook.resolved) {
					this.rejectHook(hook, new Error(`Connection closed while waiting for event (step: ${hook.stepId})`));
				}
			}
		});
	}

	protected async doStop(): Promise<void> {
		if (this._connection) {
			await this._connection.close();
			this._connection = undefined;
		}
		this.clearHooks();
	}
}
