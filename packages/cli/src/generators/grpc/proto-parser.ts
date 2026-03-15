import { existsSync } from "node:fs";
import path from "node:path";
import protobuf from "protobufjs";

export interface ParsedService {
	name: string;
	fullName: string;
	methods: ParsedMethod[];
}

export interface ParsedMethod {
	name: string;
	requestType: string;
	responseType: string;
	requestStreaming: boolean;
	responseStreaming: boolean;
	requiredHeaders: string[];
}

export interface ParsedMessage {
	name: string;
	fullName: string;
	fields: ParsedField[];
	oneofs: ParsedOneof[];
	nested: ParsedMessage[];
}

export interface ParsedField {
	name: string;
	type: string;
	repeated: boolean;
	map: boolean;
	mapKeyType?: string;
	optional: boolean;
	rule?: string;
}

export interface ParsedOneof {
	name: string;
	fields: string[];
}

export interface ParsedEnum {
	name: string;
	fullName: string;
	values: string[];
}

export interface ParseResult {
	services: ParsedService[];
	messages: Map<string, ParsedMessage>;
	enums: Map<string, ParsedEnum>;
}

/**
 * Parse .proto file(s) and extract services, messages, and enums.
 */
export async function parseProtoFile(
	protoPath: string | string[],
	optionName: string = "required_headers",
	includeDirs?: string[]
): Promise<ParseResult> {
	const root = new protobuf.Root();
	const paths = Array.isArray(protoPath) ? protoPath : [protoPath];

	const resolvedIncludeDirs = includeDirs ?? autoDetectIncludeDirs(paths);

	root.resolvePath = (_origin: string, target: string) => {
		for (const dir of resolvedIncludeDirs) {
			const resolved = path.resolve(dir, target);
			if (existsSync(resolved)) return resolved;
		}
		return path.resolve(path.dirname(_origin), target);
	};

	// keepCase: true to preserve proto field names (snake_case)
	await root.load(paths, { keepCase: true });
	root.resolveAll();

	const services = extractServices(root, optionName);
	const messages = new Map<string, ParsedMessage>();
	const enums = new Map<string, ParsedEnum>();

	// Extract all messages and enums referenced by services
	const needed = new Set<string>();
	for (const svc of services) {
		for (const method of svc.methods) {
			needed.add(method.requestType);
			needed.add(method.responseType);
		}
	}

	collectTypes(root, messages, enums, needed);

	return { services, messages, enums };
}

function extractServices(root: protobuf.Root, optionName: string): ParsedService[] {
	const services: ParsedService[] = [];

	function walk(ns: protobuf.NamespaceBase) {
		if (ns instanceof protobuf.Service) {
			const methods: ParsedMethod[] = [];

			for (const method of Object.values(ns.methods)) {
				// After resolveAll(), resolved types are available
				const reqFullName = method.resolvedRequestType
					? method.resolvedRequestType.fullName.replace(/^\./, "")
					: method.requestType;
				const resFullName = method.resolvedResponseType
					? method.resolvedResponseType.fullName.replace(/^\./, "")
					: method.responseType;

				const requiredHeaders = extractMethodOptions(method, optionName);
				methods.push({
					name: method.name,
					requestType: reqFullName,
					responseType: resFullName,
					requestStreaming: method.requestStream ?? false,
					responseStreaming: method.responseStream ?? false,
					requiredHeaders,
				});
			}

			services.push({
				name: ns.name,
				fullName: ns.fullName.replace(/^\./, ""),
				methods,
			});
		}

		if (ns.nested) {
			for (const child of Object.values(ns.nested)) {
				if (child instanceof protobuf.Namespace) {
					walk(child);
				}
			}
		}
	}

	walk(root);
	return services;
}

/**
 * Extract custom method options (e.g., required_headers/required_metadata).
 */
function extractMethodOptions(method: protobuf.Method, optionName: string): string[] {
	const headers: string[] = [];
	const key = `(${optionName})`;

	if (method.parsedOptions) {
		for (const opt of method.parsedOptions) {
			const val = opt[key];
			if (typeof val === "string") {
				headers.push(val);
			}
		}
	}

	return headers;
}

function collectTypes(
	root: protobuf.Root,
	messages: Map<string, ParsedMessage>,
	enums: Map<string, ParsedEnum>,
	needed: Set<string>
): void {
	const visited = new Set<string>();

	function resolveType(typeName: string): void {
		if (visited.has(typeName)) return;
		visited.add(typeName);

		const type = root.lookupTypeOrEnum(typeName);

		if (type instanceof protobuf.Enum) {
			const fullName = type.fullName.replace(/^\./, "");
			enums.set(fullName, {
				name: type.name,
				fullName,
				values: Object.keys(type.values),
			});
			return;
		}

		if (type instanceof protobuf.Type) {
			const parsed = parseMessage(type);
			messages.set(parsed.fullName, parsed);

			// Recursively resolve field types
			for (const field of parsed.fields) {
				if (!isScalarType(field.type)) {
					try {
						resolveType(field.type);
					} catch {
						// Type not found — might be a scalar we didn't recognize
					}
				}
			}

			// Resolve nested types
			for (const nested of parsed.nested) {
				messages.set(nested.fullName, nested);
			}
		}
	}

	for (const typeName of needed) {
		resolveType(typeName);
	}

	// Also walk the root to find all enums referenced by collected messages
	walkForEnums(root, messages, enums);
}

