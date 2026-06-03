import type { Logger } from "../types.js";

export interface OpenApiSpec {
	info?: { title?: string };
	paths?: Record<string, Record<string, OpenApiOperation>>;
	components?: { schemas?: Record<string, unknown> };
}

interface OpenApiOperation {
	operationId?: string;
	parameters?: OpenApiParameter[];
	requestBody?: {
		content?: Record<string, { schema?: SchemaRef }>;
		required?: boolean;
	};
	responses?: Record<
		string,
		{
			content?: Record<string, { schema?: SchemaRef }>;
		}
	>;
}

interface OpenApiParameter {
	name: string;
	in: "query" | "path" | "header" | "cookie";
	required?: boolean;
	schema?: SchemaRef;
}

interface SchemaRef {
	$ref?: string;
	type?: string;
	items?: SchemaRef;
	properties?: Record<string, SchemaRef>;
	required?: string[];
	allOf?: SchemaRef[];
	oneOf?: SchemaRef[];
	anyOf?: SchemaRef[];
	format?: string;
	enum?: unknown[];
}

export interface ParsedOperation {
	operationId: string;
	method: string;
	path: string;
	queryParams: OpenApiParameter[];
	headerParams: OpenApiParameter[];
	pathParams: OpenApiParameter[];
	requestBodyRef: string | undefined;
	requestBodyRequired: boolean;
	responses: Array<{ code: string; schemaRef: string | undefined; isArray: boolean }>;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

/**
 * Derive a deterministic operationId from `{method, path}`.
 *
 * Algorithm:
 *   1. Split path on `/`, drop empty segments.
 *   2. If the first segment matches `v\d+`, keep it lowercase as a prefix.
 *   3. Append lowercase method.
 *   4. Append remaining segments in PascalCase (kebab/snake/dot split, braces stripped from path params).
 */
export function deriveOperationId(method: string, path: string): string {
	const segments = path.split("/").filter((s) => s.length > 0);

	let prefix = "";
	let remaining = segments;
	if (segments.length > 0 && /^v\d+$/.test(segments[0])) {
		prefix = segments[0].toLowerCase();
		remaining = segments.slice(1);
	}

	const pascalSegments = remaining.map(segmentToPascal).filter((s) => s.length > 0);
	const methodLower = method.toLowerCase();

	const result = prefix + methodLower + pascalSegments.join("");

	if (result.length === 0) {
		return `${methodLower}Root`;
	}
	if (/^\d/.test(result)) {
		return `_${result}`;
	}
	return result;
}

function segmentToPascal(segment: string): string {
	const bare = segment.replace(/^\{|\}$/g, "");
	const words = bare.split(/[-_.]+/).filter((w) => w.length > 0);
	return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

/**
 * Mutate the spec in place, assigning `operationId` to any operation missing one.
 * Returns the list of synthesized entries for logging.
 */
export function synthesizeOperationIds(
	spec: OpenApiSpec
): Array<{ method: string; path: string; operationId: string }> {
	const synthesized: Array<{ method: string; path: string; operationId: string }> = [];

	if (!spec.paths) return synthesized;

	for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!operation) continue;
			if (operation.operationId) continue;

			const operationId = deriveOperationId(method, pathStr);
			operation.operationId = operationId;
			synthesized.push({ method: method.toUpperCase(), path: pathStr, operationId });
		}
	}

	return synthesized;
}

/**
 * Walk the spec and throw if any operationId is used by more than one operation.
 * Error message names both colliding endpoints.
 */
export function assertNoOperationIdCollisions(spec: OpenApiSpec): void {
	if (!spec.paths) return;

	const byId = new Map<string, Array<{ method: string; path: string }>>();

	for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!operation?.operationId) continue;

			const entries = byId.get(operation.operationId) ?? [];
			entries.push({ method: method.toUpperCase(), path: pathStr });
			byId.set(operation.operationId, entries);
		}
	}

	for (const [operationId, entries] of byId) {
		if (entries.length > 1) {
			const lines = entries.map((e) => `  - ${e.method} ${e.path}`).join("\n");
			throw new Error(
				`Duplicate operationId '${operationId}' for both:\n${lines}\nAdd an explicit operationId to one of these operations.`
			);
		}
	}
}

