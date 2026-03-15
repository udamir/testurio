import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenApiSource } from "../../config/schema.js";

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
export async function generateZodSchemas(bundledSpec: object, source: OpenApiSource): Promise<OrvalResult> {
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
		} catch {
			throw new Error(
				`Failed to generate Zod schemas from OpenAPI spec.\n` +
					`  Input: ${source.input}\n` +
					`  Verify the file is a valid OpenAPI 3.x specification.`
			);
		} finally {
			process.stdout.write = origStdoutWrite;
			process.stderr.write = origStderrWrite;
		}

		// Check output exists (Orval may silently fail without throwing)
		if (!existsSync(tempOutputPath)) {
			throw new Error(
				`Schema generation produced no output.\n` +
					`  Input: ${source.input}\n` +
					`  The OpenAPI spec may be invalid or unsupported.`
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

		// Extract all exported const names
		const exportedNames = new Set<string>();
		const regex = /export const (\w+)\s*=/g;
		let match = regex.exec(schemasContent);
		while (match) {
			exportedNames.add(match[1]);
			match = regex.exec(schemasContent);
		}

		return { schemasContent, exportedNames };
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