function walkForEnums(root: protobuf.Root, messages: Map<string, ParsedMessage>, enums: Map<string, ParsedEnum>): void {
	for (const msg of messages.values()) {
		for (const field of msg.fields) {
			if (!isScalarType(field.type) && !messages.has(field.type)) {
				try {
					const type = root.lookupTypeOrEnum(field.type);
					if (type instanceof protobuf.Enum) {
						const fullName = type.fullName.replace(/^\./, "");
						enums.set(fullName, {
							name: type.name,
							fullName,
							values: Object.keys(type.values),
						});
					}
				} catch {
					// Ignore unresolvable types
				}
			}
		}
	}
}

function parseMessage(type: protobuf.Type): ParsedMessage {
	const fields: ParsedField[] = [];
	const oneofNames = new Map<string, string[]>();

	// Collect oneof field names (with keepCase, field.name preserves proto names)
	if (type.oneofs) {
		for (const [oneofName, oneof] of Object.entries(type.oneofs)) {
			oneofNames.set(
				oneofName,
				oneof.fieldsArray.map((f) => f.name)
			);
		}
	}

	// Determine which oneofs are synthetic (created by proto3 optional keyword).
	// Proto3 optional creates single-field oneofs with underscore-prefixed names.
	const syntheticOneofFields = new Set<string>();
	const realOneofFields = new Set<string>();

	for (const [oneofName, fieldNames] of oneofNames) {
		const isSynthetic = fieldNames.length === 1 && oneofName.startsWith("_");
		if (isSynthetic) {
			syntheticOneofFields.add(fieldNames[0]);
		} else {
			for (const name of fieldNames) {
				realOneofFields.add(name);
			}
		}
	}

	for (const field of type.fieldsArray) {
		const fullType = field.resolvedType ? field.resolvedType.fullName.replace(/^\./, "") : field.type;

		// Fields in synthetic oneofs (proto3 optional keyword) → mark as optional
		// Fields in real oneofs → not optional (handled by oneof union)
		const isExplicitOptional = syntheticOneofFields.has(field.name);

		fields.push({
			name: field.name,
			type: fullType,
			repeated: field.repeated,
			map: field.map,
			mapKeyType: field.map ? field.keyType : undefined,
			optional: realOneofFields.has(field.name) ? false : isExplicitOptional,
			rule: field.rule ?? undefined,
		});
	}

	const oneofs: ParsedOneof[] = [];
	for (const [name, fieldNames] of oneofNames) {
		// Exclude synthetic oneofs created by proto3 optional keyword
		if (fieldNames.length === 1 && name.startsWith("_")) {
			continue;
		}
		oneofs.push({ name, fields: fieldNames });
	}

	const nested: ParsedMessage[] = [];
	if (type.nested) {
		for (const child of Object.values(type.nested)) {
			if (child instanceof protobuf.Type) {
				nested.push(parseMessage(child));
			}
		}
	}

	return {
		name: type.name,
		fullName: type.fullName.replace(/^\./, ""),
		fields,
		oneofs,
		nested,
	};
}

const SCALAR_TYPES = new Set([
	"double",
	"float",
	"int32",
	"int64",
	"uint32",
	"uint64",
	"sint32",
	"sint64",
	"fixed32",
	"fixed64",
	"sfixed32",
	"sfixed64",
	"bool",
	"string",
	"bytes",
]);

function isScalarType(type: string): boolean {
	return SCALAR_TYPES.has(type);
}

/**
 * Auto-detect include directories by looking at proto file parent dirs
 * and well-known proto locations in node_modules.
 */
function autoDetectIncludeDirs(protoPaths: string[]): string[] {
	const dirs = new Set<string>();

	// Add each proto file's parent directory
	for (const p of protoPaths) {
		dirs.add(path.dirname(path.resolve(p)));
	}

	// Search for well-known proto locations in node_modules
	const wellKnownLocations = [
		"node_modules/@grpc/proto-loader",
		"node_modules/protobufjs",
		"node_modules/google-proto-files",
	];

	for (const loc of wellKnownLocations) {
		for (const p of protoPaths) {
			let dir = path.dirname(path.resolve(p));
			while (dir !== path.parse(dir).root) {
				const candidate = path.join(dir, loc);
				if (existsSync(candidate)) {
					dirs.add(candidate);
					break;
				}
				dir = path.dirname(dir);
			}
		}
	}

	return Array.from(dirs);
}
