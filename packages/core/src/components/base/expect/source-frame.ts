/**
 * Source Frame Capture (zero-dep, V8 stack)
 *
 * Self-contained for task 033 — owns its own copy so the expect API is
 * independent of any future shared assertion utilities. When task 032
 * lands, a follow-up composition task can dedupe.
 */

export interface SourceFrame {
	file: string;
	line: number;
	column: number;
	function?: string;
}

const FRAME_PAREN = /^\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)\s*$/;
const FRAME_PLAIN = /^\s*at\s+(.+):(\d+):(\d+)\s*$/;
const TESTURIO_RX =
	/(?:[\\/]packages[\\/]core[\\/]src[\\/])|(?:[\\/]node_modules[\\/]testurio[\\/])|(?:[\\/]node_modules[\\/]@testurio[\\/])/;
const NODE_INTERNAL_RX = /^(?:node:|internal[\\/])/;

export function captureSourceFrame(skipFn?: (...args: never) => unknown, errStack?: string): SourceFrame | undefined {
	let stack = errStack;
	if (!stack) {
		const stub: { stack?: string } = {};
		Error.captureStackTrace(stub, skipFn ?? captureSourceFrame);
		stack = stub.stack;
	}
	if (!stack) return undefined;

	for (const rawLine of stack.split("\n")) {
		const parsed = parseFrameLine(rawLine);
		if (!parsed) continue;
		if (isInternalFrame(parsed.file)) continue;
		return parsed;
	}
	return undefined;
}

function parseFrameLine(line: string): SourceFrame | undefined {
	const m1 = FRAME_PAREN.exec(line);
	if (m1) return { function: m1[1], file: m1[2], line: Number(m1[3]), column: Number(m1[4]) };
	const m2 = FRAME_PLAIN.exec(line);
	if (m2) return { file: m2[1], line: Number(m2[2]), column: Number(m2[3]) };
	return undefined;
}

function isInternalFrame(file: string): boolean {
	return TESTURIO_RX.test(file) || NODE_INTERNAL_RX.test(file) || file === "<anonymous>";
}

export function formatSourceFrame(f: SourceFrame): string {
	const rel = relativizePath(f.file);
	return `${rel}:${f.line}:${f.column}`;
}

function relativizePath(file: string): string {
	try {
		const cwd = process.cwd();
		if (file.startsWith(`${cwd}/`)) return file.slice(cwd.length + 1);
	} catch {
		/* fall through */
	}
	return file;
}
