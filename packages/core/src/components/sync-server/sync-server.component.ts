/**
 * Server Component - Sync server for mock/proxy modes (HTTP, gRPC unary).
 *
 * Modes:
 * - Mock: No targetAddress - generates responses via handlers
 * - Proxy: With targetAddress - forwards to target, can intercept/transform
 *
 * Request handling modes:
 * - onRequest (non-strict): Works regardless of timing
 * - waitRequest (strict): Error if request arrives before step starts
 */

import type { Address, ISyncClientAdapter, ISyncProtocol, ISyncServerAdapter, MessageMatcher, TlsConfig } from "../../protocols/base";
import type { ITestCaseContext } from "../base/base.types";
import type { Step, Handler } from "../base/step.types";
import type { Hook } from "../base/hook.types";
import { ServiceComponent } from "../base/service.component";
import { DropMessageError, sleep } from "../base/base.utils";
import { SyncServerStepBuilder } from "./sync-server.step-builder";

export interface ServerOptions<P extends ISyncProtocol = ISyncProtocol> {
	protocol: P;
	listenAddress: Address;
	targetAddress?: Address;
	tls?: TlsConfig;
}

export class Server<P extends ISyncProtocol = ISyncProtocol> extends ServiceComponent<P, SyncServerStepBuilder<P>> {
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;
	private _serverAdapter?: ISyncServerAdapter;
	private _clientAdapter?: ISyncClientAdapter;

	constructor(name: string, options: ServerOptions<P>) {
		super(name, options.protocol);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	static create<P extends ISyncProtocol>(name: string, options: ServerOptions<P>): Server<P> {
		return new Server<P>(name, options);
	}

	createStepBuilder(context: ITestCaseContext): SyncServerStepBuilder<P> {
		return new SyncServerStepBuilder<P>(context, this);
	}

	get isProxy(): boolean {
		return this._targetAddress !== undefined;
	}

	// =========================================================================
	// Hook Registration
	// =========================================================================

	async registerHook(step: Step): Promise<Hook> {
		const withPending = step.type === "waitRequest";
		return super.registerHook(step, withPending);
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "onRequest":
			case "onResponse":
				// Hook steps are no-op - triggered by incoming requests
				break;
			case "waitRequest":
				await this.executeWaitRequest(step);
				break;
			default:
				throw new Error(`Unknown step type: ${step.type} for Server ${this.name}`);
		}
	}

	private async executeWaitRequest(step: Step): Promise<void> {
		const params = step.params as {
			messageType: string;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for waitRequest: ${params.messageType}`);
		}

		// Strict ordering check for waitRequest
		if (hook.resolved) {
			throw new Error(
				`Strict ordering violation: Request arrived before waitRequest started. ` +
					`Step: ${step.id}, messageType: ${params.messageType}. ` +
					`Use onRequest() if ordering doesn't matter.`
			);
		}

