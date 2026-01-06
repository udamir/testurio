/**
 * Hook Registry
 *
 * Manages hook registration, lookup, and execution.
 */

import type { Message } from "../../protocols/base";
import type { Hook, HookExecutionResult } from "./base.types";
import { DropMessageError, HookError } from "./base.types";
import { matchHook } from "./message-matcher";

/**
 * Hook Registry - manages all registered hooks
 *
 * Each component owns its own HookRegistry for isolation.
 * No componentName filtering needed since hooks are already scoped to the component.
 */
export class HookRegistry {
	private hooks: Hook[] = [];

	/**
	 * Register one or more hooks
	 */
	registerHooks(hooks: Hook[]): void {
		for (const hook of hooks) {
			this.hooks.push(hook);
		}
	}

	/**
	 * Register a single hook
	 */
	registerHook(hook: Hook): void {
		this.registerHooks([hook]);
	}

	/**
	 * Execute all matching hooks for a message
	 * Returns transformed message or null if dropped
	 */
	async executeHooks<T, R = T>(message: Message<T>): Promise<Message<T | R> | null> {
		const matchingHooks = (this.hooks as Hook<T>[]).filter((hook) => matchHook(hook, message));

		if (matchingHooks.length === 0) {
			return message;
		}

		let currentMessage = message;

		for (const hook of matchingHooks) {
			try {
				const result = await this.executeHook(hook, currentMessage);

				if (result.transformedMessage === null) {
					return null;
				}

				currentMessage = result.transformedMessage;
			} catch (error) {
				if (error instanceof DropMessageError) {
					return null;
				}

				throw new HookError(
					`Hook execution failed: ${hook.id}`,
					hook.id,
					error instanceof Error ? error : new Error(String(error))
				);
			}
		}

		return currentMessage;
	}

	/**
	 * Execute a single hook (all handlers in chain)
	 */
	private async executeHook<T>(hook: Hook<T>, message: Message<T>): Promise<HookExecutionResult<T>> {
		const startTime = Date.now();
		let currentMessage = message;

		try {
			// Execute each handler in the chain
			for (const handler of hook.handlers) {
				currentMessage = await handler.execute(currentMessage);
			}

			return {
				hook,
				success: true,
				originalMessage: message,
				transformedMessage: currentMessage,
				duration: Date.now() - startTime,
			};
		} catch (error) {
			if (error instanceof DropMessageError) {
				// Message dropped - not an error
				return {
					hook,
					success: true,
					originalMessage: message,
					transformedMessage: null,
					duration: Date.now() - startTime,
				};
			}

			// Handler execution failed
			return {
				hook,
				success: false,
				originalMessage: message,
				transformedMessage: null,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Clear all non-persistent hooks (test-case level)
	 */
	clearTestCaseHooks(): void {
		// Remove non-persistent hooks
		this.hooks = this.hooks.filter((hook) => hook.persistent);
	}

	/**
	 * Get all registered hooks
	 */
	getAllHooks(): Hook[] {
		return [...this.hooks];
	}

	/**
	 * Get hook by ID
	 */
	getHookById(id: string): Hook | undefined {
		return this.hooks.find((hook) => hook.id === id);
	}

	/**
	 * Check if a hook with the given ID exists
	 */
	hasHook(id: string): boolean {
		return this.hooks.some((hook) => hook.id === id);
	}

	/**
	 * Unregister a hook by ID
	 */
	unregisterHook(id: string): boolean {
		const index = this.hooks.findIndex((hook) => hook.id === id);
		if (index === -1) {
			return false;
		}

		this.hooks.splice(index, 1);
		return true;
	}

	/**
	 * Clear all registered hooks
	 */
	clear(): void {
		this.hooks = [];
	}
}