/**
 * Extract all operations from an OpenAPI spec.
 */
export function extractOperations(spec: OpenApiSpec, logger: Logger): ParsedOperation[] {
	const operations: ParsedOperation[] = [];

	if (!spec.paths) return operations;

	for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!operation) continue;

			if (!operation.operationId) {
				// Defensive guard: synthesizeOperationIds should run before this in the normal flow.
				logger.debug(`Skipping ${method.toUpperCase()} ${pathStr} — no operationId`);
				continue;
			}

			const params = operation.parameters ?? [];

			operations.push({
				operationId: operation.operationId,
				method: method.toUpperCase(),
				path: pathStr,
				queryParams: params.filter((p) => p.in === "query"),
				headerParams: params.filter((p) => p.in === "header"),
				pathParams: params.filter((p) => p.in === "path"),
				requestBodyRef: extractBodySchemaRef(operation.requestBody),
				requestBodyRequired: operation.requestBody?.required ?? false,
				responses: extractResponses(operation.responses),
			});
		}
	}

	return operations;
}

function extractBodySchemaRef(requestBody?: OpenApiOperation["requestBody"]): string | undefined {
	if (!requestBody?.content) return undefined;
	const jsonContent = requestBody.content["application/json"];
	if (!jsonContent?.schema) return undefined;
	return resolveSchemaName(jsonContent.schema);
}

function extractResponses(
	responses?: OpenApiOperation["responses"]
): Array<{ code: string; schemaRef: string | undefined; isArray: boolean }> {
	if (!responses) return [];

	return Object.entries(responses).map(([code, response]) => {
		const jsonContent = response.content?.["application/json"];
		const schema = jsonContent?.schema;
		const isArray = schema?.type === "array";
		const schemaRef = schema
			? isArray && schema.items
				? resolveSchemaName(schema.items)
				: resolveSchemaName(schema)
			: undefined;
		return { code, schemaRef, isArray };
	});
}

function resolveSchemaName(schema: SchemaRef): string | undefined {
	if (schema.$ref) {
		const parts = schema.$ref.split("/");
		return parts[parts.length - 1];
	}
	return undefined;
}

function safeKey(key: string): string {
	return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
}

/**
 * Derive the service interface name from the spec title.
 */
export function deriveServiceName(spec: OpenApiSpec): string {
	const title = spec.info?.title ?? "Api";
	return title
		.replace(/[^a-zA-Z0-9\s]/g, "")
		.split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join("");
}

/**
 * Orval naming convention: `{operationId}{Suffix}` where suffix is:
 * - Body → request body
 * - Response → response schema
 * - ResponseItem → array item schema
 * - QueryParams → query parameters
 * - Header → header parameters
 * - Params → path parameters
 */
function orvalName(operationId: string, suffix: string): string {
	return `${operationId}${suffix}`;
}

/**
 * Find the Orval-generated name for a schema. Tries exact match first,
 * then falls back to the Orval naming pattern.
 */
function findOrvalResponseName(operationId: string, exportedNames: Set<string>): string | undefined {
	// Orval generates `{opId}Response` for single schemas
	const responseName = orvalName(operationId, "Response");
	if (exportedNames.has(responseName)) return responseName;
	return undefined;
}

function findOrvalResponseItemName(operationId: string, exportedNames: Set<string>): string | undefined {
	const itemName = orvalName(operationId, "ResponseItem");
	if (exportedNames.has(itemName)) return itemName;
	return undefined;
}

function findOrvalBodyName(operationId: string, exportedNames: Set<string>): string | undefined {
	const bodyName = orvalName(operationId, "Body");
	if (exportedNames.has(bodyName)) return bodyName;
	return undefined;
}

export interface OperationsMapResult {
	/** Header schema declarations (when header params not covered by Orval-named exports) */
	headerSchema: string;
	/**
	 * Unified `operations` artifact — each operation's `request` and `response`
	 * are `z.object(...)` instances satisfying `SyncSchemaInput`.
	 * Drives both runtime validation (`new HttpProtocol({ schema: operations })`)
	 * and TypeScript type derivation (`InferSyncService<typeof operations>`).
	 */
	operationsMap: string;
	/**
	 * One-line type alias deriving the service interface from `operations`:
	 *   `export type {Service} = InferSyncService<typeof operations>;`
	 */
	serviceInterface: string;
	/** Type helpers — Operations / OperationId aliases */
	typeHelpers: string;
}

