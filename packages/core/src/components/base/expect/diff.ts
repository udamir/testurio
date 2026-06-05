/**
 * renderDiff (zero-dep, ANSI-colored, multi-line pretty-printed)
 *
 * Produces a human-readable structural diff between two values. Used by
 * collection matchers (toEqual / toStrictEqual / toMatchObject) to populate
 * the Diff: block in the failure message.
 *
 * ANSI codes are always emitted (per design Q5 2026-06-04). Reporters
 * that don't render ANSI can strip via `replace(/\x1b\[\d+m/g, "")`.
 *
 * Depth capped at MAX_DEPTH; beyond emits dimmed "…".
 * Whole-diff cap of 4 KB so a pathological structure can't blow up the
 * failure message.
 */

import { isDeepEqual } from "./deep-equal";
import { safeStringify, safeStringifyMultiline } from "./safe-stringify";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const INDENT = "  ";
const MAX_DEPTH = 6;
const MAX_LEAF_BYTES = 256;
const MAX_DIFF_BYTES = 4096;

export function renderDiff(expected: unknown, actual: unknown): string {
	let out: string;
	if (!isStructured(expected) || !isStructured(actual)) {
		out = [`  ${RED}- ${prettyValue(expected, 1)}${RESET}`, `  ${GREEN}+ ${prettyValue(actual, 1)}${RESET}`].join("\n");
	} else {
		const lines: string[] = [];
		walkDiff(expected, actual, 0, lines);
		out = lines.length === 0 ? `${DIM}(values are equal? unexpected diff path)${RESET}` : lines.join("\n");
	}
	if (Buffer.byteLength(out, "utf8") > MAX_DIFF_BYTES) {
		return `${out.slice(0, MAX_DIFF_BYTES)}\n${DIM}... (diff truncated)${RESET}`;
	}
	return out;
}

function walkDiff(e: unknown, a: unknown, depth: number, lines: string[]): void {
	const pad = INDENT.repeat(depth + 1);

	if (depth >= MAX_DEPTH) {
		lines.push(`${pad}${DIM}…${RESET}`);
		return;
	}

	if (Array.isArray(e) && Array.isArray(a)) {
		lines.push(`${pad}[`);
		const len = Math.max(e.length, a.length);
		for (let i = 0; i < len; i++) {
			const ev = e[i];
			const av = a[i];
			if (isDeepEqual(ev, av, { strict: false })) {
				lines.push(`${pad}${INDENT}${DIM}[${i}]: (equal)${RESET}`);
			} else if (isStructured(ev) && isStructured(av)) {
				lines.push(`${pad}${INDENT}[${i}]:`);
				walkDiff(ev, av, depth + 1, lines);
			} else {
				lines.push(`${pad}${INDENT}${RED}- [${i}]: ${prettyValue(ev, depth + 1)}${RESET}`);
				lines.push(`${pad}${INDENT}${GREEN}+ [${i}]: ${prettyValue(av, depth + 1)}${RESET}`);
			}
		}
		lines.push(`${pad}]`);
		return;
	}

	if (isPlainObject(e) && isPlainObject(a)) {
		lines.push(`${pad}{`);
		const keys = Array.from(new Set([...Object.keys(e), ...Object.keys(a)]));
		for (const k of keys) {
			const ev = e[k];
			const av = a[k];
			if (isDeepEqual(ev, av, { strict: false })) {
				lines.push(`${pad}${INDENT}${DIM}${k}: (equal)${RESET}`);
			} else if (isStructured(ev) && isStructured(av)) {
				lines.push(`${pad}${INDENT}${k}:`);
				walkDiff(ev, av, depth + 1, lines);
			} else {
				lines.push(`${pad}${INDENT}${RED}- ${k}: ${prettyValue(ev, depth + 1)}${RESET}`);
				lines.push(`${pad}${INDENT}${GREEN}+ ${k}: ${prettyValue(av, depth + 1)}${RESET}`);
			}
		}
		lines.push(`${pad}}`);
		return;
	}

	// Type mismatch between structured/unstructured at this level — emit leaf form.
	lines.push(`${pad}${RED}- ${prettyValue(e, depth + 1)}${RESET}`);
	lines.push(`${pad}${GREEN}+ ${prettyValue(a, depth + 1)}${RESET}`);
}

function isStructured(v: unknown): v is object {
	return (
		typeof v === "object" &&
		v !== null &&
		!(v instanceof Date) &&
		!(v instanceof RegExp) &&
		!(v instanceof Map) &&
		!(v instanceof Set) &&
		!(v instanceof Error)
	);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return isStructured(v) && !Array.isArray(v);
}

function prettyValue(v: unknown, depth: number): string {
	if (v === null || typeof v !== "object") {
		return safeStringify(v, { maxBytes: MAX_LEAF_BYTES });
	}
	const oneLine = safeStringify(v, { maxBytes: MAX_LEAF_BYTES });
	if (oneLine.length <= 60) return oneLine;
	return safeStringifyMultiline(v, depth, MAX_DEPTH, MAX_LEAF_BYTES);
}
