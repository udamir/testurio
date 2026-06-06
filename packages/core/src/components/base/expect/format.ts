import { safeStringify } from "./safe-stringify";
import { formatSourceFrame, type SourceFrame } from "./source-frame";

export interface FormatExpectFailureParams {
	operator: string;
	expected: unknown;
	actual: unknown;
	diff?: string;
	sourceLocation?: SourceFrame;
	description?: string;
}

export function formatExpectFailure(p: FormatExpectFailureParams): string {
	const lines: string[] = [];
	lines.push(p.description ? `Assertion failed: ${p.description}` : "Assertion failed");
	if (p.sourceLocation) {
		lines.push(`  at ${formatSourceFrame(p.sourceLocation)}`);
	}
	lines.push("");
	lines.push(`  Expected: ${safeStringify(p.expected, { maxBytes: 1024 })}`);
	lines.push(`  Received: ${safeStringify(p.actual, { maxBytes: 1024 })}`);
	if (p.diff) {
		lines.push("");
		lines.push("  Diff:");
		lines.push(p.diff);
	}
	return lines.join("\n");
}