/**
 * Build a single response variant `z.object({ code: z.literal(N), body: ... })`.
 *
 * Body resolution:
 * - 2xx + isArray + Orval has `${opId}Response` → reference it
 * - 2xx + isArray + Orval has only `${opId}ResponseItem` → `z.array(${itemName})`
 * - 2xx + scalar + Orval has `${opId}Response` → reference it
 * - Otherwise (including non-2xx) → `z.never()`
 *
 * Orval v8.5.3 only emits a single `${opId}Response` schema per operation (for the
 * primary success body). Non-2xx responses have no dedicated Orval schema and fall
 * through to `z.never()`, which keeps the discriminator clean and matches BUG-003's
 * "no body → z.never()" convention.
 */
function buildResponseVariant(
	operationId: string,
	resp: ParsedOperation["responses"][number],
	orvalExportedNames: Set<string>
): string {
	// `z.never().optional()` for body-less slots: rejects any value other than
	// undefined/missing. At runtime `parse({ code })` succeeds for `{code: 204}`
	// (no body present); at design-time the inferred `body?: undefined` lets
	// consumers omit the field. A naked `z.never()` rejects undefined too,
	// breaking both modes for every 204/4xx/5xx-without-body slot.
	let body = "z.never().optional()";
	if (resp.code.startsWith("2")) {
		const responseName = findOrvalResponseName(operationId, orvalExportedNames);
		if (resp.isArray) {
			const itemName = findOrvalResponseItemName(operationId, orvalExportedNames);
			if (responseName) body = responseName;
			else if (itemName) body = `z.array(${itemName})`;
		} else if (responseName) {
			body = responseName;
		}
	}
	return `z.object({ code: z.literal(${resp.code}), body: ${body} })`;
}

/**
 * Build the `response` expression for an operation:
 *   - 0 responses → fallback `z.object({ code: z.literal(200), body: z.never() })`
 *   - 1 response  → plain `z.object(...)`
 *   - 2+ responses → `z.discriminatedUnion('code', [z.object(...), z.object(...)])`
 *
 * The biome formatter run after generation reflows multi-variant unions
 * across multiple lines automatically.
 */
function buildResponseExpression(op: ParsedOperation, orvalExportedNames: Set<string>): string {
	if (op.responses.length === 0) {
		return "z.object({ code: z.literal(200), body: z.never().optional() })";
	}
	if (op.responses.length === 1) {
		return buildResponseVariant(op.operationId, op.responses[0], orvalExportedNames);
	}
	const variants = op.responses.map((r) => buildResponseVariant(op.operationId, r, orvalExportedNames));
	// Pre-formatted with newlines so biome reflows the union members across lines
	// instead of leaving the entire expression on a single 200+ character line.
	return `z.discriminatedUnion('code', [\n      ${variants.join(",\n      ")},\n    ])`;
}

/**
 * Build the unified operations map and derived type alias from parsed operations
 * and Orval-generated schema names.
 *
 * The output is a single `operations` artifact:
 *
 * ```ts
 * export const operations = {
 *   v1getVersion: {
 *     request: z.object({
 *       method: z.literal('GET'),
 *       path: z.literal('/v1/version'),
 *       body: z.never(),                  // body-less ops → z.never()
 *     }),
 *     response: z.object({
 *       code: z.literal(200),
 *       body: v1getVersionResponse,
 *     }),
 *   },
 *   ...
 * };
 *
 * export type {Service} = InferSyncService<typeof operations>;
 * ```
 *
 * `typeof operations` satisfies `SyncSchemaInput` so it can be passed directly
 * as `new HttpProtocol({ schema: operations })`.
 */
