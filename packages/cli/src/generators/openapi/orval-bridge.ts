import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenApiSource } from "../../config/schema.js";
import type { Logger } from "../types.js";

export interface OrvalResult {
	/** The generated Zod schema code, normalized to use `z` import */
	schemasContent: string;
	/** All exported const names found in the output */
	exportedNames: Set<string>;
}

/**
 * Invoke Orval's programmatic API to generate Zod schemas from an OpenAPI spec.
 * The spec should be pre-bundled (no external $ref).
 */
export async function generateZodSchemas(
	bundledSpec: object,
	source: OpenApiSource,
	logger?: Logger
): Promise<OrvalResult> {
	const { generate } = await import("orval");

	// Write bundled spec to temp file (Orval reads from disk)
	const tempDir = await mkdtemp(path.join(tmpdir(), "testurio-orval-"));
	const tempSpecPath = path.join(tempDir, "spec.json");
	const tempOutputPath = path.join(tempDir, "generated.ts");

	try {
		await writeFile(tempSpecPath, JSON.stringify(bundledSpec), "utf-8");

		// Suppress ALL Orval console output (it leaks internal details, emoji, and branding).
		// Orval caches `console.log` at module load (`const log = console.log`), so reassigning
		// console methods is insufficient. We suppress at the process stream level instead.
		const origStdoutWrite = process.stdout.write;
		const origStderrWrite = process.stderr.write;
		process.stdout.write = () => true;
		process.stderr.write = () => true;
		try {
			await generate({
				input: {
					target: tempSpecPath,
				},
				output: {
					target: tempOutputPath,
					client: "zod",
					mode: "single",
					// Note: we intentionally do NOT set `biome: true` here. Orval invokes
					// biome via `execa("biome", ...)` with the parent process's cwd; biome
					// then walks up from that cwd, finds the project's biome.json with its
					// `files.includes` filter, and silently skips the temp-file path —
					// resulting in no formatting at all. We format ourselves below with a
					// controlled cwd so biome uses defaults.
					override: {
						zod: {
							strict: source.options?.zod?.strict,
							coerce: source.options?.zod?.coerce,
							generate: {
								body: true,
								response: true,
								query: true,
								param: true,
								header: true,
							},
						},
					},
				},
			});
		} catch (err) {
			logger?.debug(`Orval error object: ${stringifyError(err)}`);
			const detail = extractOrvalErrorDetail(err);
			throw new Error(
				`Orval failed to generate Zod schemas from OpenAPI spec.\n` +
					`  Input: ${source.input}\n` +
					`  ${detail}\n\n` +
					`  This usually indicates a schema shape Orval cannot handle. ` +
					`Run \`testurio generate --verbose\` for the full stack.`
			);
		} finally {
			process.stdout.write = origStdoutWrite;
			process.stderr.write = origStderrWrite;
		}

		// Check output exists (Orval may silently fail without throwing).
		// In the normal flow this branch is unreachable — validation runs before
		// Orval — but we keep it as a defensive guard for cases where Orval
		// silently produces no file for a spec that the validator accepted.
		if (!existsSync(tempOutputPath)) {
			throw new Error(
				`Orval produced no output for a spec that passed validation.\n` +
					`  Input: ${source.input}\n` +
					`  This is likely a bug — please open an issue with the spec attached.`
			);
		}

		// Read and normalize the generated output
		let schemasContent = await readFile(tempOutputPath, "utf-8");

		// Orval uses `import { z as zod } from 'zod'` or similar patterns.
		// Normalize to use `z` consistently:
		// 1. Remove Orval's import line (we add our own)
		schemasContent = schemasContent.replace(/^import\s.*?from\s+['"]zod['"];?\s*\n?/gm, "").trim();

		// 2. Replace `zod.` with `z.` throughout
		schemasContent = schemasContent.replace(/\bzod\./g, "z.");

		// 3. Lowercase the first letter of every `export const Xxx` and rewrite
		//    internal references with word-boundary-safe replace. Orval v8.5.3 always
		//    PascalCases the first letter of its exports; downstream lookups
		//    (`findOrval*Name` / `orvalName(opId, suffix)`) use the verbatim
		//    (lowercase-first) operationId, so without this step every body/query/
		//    response slot falls back to `z.never()` / `z.unknown()`.
		const renamed = lowercaseFirstLetterOfExports(schemasContent);
		schemasContent = renamed.content;

		// 4. Format with biome if available. Without this Orval leaves nested
		//    z.object children at the parent's indent column (syntactically valid
		//    but visually broken). We run biome via stdin with cwd=tempDir so
		//    biome's config discovery walks /tmp upward, finds no biome.json, and
		//    falls back to defaults — bypassing the project's `files.includes`
		//    filter that would otherwise exclude the temp path.
		const biomePath = resolveBiomeBinary();
		if (biomePath) {
			try {
				schemasContent = await formatWithBiome(biomePath, schemasContent, tempDir);
			} catch (err) {
				logger?.debug(
					`Biome formatting failed; using unformatted output. ${err instanceof Error ? err.message : String(err)}`
				);
			}
		} else {
			logger?.debug("Biome binary not found; Orval output will not be formatted.");
		}

		return { schemasContent, exportedNames: renamed.names };
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

/**
 * Pipe `content` through `biome format --stdin-file-path=...` and return the
 * formatted result. Runs with `cwd=tempCwd` to avoid biome auto-discovering the
 * project's biome.json (whose `files.includes` would skip out-of-project paths).
 * Resolves to the original content if biome exits non-zero or emits empty output.
 */
async function formatWithBiome(biomePath: string, content: string, tempCwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			biomePath,
			["format", "--stdin-file-path=generated.ts", "--indent-style=space", "--indent-width=2", "--line-width=120"],
			{ cwd: tempCwd }
		);

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
		child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
				reject(new Error(`biome exited with code ${code}: ${stderr}`));
				return;
			}
			const out = Buffer.concat(stdoutChunks).toString("utf-8");
			resolve(out.length > 0 ? out : content);
		});

		child.stdin.end(content);
	});
}

