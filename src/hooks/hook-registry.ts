/**
 * Hook Registry
 *
 * Manages hook registration, lookup, and execution.
 */

import type {
	Hook,
	HookExecutionResult,
	HookMatchResult,
	Message,
} from "../types";
import { DropMessageError, HookError } from "../types";
import { calculateHookScore, matchHook } from "./message-matcher";

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
	 * Find all hooks matching a message
	 */
	findMatchingHooks(message: Message): HookMatchResult[] {
		const matches: HookMatchResult[] = [];

		for (const hook of this.hooks) {
			if (matchHook(hook, message)) {
				matches.push({
					hook,
					message,
					score: calculateHookScore(hook),
				});
			}
		}

		// Sort by score (highest first) for prioritization
		return matches.sort((a, b) => b.score - a.score);
	}

	/**
	 * Execute all matching hooks for a message
	 * Returns transformed message or null if dropped
	 */
	async executeHooks(message: Message): Promise<Message | null> {
		const matches = this.findMatchingHooks(message);

		if (matches.length === 0) {
			// No hooks matched - return original message
			return message;
		}

		let currentMessage = message;
		const executionResults: HookExecutionResult[] = [];

		// Execute all matching hooks in order
		for (const match of matches) {
			try {
				const result = await this.executeHook(match.hook, currentMessage);
				executionResults.push(result);

				if (result.transformedMessage === null) {
					// Message was dropped
					return null;
				}

				currentMessage = result.transformedMessage;
			} catch (error) {
				if (error instanceof DropMessageError) {
					// Message intentionally dropped
					return null;
				}

				// Hook execution failed
				throw new HookError(
					`Hook execution failed: ${match.hook.id}`,
					match.hook.id,
					error as Error,
				);
			}
		}

		return currentMessage;
	}

	/**
	 * Execute a single hook (all handlers in chain)
	 */
	private async executeHook(
		hook: Hook,
		message: Message,
	): Promise<HookExecutionResult> {
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
				error: error as Error,
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
