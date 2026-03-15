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
				logger.warn(`Skipping ${method.toUpperCase()} ${pathStr} — no operationId`);
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
	/** Header schema declarations */
	headerSchema: string;
	/** The operations map code */
	operationsMap: string;
	/** Protocol schema bridge code */
	protocolSchema: string;
	/** The Testurio service interface */
	serviceInterface: string;
	/** Type helpers */
	typeHelpers: string;
}

/**
 * Build the operations map, service interface, and header schemas
 * from parsed operations and Orval-generated schema names.
 */
export function buildOperationsMap(
	spec: OpenApiSpec,
	operations: ParsedOperation[],
	orvalExportedNames: Set<string>
): OperationsMapResult {
	const serviceName = deriveServiceName(spec);

	const headerSchemaEntries: string[] = [];
	const opsEntries: string[] = [];
	const interfaceEntries: string[] = [];

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

		// --- Operations map entry ---
		const requestParts: string[] = [`      method: '${op.method}' as const`, `      path: '${op.path}' as const`];

		// Query params
		const orvalQueryName = orvalName(op.operationId, "QueryParams");
		if (orvalExportedNames.has(orvalQueryName)) {
			requestParts.push(`      query: ${orvalQueryName}`);
		}

		// Headers
		if (headerSchemaName) {
			requestParts.push(`      headers: ${headerSchemaName}`);
		}

		// Body
		const bodyName = findOrvalBodyName(op.operationId, orvalExportedNames);
		if (bodyName) {
			requestParts.push(`      body: ${bodyName}`);
		} else {
			requestParts.push(`      body: z.never()`);
		}

		// Response
		const responseParts: string[] = [];
		for (const resp of op.responses) {
			if (resp.isArray) {
				const itemName = findOrvalResponseItemName(op.operationId, orvalExportedNames);
				const responseName = findOrvalResponseName(op.operationId, orvalExportedNames);
				if (responseName) {
					responseParts.push(`      ${resp.code}: ${responseName}`);
				} else if (itemName) {
					responseParts.push(`      ${resp.code}: z.array(${itemName})`);
				} else {
					responseParts.push(`      ${resp.code}: z.unknown()`);
				}
			} else {
				const responseName = findOrvalResponseName(op.operationId, orvalExportedNames);
				if (responseName) {
					responseParts.push(`      ${resp.code}: ${responseName}`);
				} else {
					responseParts.push(`      ${resp.code}: z.unknown()`);
				}
			}
		}

		opsEntries.push(
			`  ${op.operationId}: {\n    request: {\n${requestParts.join(",\n")},\n    },\n    response: {\n${responseParts.join(",\n")},\n    },\n  }`
		);

		// --- Service interface entry ---
		const ifaceRequestParts: string[] = [`method: '${op.method}'`, `path: '${op.path}'`];

		if (op.headerParams.length > 0) {
			const fields = op.headerParams.map((p) => {
				const optional = p.required ? "" : "?";
				return `${safeKey(p.name)}${optional}: string`;
			});
			ifaceRequestParts.push(`headers?: { ${fields.join("; ")} }`);
		}

		if (bodyName) {
			ifaceRequestParts.push(`body: z.infer<typeof ${bodyName}>`);
		}

		// Find first success response
		const successResponse = op.responses.find((r) => r.code.startsWith("2"));
		let responseType = "unknown";
		let responseCode = "200";
		if (successResponse) {
			responseCode = successResponse.code;
			if (successResponse.isArray) {
				const itemName = findOrvalResponseItemName(op.operationId, orvalExportedNames);
				const responseName = findOrvalResponseName(op.operationId, orvalExportedNames);
				if (responseName) {
					responseType = `z.infer<typeof ${responseName}>`;
				} else if (itemName) {
					responseType = `z.infer<typeof ${itemName}>[]`;
				}
			} else {
				const responseName = findOrvalResponseName(op.operationId, orvalExportedNames);
				if (responseName) {
					responseType = `z.infer<typeof ${responseName}>`;
				}
			}
		}

		interfaceEntries.push(
			`  ${op.operationId}: {\n    request: { ${ifaceRequestParts.join("; ")} };\n    response: { code: ${responseCode}; body: ${responseType} };\n  };`
		);
	}

	// --- Protocol schema bridge ---
	const schemaVarName = `${serviceName.charAt(0).toLowerCase() + serviceName.slice(1)}Schema`;
	const protocolSchemaEntries: string[] = [];

	for (const op of operations) {
		// Request schema fields
		const hasPathParams = op.pathParams.length > 0;
		const reqFields: string[] = [
			`      method: z.literal('${op.method}'),`,
			hasPathParams ? `      path: z.string(),` : `      path: z.literal('${op.path}'),`,
		];

		const bodyName = findOrvalBodyName(op.operationId, orvalExportedNames);
		if (bodyName) {
			reqFields.push(`      body: ${bodyName},`);
		} else {
			reqFields.push(`      body: z.unknown().optional(),`);
		}

		const orvalQueryName = orvalName(op.operationId, "QueryParams");
		if (orvalExportedNames.has(orvalQueryName)) {
			reqFields.push(`      query: ${orvalQueryName}.optional(),`);
		}

		// Headers — use existing headerSchemaName logic
		const orvalHeaderName = orvalName(op.operationId, "Header");
		const hasOrvalHeaders = orvalExportedNames.has(orvalHeaderName);
		let headerRef: string | undefined;
		if (op.headerParams.length > 0) {
			headerRef = hasOrvalHeaders ? orvalHeaderName : `${op.operationId}HeaderSchema`;
			reqFields.push(`      headers: ${headerRef}.optional(),`);
		}

		// Response schema fields — use first 2xx response
		const successResp = op.responses.find((r) => r.code.startsWith("2"));
		const resFields: string[] = [];
		if (successResp) {
			resFields.push(`      code: z.literal(${successResp.code}),`);
			if (successResp.isArray) {
				const itemName = findOrvalResponseItemName(op.operationId, orvalExportedNames);
				const responseName = findOrvalResponseName(op.operationId, orvalExportedNames);
				if (responseName) {
					resFields.push(`      body: ${responseName},`);
				} else if (itemName) {
					resFields.push(`      body: z.array(${itemName}),`);
				} else {
					resFields.push(`      body: z.unknown(),`);
				}
			} else {
				const responseName = findOrvalResponseName(op.operationId, orvalExportedNames);
				if (responseName) {
					resFields.push(`      body: ${responseName},`);
				} else {
					resFields.push(`      body: z.unknown(),`);
				}
			}
		} else {
			resFields.push(`      code: z.literal(200),`);
			resFields.push(`      body: z.unknown(),`);
		}

		protocolSchemaEntries.push(
			`  ${op.operationId}: {\n    request: z.object({\n${reqFields.join("\n")}\n    }),\n    response: z.object({\n${resFields.join("\n")}\n    }),\n  }`
		);
	}

	// TODO(task-3): add 'satisfies SyncSchemaInput' and import from 'testurio'
	const protocolSchema =
		protocolSchemaEntries.length > 0
			? `/**\n * Protocol schema bridge for schema-first usage.\n *\n * Schema-first (recommended, requires runtime validation support):\n *   new HttpProtocol({ schema: ${schemaVarName} })\n *\n * Current usage (explicit generic, no runtime validation):\n *   new HttpProtocol<${serviceName}>()\n */\nexport const ${schemaVarName} = {\n${protocolSchemaEntries.join(",\n")},\n};`
			: "";

	const headerSchema =
		headerSchemaEntries.length > 0 ? `// ===== Header Schema =====\n\n${headerSchemaEntries.join("\n\n")}` : "";

	const operationsMap = `// ===== Operations Map =====\n\nexport const operations = {\n${opsEntries.join(",\n")},\n} as const;`;

	const serviceInterface = `// ===== Testurio Service Type =====\n\n/**\n * Schema-first (recommended, requires runtime validation support):\n *   new HttpProtocol({ schema: ${schemaVarName} })\n *\n * Current usage (explicit generic, no runtime validation):\n *   new HttpProtocol<${serviceName}>()\n */\nexport interface ${serviceName} {\n${interfaceEntries.join("\n")}\n}`;

	const typeHelpers = `// ===== Type Helpers =====\n\nexport type ${serviceName}Operations = typeof operations;\nexport type ${serviceName}OperationId = keyof ${serviceName};`;

	return { headerSchema, operationsMap, protocolSchema, serviceInterface, typeHelpers };
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