/**
 * Lowercase the first letter of every top-level `export const Xxx` and rewrite
 * all internal references with a single word-boundary-safe regex pass.
 *
 * - Sorts renames longest-name-first so a shorter name cannot corrupt a longer
 *   name that contains it as a prefix (word boundaries already protect this,
 *   but ordering keeps the pass deterministic regardless of regex flavour).
 * - Throws if lowercasing would collide with an existing already-lowercase
 *   export name — unreachable for normal Orval output but defended.
 */
function lowercaseFirstLetterOfExports(content: string): { content: string; names: Set<string> } {
	const exportRegex = /export const (\w+)/g;
	const renameMap = new Map<string, string>();
	const finalNames = new Set<string>();
	const allOriginalExports = new Set<string>();

	let match = exportRegex.exec(content);
	while (match) {
		allOriginalExports.add(match[1]);
		match = exportRegex.exec(content);
	}

	for (const original of allOriginalExports) {
		const renamed = original.charAt(0).toLowerCase() + original.slice(1);
		if (renamed !== original && allOriginalExports.has(renamed)) {
			throw new Error(
				`Orval export rename collision: '${original}' would become '${renamed}' but that name is already used. ` +
					`Add an explicit operationId to disambiguate.`
			);
		}
		finalNames.add(renamed);
		if (renamed !== original) {
			renameMap.set(original, renamed);
		}
	}

	if (renameMap.size === 0) {
		return { content, names: finalNames };
	}

	const sortedOldNames = [...renameMap.keys()].sort((a, b) => b.length - a.length);
	const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`\\b(${sortedOldNames.map(escapeRegex).join("|")})\\b`, "g");
	const renamedContent = content.replace(pattern, (m) => renameMap.get(m) ?? m);

	return { content: renamedContent, names: finalNames };
}

let biomeBinaryCache: string | null | undefined;

/**
 * Resolve the path to the `biome` binary from `@biomejs/biome`'s package layout
 * (`bin/biome`). Returns the absolute path if resolvable, or null if the package
 * is not installed. Cached after first call.
 *
 * Uses `process.cwd()` as the resolution base so the lookup works whether the
 * CLI runs from a tsup-built CJS bundle or ESM bundle without relying on
 * `import.meta`.
 */
/**
 * Walk the `err.cause` chain and join each link's message with `caused by:`.
 * Orval often nests its real failure inside an outer error wrapper.
 */
function extractOrvalErrorDetail(err: unknown): string {
	if (err instanceof Error) {
		const chain: string[] = [err.message];
		let cur: unknown = err.cause;
		while (cur instanceof Error) {
			chain.push(cur.message);
			cur = cur.cause;
		}
		return chain.join("\n  caused by: ");
	}
	return String(err);
}

/**
 * Stringify a caught error for debug logging. JSON.stringify drops Error fields
 * (name/message/stack) and chokes on cycles, so we copy the visible fields and
 * fall back to `String(err)` if anything blows up.
 */
function stringifyError(err: unknown): string {
	if (err instanceof Error) {
		try {
			return JSON.stringify(
				{ name: err.name, message: err.message, stack: err.stack, cause: err.cause },
				replaceCircular()
			);
		} catch {
			return `${err.name}: ${err.message}`;
		}
	}
	try {
		return JSON.stringify(err);
	} catch {
		return String(err);
	}
}

function replaceCircular(): (key: string, value: unknown) => unknown {
	const seen = new WeakSet<object>();
	return (_key, value) => {
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) return "[Circular]";
			seen.add(value);
		}
		return value;
	};
}

function resolveBiomeBinary(): string | null {
	if (biomeBinaryCache !== undefined) return biomeBinaryCache;
	try {
		const req = createRequire(path.join(process.cwd(), "noop.js"));
		const pkgJsonPath = req.resolve("@biomejs/biome/package.json");
		const pkgDir = path.dirname(pkgJsonPath);
		const binPath = path.join(pkgDir, "bin", "biome");
		biomeBinaryCache = existsSync(binPath) ? binPath : null;
	} catch {
		biomeBinaryCache = null;
	}
	return biomeBinaryCache;
}
