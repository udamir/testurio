/**
 * Core Utilities
 */

/**
 * Generate unique ID with optional prefix
 */
export function generateId(prefix = ""): string {
	return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Deferred promise - a promise with externally accessible resolve/reject
 */
export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
}

/**
 * Create a deferred promise
 */
export function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void;
	let reject: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve: resolve!, reject: reject! };
}
