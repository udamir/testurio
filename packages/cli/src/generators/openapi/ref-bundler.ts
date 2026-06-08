import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "api-ref-bundler";
import YAML from "yaml";
import type { OpenApiSpec } from "./operations-map.js";

/**
 * Bundle an OpenAPI spec, resolving all external $ref references into a single
 * self-contained document. Specs without external refs pass through unchanged.
 */
export async function bundleOpenApiSpec(specPath: string): Promise<OpenApiSpec> {
	const resolvedPath = path.resolve(specPath);
	const specDir = path.dirname(resolvedPath);

	const resolver = async (sourcePath: string): Promise<object> => {
		const filePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(specDir, sourcePath);

		const content = await readFile(filePath, "utf-8");
		return parseSpecContent(content, filePath);
	};

	try {
		const bundled: OpenApiSpec = await bundle(resolvedPath, resolver);
		return bundled;
	} catch (err) {
		// Parse errors thrown by `parseSpecContent` are already file-tagged — pass through.
		if (err instanceof Error && err.message.startsWith("Failed to parse ")) {
			throw err;
		}
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to bundle OpenAPI spec.\n  Input: ${specPath}\n  ${detail}`);
	}
}

/**
 * Read and parse an OpenAPI spec file (YAML or JSON).
 */
export async function readOpenApiSpec(specPath: string): Promise<OpenApiSpec> {
	const content = await readFile(specPath, "utf-8");
	return parseSpecContent(content, specPath);
}

function parseSpecContent(content: string, filePath: string): OpenApiSpec {
	const ext = path.extname(filePath).toLowerCase();
	try {
		if (ext === ".json") {
			return JSON.parse(content);
		}
		// YAML for .yaml, .yml, or anything else
		return YAML.parse(content);
	} catch (err) {
		throw new Error(formatParseError(err, filePath, content, ext));
	}
}

function formatParseError(err: unknown, filePath: string, content: string, ext: string): string {
	const lang = ext === ".json" ? "JSON" : "YAML";
	const baseMsg = err instanceof Error ? err.message : String(err);
	const loc = locateError(err, content);
	const where = loc ? `:${loc.line}:${loc.col}` : "";
	return `Failed to parse ${lang} at ${filePath}${where}\n  ${baseMsg}`;
}

interface YamlErrorLike {
	linePos?: Array<{ line: number; col: number }>;
}

function locateError(err: unknown, content: string): { line: number; col: number } | null {
	// `yaml` library: errors expose `linePos` with line/col entries.
	if (typeof err === "object" && err !== null) {
		const yamlPos = (err as YamlErrorLike).linePos?.[0];
		if (yamlPos) return { line: yamlPos.line, col: yamlPos.col };
	}

	// JSON.parse: "Unexpected token … in JSON at position N"
	if (err instanceof SyntaxError) {
		const m = /position (\d+)/.exec(err.message);
		if (m) return offsetToLineCol(content, Number(m[1]));
	}
	return null;
}

function offsetToLineCol(content: string, offset: number): { line: number; col: number } {
	let line = 1;
	let col = 1;
	for (let i = 0; i < offset && i < content.length; i++) {
		if (content[i] === "\n") {
			line++;
			col = 1;
		} else {
			col++;
		}
	}
	return { line, col };
}
