import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenApiSource } from "../../config/schema.js";
import type { OpenApiSpec } from "./operations-map.js";

interface AjvErrorLike {
	instancePath?: string;
	dataPath?: string;
	message?: string;
}

interface ValidatorErrorLike {
	message?: string;
	details?: AjvErrorLike[];
}

/**
 * Validate a bundled OpenAPI spec. Throws an aggregated Error listing every
 * issue found. Returns silently when the spec is valid.
 *
 * swagger-parser's schema validator uses Ajv with `allErrors: true`, so a
 * single throw carries every Ajv error in `err.details`. We surface them as
 * a numbered, JSON-pointer-tagged list so the user can fix all issues in one
 * pass instead of fix-rerun-repeat.
 */
export async function validateOpenApiSpec(spec: OpenApiSpec, source: OpenApiSource): Promise<void> {
	try {
		// structuredClone: swagger-parser mutates its input during dereferencing.
		// The bundled spec is reused downstream (Orval, extractOperations), so we
		// must not let validator-side mutations leak.
		// resolve.external = false: external $refs were already inlined by
		// api-ref-bundler. Re-resolving would trigger fs/network IO and obscure
		// the real validation issue.
		await SwaggerParser.validate(structuredClone(spec) as never, {
			dereference: { circular: "ignore" },
			resolve: { external: false },
		});
	} catch (err) {
		throw new Error(formatValidationError(err, source));
	}
}

function formatValidationError(err: unknown, source: OpenApiSource): string {
	const issues = collectIssues(err);
	const header = `Invalid OpenAPI spec.\n  Input: ${source.input}`;
	const fallbackMsg = err instanceof Error ? err.message : String(err);

	if (issues.length === 0) {
		return `${header}\n\n  ${fallbackMsg}\n\n  Fix this and re-run.`;
	}
	if (issues.length === 1) {
		return `${header}\n\n  ${issues[0]}\n\n  Fix this and re-run.`;
	}
	const numbered = issues.map((i, idx) => `  ${idx + 1}. ${i}`).join("\n");
	return `${header}\n\n  Found ${issues.length} error(s):\n${numbered}\n\n  Fix these and re-run.`;
}

function collectIssues(err: unknown): string[] {
	if (!isValidatorErrorLike(err)) return [];

	if (Array.isArray(err.details) && err.details.length > 0) {
		return dedupe(err.details.filter(isUserFacingIssue).map(formatAjvIssue));
	}
	return err.message ? [err.message] : [];
}

/**
 * Drop noisy companion errors that fire on every OpenAPI position where a
 * Reference is allowed but the user wrote an inline object. Each such position
 * carries two false positives ("must have required property '$ref'" and
 * "must match exactly one schema in oneOf") alongside the real issue. Keeping
 * them would triple the user-facing error count for no signal.
 */
function isUserFacingIssue(e: AjvErrorLike): boolean {
	if (e.message === "must match exactly one schema in oneOf") return false;
	if (e.message === "must have required property '$ref'") return false;
	return true;
}

function dedupe(items: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const i of items) {
		if (seen.has(i)) continue;
		seen.add(i);
		out.push(i);
	}
	return out;
}

function formatAjvIssue(e: AjvErrorLike): string {
	// Ajv's `instancePath` is the JSON pointer to the offending node (e.g.
	// "/paths/~1pets/get/responses/200"). Older Ajv versions used `dataPath`.
	const path = e.instancePath || e.dataPath || "";
	const msg = e.message ?? "Unknown validation error";
	return path ? `${path}: ${msg}` : msg;
}

function isValidatorErrorLike(err: unknown): err is ValidatorErrorLike {
	return typeof err === "object" && err !== null;
}
