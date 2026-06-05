/**
 * Safe Stringify (zero-dep)
 *
 * Self-contained for task 033 — owns its own copy so the expect API is
 * independent of any future shared assertion utilities. When task 032
 * lands, a follow-up composition task can dedupe.
 */

export interface SafeStringifyOpts {
	maxBytes: number;
}

export function safeStringify(value: unknown, opts: SafeStringifyOpts): string {
	if (value === undefined) return "undefined";
	const seen = new WeakSet<object>();
	// JSON.stringify invokes `toJSON()` (Date has one) BEFORE calling the replacer,
	// so we look up the raw value from `this[key]` to detect Date/Map/Set/Error
	// instances reliably.
	function replacer(this: unknown, key: string, val: unknown): unknown {
		const raw = key === "" ? value : (this as Record<string, unknown>)[key];
		if (typeof raw === "bigint") return `${raw.toString()}n`;
		if (typeof raw === "function") {
			const fn = raw as { name?: string };
			return `[Function${fn.name ? `: ${fn.name}` : ""}]`;
		}
		if (raw instanceof Map) return { __type: "Map", entries: Array.from(raw.entries()) };
		if (raw instanceof Set) return { __type: "Set", values: Array.from(raw.values()) };
		if (raw instanceof Date) return { __type: "Date", iso: raw.toISOString() };
		if (raw instanceof Error) return { __type: "Error", name: raw.name, message: raw.message };
		if (typeof val === "object" && val !== null) {
			if (seen.has(val)) return "[Circular]";
			seen.add(val);
		}
		return val;
	}
	let out: string | undefined;
	try {
		out = JSON.stringify(value, replacer, 2);
	} catch {
		out = String(value);
	}
	if (out === undefined) out = String(value);

	const bytes = Buffer.byteLength(out, "utf8");
	if (bytes > opts.maxBytes) {
		return `${out.slice(0, opts.maxBytes)}\n... (truncated, original ${bytes} bytes)`;
	}
	return out;
}

/**
 * Indented multi-line variant used by the diff renderer for nested objects.
 *
 * - Scalars and small (one-line ≤ 60 chars) structures fall back to safeStringify.
 * - Larger structures expand to indented multi-line form.
 * - Depth capped at maxDepth — emits "…" beyond.
 * - Circular refs emit "[Circular]".
 */
export function safeStringifyMultiline(value: unknown, depth: number, maxDepth: number, maxLeafBytes: number): string {
	const seen = new WeakSet<object>();
	return walk(value, depth, seen);

	function walk(v: unknown, d: number, s: WeakSet<object>): string {
		if (v === null || typeof v !== "object") {
			return safeStringify(v, { maxBytes: maxLeafBytes });
		}
		if (v instanceof Date || v instanceof RegExp || v instanceof Map || v instanceof Set || v instanceof Error) {
			return safeStringify(v, { maxBytes: maxLeafBytes });
		}
		if (s.has(v)) return '"[Circular]"';
		if (d >= maxDepth) return '"…"';

		// Try one-line form first.
		const oneLine = safeStringify(v, { maxBytes: maxLeafBytes });
		if (oneLine.length <= 60) return oneLine;

		s.add(v);
		const indent = "  ".repeat(d + 1);
		const closeIndent = "  ".repeat(d);

		if (Array.isArray(v)) {
			if (v.length === 0) return "[]";
			const lines = v.map((item) => `${indent}${walk(item, d + 1, s)}`);
			return `[\n${lines.join(",\n")}\n${closeIndent}]`;
		}
		const entries = Object.entries(v as Record<string, unknown>);
		if (entries.length === 0) return "{}";
		const lines = entries.map(([k, val]) => `${indent}${JSON.stringify(k)}: ${walk(val, d + 1, s)}`);
		return `{\n${lines.join(",\n")}\n${closeIndent}}`;
	}
}
