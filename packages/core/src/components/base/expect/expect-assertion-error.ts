/**
 * ExpectAssertionError
 *
 * Thrown by matchers when an expectation fails. Extends plain Error so
 * the class is independent of any future AssertionFailedError from task
 * 032. The constructor builds a fully self-formatted .message containing
 * the source link, Expected/Received block, and optional Diff so the
 * error is meaningful as soon as it propagates up.
 */

import { formatExpectFailure } from "./format";
import type { SourceFrame } from "./source-frame";

export interface ExpectAssertionErrorParams {
	operator: string;
	expected: unknown;
	actual: unknown;
	diff?: string;
	sourceLocation?: SourceFrame;
	description?: string;
}

export class ExpectAssertionError extends Error {
	readonly operator: string;
	readonly expected: unknown;
	readonly actual: unknown;
	readonly diff?: string;
	readonly sourceLocation?: SourceFrame;
	readonly description?: string;

	constructor(params: ExpectAssertionErrorParams) {
		super(formatExpectFailure(params));
		this.name = "ExpectAssertionError";
		this.operator = params.operator;
		this.expected = params.expected;
		this.actual = params.actual;
		this.diff = params.diff;
		this.sourceLocation = params.sourceLocation;
		this.description = params.description;
	}
}