		try {
			// Wait for handleIncomingRequest to resolve (after executing handlers)
			await this.awaitHook(hook, timeout);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	// =========================================================================
	// Request Handling
	// =========================================================================

	async handleIncomingRequest(messageType: string, request: P["$request"]): Promise<P["$response"] | null> {
		const message = { type: messageType, payload: request };

		const hook = this.findMatchingHook(message);
		if (!hook) {
			if (this.isProxy) {
				return this.forwardRequest(messageType, request);
			}
			return null; // No handler - protocol sends default 404
		}

		const step = hook.step;
		const isWaitStep = step.type === "waitRequest";

		try {
			const result = await this.executeServerHandlers(step, message);

			// Notify wait step that handling is complete
			if (isWaitStep) {
				this.resolveHook(hook, undefined);
			}

			if (!result) {
				return null;
			}

			if (result.type === "response") {
				return result.payload as P["$response"];
			}

			if (this.isProxy) {
				return this.forwardRequest(result.type, result.payload);
			}

			return null;
		} catch (error) {
			// Notify wait step of error
			if (isWaitStep) {
				this.rejectHook(hook, error instanceof Error ? error : new Error(String(error)));
			}

			if (error instanceof DropMessageError) {
				return null;
			}
			if (error instanceof Error) {
				this.trackUnhandledError(error);
			}
			throw error;
		}
	}

	/**
	 * Execute handlers for server step.
	 * Extracts payload from message and handles response type specially.
	 */
	private async executeServerHandlers<TMessage extends { type: string; payload: unknown }>(
		step: Step,
		message: TMessage
	): Promise<TMessage | null> {
		let payload = message.payload;
		let resultType = message.type;

		for (const handler of step.handlers) {
			const result = await this.executeHandler(handler, payload, message);

			if (result === null) {
				return null;
			}

			if (result !== undefined) {
				if (typeof result === "object" && result !== null && "type" in result && "payload" in result) {
					const typed = result as { type: string; payload: unknown };
					if (typed.type === "response") {
						return typed as unknown as TMessage;
					}
					payload = typed.payload;
					resultType = typed.type;
				} else {
					payload = result;
				}
			}
		}

		return { ...message, type: resultType, payload } as TMessage;
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

			case "delay": {
				const ms = params.ms as number | (() => number);
				const delayMs = typeof ms === "function" ? ms() : ms;
				await sleep(delayMs);
				return undefined;
			}

			case "drop":
				throw new DropMessageError();

			case "proxy": {
				const transformFn = params.handler as ((p: unknown) => unknown | Promise<unknown>) | undefined;
				if (transformFn) {
					return await transformFn(payload);
				}
				return undefined;
			}

			case "mockResponse": {
				const responseHandler = params.handler as (p: unknown) => unknown | Promise<unknown>;
				const response = await responseHandler(payload);
				return { type: "response", payload: response };
			}

			default:
				return undefined;
		}
	}

	// =========================================================================
	// Hook Matching
	// =========================================================================

	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		if (step.type !== "onRequest" && step.type !== "waitRequest" && step.type !== "onResponse") {
			return () => false;
		}

		const params = step.params as {
			messageType?: string;
			options?: { method?: string; path?: string };
		};

		const messageType = params.messageType ?? "";

		// Use protocol-specific matcher if available (e.g., HTTP method+path matching)
		if ("createMessageTypeMatcher" in this.protocol && typeof this.protocol.createMessageTypeMatcher === "function") {
			const protocolMatcher = (this.protocol.createMessageTypeMatcher as (
				messageType: string,
				options: unknown
			) => MessageMatcher<unknown> | string).bind(this.protocol);

			const matcher = protocolMatcher(messageType, params.options);

			if (typeof matcher === "function") {
				return (message: unknown): boolean => {
					const msg = message as { type: string; payload: unknown };
					return matcher(msg.type, msg.payload);
				};
			}

			return (message: unknown): boolean => {
				const msg = message as { type: string };
				return msg.type === matcher;
			};
		}

		// Fallback: simple string matching
		return (message: unknown): boolean => {
			const msg = message as { type: string };
			return msg.type === messageType;
		};
	}

	// =========================================================================
	// Protocol Operations
	// =========================================================================

	async forwardRequest(messageType: string, data?: P["$request"]): Promise<P["$response"]> {
		if (!this.isProxy) {
			throw new Error(`Server ${this.name} is not in proxy mode`);
		}

		if (!this._clientAdapter) {
			throw new Error(`Server ${this.name} is not started or has no client adapter`);
		}

		return this._clientAdapter.request(messageType, data);
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._serverAdapter = await this.protocol.createServer({
			listenAddress: this._listenAddress,
			tls: this._tls,
		});

		this._serverAdapter.onRequest((messageType, request) => this.handleIncomingRequest(messageType, request));

		if (this._targetAddress) {
			this._clientAdapter = await this.protocol.createClient({
				targetAddress: this._targetAddress,
				tls: this._tls,
			});
		}
	}

	protected async doStop(): Promise<void> {
		if (this._serverAdapter) {
			await this._serverAdapter.stop();
			this._serverAdapter = undefined;
		}

		if (this._clientAdapter) {
			await this._clientAdapter.close();
			this._clientAdapter = undefined;
		}

		this.clearHooks();
	}
}