export function buildOperationsMap(
	spec: OpenApiSpec,
	operations: ParsedOperation[],
	orvalExportedNames: Set<string>
): OperationsMapResult {
	const serviceName = deriveServiceName(spec);

	const headerSchemaEntries: string[] = [];
	const opsEntries: string[] = [];

	for (const op of operations) {
		// --- Header schemas ---
		const orvalHeaderName = orvalName(op.operationId, "Header");
		const hasOrvalHeaders = orvalExportedNames.has(orvalHeaderName);

		// If Orval didn't generate headers but we have header params, generate our own
		let headerSchemaName: string | undefined;
		if (op.headerParams.length > 0) {
			if (hasOrvalHeaders) {
				headerSchemaName = orvalHeaderName;
			} else {
				headerSchemaName = `${op.operationId}HeaderSchema`;
				const fields = op.headerParams.map((p) => {
					const optional = !p.required ? ".optional()" : "";
					return `  ${safeKey(p.name)}: z.string()${optional},`;
				});
				headerSchemaEntries.push(`export const ${headerSchemaName} = z.object({\n${fields.join("\n")}\n});`);
			}
		}

		// --- Unified request z.object fields ---
		const hasPathParams = op.pathParams.length > 0;
		const reqFields: string[] = [
			`      method: z.literal('${op.method}'),`,
			hasPathParams ? `      path: z.string(),` : `      path: z.literal('${op.path}'),`,
		];

		// `z.never().optional()` for body-less requests: at runtime, parse({method, path})
		// succeeds without a body key; at design-time, the inferred `body?: undefined` lets
		// consumers omit the field. Both modes fail with a naked `z.never()` because it
		// rejects undefined and forces an uninhabited required property in the inferred type.
		const bodyName = findOrvalBodyName(op.operationId, orvalExportedNames);
		reqFields.push(`      body: ${bodyName ?? "z.never().optional()"},`);

		const orvalQueryName = orvalName(op.operationId, "QueryParams");
		if (orvalExportedNames.has(orvalQueryName)) {
			reqFields.push(`      query: ${orvalQueryName}.optional(),`);
		}

		if (headerSchemaName) {
			reqFields.push(`      headers: ${headerSchemaName}.optional(),`);
		}

		// --- Unified response: discriminated union by status code (or single z.object) ---
		// Emit ALL responses defined in the spec, not just the first 2xx, so the inferred
		// type for `response` is `{code:200; body:...} | {code:400; body:...} | ...`.
		const responseExpr = buildResponseExpression(op, orvalExportedNames);

		opsEntries.push(
			`  ${op.operationId}: {\n    request: z.object({\n${reqFields.join("\n")}\n    }),\n    response: ${responseExpr},\n  }`
		);
	}

	const headerSchema =
		headerSchemaEntries.length > 0 ? `// ===== Header Schemas =====\n\n${headerSchemaEntries.join("\n\n")}` : "";

	const operationsMap = `// ===== Operations =====\n\n/**\n * Unified operations artifact — single source of truth for runtime validation\n * AND TypeScript types.\n *\n * Runtime validation:\n *   new HttpProtocol({ schema: operations })\n *\n * Explicit-generic typing:\n *   new HttpProtocol<typeof operations>()\n */\nexport const operations = {\n${opsEntries.join(",\n")},\n};`;

	// Inline mapped type — derives the service interface from `operations` via z.infer.
	// Self-contained: depends only on `zod` (already imported), no testurio import needed.
	const serviceInterface = `// ===== Service Type (derived) =====\n\nexport type ${serviceName} = {\n  [K in keyof typeof operations]: {\n    request: z.infer<(typeof operations)[K]["request"]>;\n    response: z.infer<(typeof operations)[K]["response"]>;\n  };\n};`;

	const typeHelpers = `// ===== Type Helpers =====\n\nexport type ${serviceName}Operations = typeof operations;\nexport type ${serviceName}OperationId = keyof ${serviceName};`;

	return { headerSchema, operationsMap, serviceInterface, typeHelpers };
}

/**
 * Extract schema variable names from Orval-generated code.
 */
export function extractOrvalSchemaNames(orvalOutput: string): Set<string> {
	const names = new Set<string>();
	const regex = /export const (\w+)\s*=/g;
	let match = regex.exec(orvalOutput);
	while (match) {
		names.add(match[1]);
		match = regex.exec(orvalOutput);
	}
	return names;
}
