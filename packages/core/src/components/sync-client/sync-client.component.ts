/**
 * Client Component - Sync client for request/response protocols (HTTP, gRPC unary).
 *
 * Response handling modes:
 * - onResponse (non-strict): Works regardless of timing
 * - waitResponse (strict): Error if response arrives before step starts
 */

import type { Address, ISyncClientAdapter, ISyncProtocol, TlsConfig } from "../../protocols/base";
import type { ITestCaseContext } from "../base/base.types";
import type { Hook } from "../base/hook.types";
import { ServiceComponent } from "../base/service.component";
import type { Handler, Step } from "../base/step.types";
import { SyncClientStepBuilder } from "./sync-client.step-builder";

interface ResponseMessage {
	type: string;
	payload: unknown;
}

export interface ClientOptions<P extends ISyncProtocol = ISyncProtocol> {
	protocol: P;
	targetAddress: Address;
	tls?: TlsConfig;
}

export class Client<P extends ISyncProtocol = ISyncProtocol> extends ServiceComponent<P, SyncClientStepBuilder<P>> {
	private readonly _targetAddress: Address;
	private readonly _tls?: TlsConfig;
	private _clientAdapter?: ISyncClientAdapter;

	constructor(name: string, options: ClientOptions<P>) {
		super(name, options.protocol);
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	static create<P extends ISyncProtocol>(name: string, options: ClientOptions<P>): Client<P> {
		return new Client<P>(name, options);
	}

	createStepBuilder(context: ITestCaseContext): SyncClientStepBuilder<P> {
		return new SyncClientStepBuilder<P>(context, this);
	}

	get targetAddress(): Address {
		return this._targetAddress;
	}

	// =========================================================================
	// Hook Registration
	// =========================================================================

	async registerHook(step: Step): Promise<Hook> {
		const withPending = step.type === "onResponse" || step.type === "waitResponse";
		return super.registerHook(step, withPending);
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "request":
				await this.executeRequest(step);
				break;
			case "onResponse":
			case "waitResponse":
				await this.executeResponseStep(step);
				break;
			default:
				throw new Error(`Unknown step type: ${step.type} for Client ${this.name}`);
		}
	}

	private async executeRequest(step: Step): Promise<void> {
		const params = step.params as {
			messageType: string;
			data?: P["$request"];
		};

		// Find matching response hooks (already registered with pending in Phase 1)
		const preMatchMessage: ResponseMessage = { type: params.messageType, payload: undefined };
		const matchingHooks = this.findAllMatchingHooks(preMatchMessage);

		// Start request (don't await)
		const requestPromise = this.request(params.messageType, params.data);

		// Resolve hooks when response arrives
		for (const hook of matchingHooks) {
			if (!hook.step) continue;

			requestPromise
				.then((response) => {
					this.resolveHook(hook, response);
				})
				.catch((error) => {
					this.rejectHook(hook, error instanceof Error ? error : new Error(String(error)));
				});
		}
	}

	private async executeResponseStep(step: Step): Promise<void> {
		const params = step.params as {
			messageType: string;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(
				`No matching request for ${step.type}: ${params.messageType}. ` +
					`Make sure request() is called before ${step.type}().`
			);
		}

		// Strict ordering check for waitResponse
		if (step.type === "waitResponse" && hook.resolved) {
			throw new Error(
				`Strict ordering violation: Response arrived before waitResponse started. ` +
					`Step: ${step.id}, messageType: ${params.messageType}. ` +
					`Use onResponse() if ordering doesn't matter.`
			);
		}

		try {
			const response = await this.awaitHook(hook, timeout);
			await this.executeHandlers(step, response);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	// =========================================================================
	// Hook Matching
	// =========================================================================

	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		if (step.type !== "onResponse" && step.type !== "waitResponse") {
			return () => false;
		}

		const params = step.params as { messageType: string };

		return (message: unknown): boolean => {
			const msg = message as ResponseMessage;
			return msg.type === params.messageType;
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

			default:
				return undefined;
		}
	}

	// =========================================================================
	// Protocol Operations
	// =========================================================================

	async request(messageType: string, data?: P["$request"]): Promise<P["$response"]> {
		if (!this.isStarted()) {
			throw new Error(`Client ${this.name} is not started`);
		}

		if (!this._clientAdapter) {
			throw new Error(`Client ${this.name} has no client adapter`);
		}

		return this._clientAdapter.request(messageType, data);
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._clientAdapter = await this.protocol.createClient({
			targetAddress: this._targetAddress,
			tls: this._tls,
		});
	}

	protected async doStop(): Promise<void> {
		if (this._clientAdapter) {
			await this._clientAdapter.close();
			this._clientAdapter = undefined;
		}
		this.clearHooks();
	}
}
