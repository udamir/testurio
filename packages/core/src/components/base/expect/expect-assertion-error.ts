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
