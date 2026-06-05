/**
 * Testurio-native expect API
 *
 * Self-contained. Zero external test-framework dependencies. Zero dependency
 * on task 032 (assert-source-location). The matcher set throws
 * ExpectAssertionError on failure; the error's .message is self-formatted
 * with Expected/Received/Diff/source-link and propagates up through the
 * predicate to the step executor.
 */

export type {
	ArrayExpectation,
	Expectation,
	NegatedExpectation,
	NumericExpectation,
	ObjectExpectation,
	StringExpectation,
} from "./expect";
export { expect } from "./expect";
export type { ExpectAssertionErrorParams } from "./expect-assertion-error";
export { ExpectAssertionError } from "./expect-assertion-error";
