/**
 * Service Component - Base class for protocol-based components.
 */

import type { IBaseProtocol } from "../../protocols/base";
import { BaseComponent } from "./base.component";
import type { PayloadMatcher } from "./base.types";
import { createMessageMatcher } from "./base.utils";
import type { Hook } from "./hook.types";
import type { Step } from "./step.types";

export abstract class ServiceComponent<
	P extends IBaseProtocol = IBaseProtocol,
	TStepBuilder = unknown,
> extends BaseComponent<TStepBuilder> {
	readonly protocol: P;

	constructor(name: string, protocol: P) {
		super(name);
		this.protocol = protocol;
	}

	// =========================================================================
	// Hook Utilities
	// =========================================================================

	protected findAllMatchingHooks(message: unknown): Hook[] {
		const matching: Hook[] = [];
		for (const hook of this.hooks) {
			try {
				if (hook.isMatch(message)) {
					matching.push(hook);
				}
			} catch {
				// Matcher error = no match
			}
		}
		return matching;
	}

	// =========================================================================
	// Hook Matching
	// =========================================================================

	/**
	 * Default hook matcher using messageType and optional payload matcher.
	 * Override in subclasses for component-specific matching logic.
	 */
	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		const params = step.params as {
			messageType?: string;
			traceId?: string;
			matcher?: PayloadMatcher | ((payload: unknown) => boolean);
		};

		const messageType = params.messageType ?? "";

		let payloadMatcher: PayloadMatcher | undefined;
		if (params.traceId) {
			payloadMatcher = { type: "traceId", value: params.traceId };
		} else if (params.matcher) {
			if (typeof params.matcher === "function") {
				payloadMatcher = { type: "function", fn: params.matcher };
			} else {
				payloadMatcher = params.matcher;
			}
		}

		return createMessageMatcher(messageType, payloadMatcher) as (message: unknown) => boolean;
	}
}
