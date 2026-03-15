import type {
  ParsedService,
  ParsedMethod,
  ParsedMessage,
  ParsedField,
  ParsedEnum,
  ParsedOneof,
} from './proto-parser.js';

/** Well-known Google protobuf types → Zod schema code */
const WELL_KNOWN_TYPES: Record<string, string> = {
  'google.protobuf.Timestamp': 'z.string().datetime()',
  'google.protobuf.Duration': 'z.string()',
  'google.protobuf.StringValue': 'z.string().optional()',
  'google.protobuf.Int32Value': 'z.number().int().optional()',
  'google.protobuf.UInt32Value': 'z.number().int().nonnegative().optional()',
  'google.protobuf.Int64Value': 'z.number().optional()',
  'google.protobuf.UInt64Value': 'z.number().optional()',
  'google.protobuf.FloatValue': 'z.number().optional()',
  'google.protobuf.DoubleValue': 'z.number().optional()',
  'google.protobuf.BoolValue': 'z.boolean().optional()',
  'google.protobuf.BytesValue': 'z.instanceof(Uint8Array).optional()',
  'google.protobuf.Empty': 'z.object({})',
  'google.protobuf.Struct': 'z.record(z.unknown())',
  'google.protobuf.Value': 'z.unknown()',
  'google.protobuf.ListValue': 'z.array(z.unknown())',
  'google.protobuf.Any': 'z.object({ typeUrl: z.string(), value: z.instanceof(Uint8Array) })',
};

/**
 * Map proto scalar type to Zod schema string.
 */
function scalarToZod(type: string): string {
  switch (type) {
    case 'double':
    case 'float':
      return 'z.number()';
    case 'int32':
    case 'sint32':
    case 'sfixed32':
      return 'z.number().int()';
    case 'uint32':
    case 'fixed32':
      return 'z.number().int().nonnegative()';
    case 'int64':
    case 'sint64':
    case 'sfixed64':
    case 'uint64':
    case 'fixed64':
      return 'z.number()';
    case 'bool':
      return 'z.boolean()';
    case 'string':
      return 'z.string()';
    case 'bytes':
      return 'z.instanceof(Uint8Array)';
    default:
      return 'z.unknown()';
  }
}

const SCALAR_TYPES = new Set([
  'double', 'float',
  'int32', 'int64', 'uint32', 'uint64',
  'sint32', 'sint64',
  'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
  'bool', 'string', 'bytes',
]);

function isScalar(type: string): boolean {
  return SCALAR_TYPES.has(type);
}

function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function toSchemaName(messageName: string): string {
  // Extract just the type name (no package)
  const parts = messageName.split('.');
  const simpleName = parts[parts.length - 1];
  return `${toCamelCase(simpleName)}Schema`;
}

function toEnumSchemaName(enumName: string): string {
  const parts = enumName.split('.');
  const simpleName = parts[parts.length - 1];
  return `${toCamelCase(simpleName)}Schema`;
}

export interface EmitResult {
  /** Enum schema code lines */
  enums: string;
  /** Message Zod schema code lines */
  schemas: string;
  /** Metadata schema code lines */
  metadataSchemas: string;
  /** Streaming envelope+variant schema code lines */
  streamSchemas: string;
  /** Testurio service interface */
  serviceInterface: string;
  /** Type helpers */
  typeHelpers: string;
}

/**
 * Emit all Zod schemas, service interfaces, and helpers for a set of services.
 */
export function emitGrpcSchemas(
  services: ParsedService[],
  messages: Map<string, ParsedMessage>,
  enums: Map<string, ParsedEnum>,
  protoSource: string,
): EmitResult {
  const emittedSchemas = new Set<string>();
  const schemaLines: string[] = [];
  const enumLines: string[] = [];

  // Emit enums
  for (const [, enumDef] of enums) {
    const schemaName = toEnumSchemaName(enumDef.fullName);
    if (emittedSchemas.has(schemaName)) continue;
    emittedSchemas.add(schemaName);

    const values = enumDef.values.map((v) => `'${v}'`).join(', ');
    enumLines.push(`export const ${schemaName} = z.enum([${values}]);`);
    enumLines.push(`export type ${enumDef.name} = z.infer<typeof ${schemaName}>;`);
    enumLines.push('');
  }

  // Emit message schemas in dependency order
  const emitOrder = resolveDependencyOrder(messages, enums);
  for (const msgName of emitOrder) {
    const msg = messages.get(msgName);
    if (!msg) continue;

    const schemaName = toSchemaName(msg.fullName);
    if (emittedSchemas.has(schemaName)) continue;
    emittedSchemas.add(schemaName);

    const code = emitMessageSchema(msg, messages, enums, emittedSchemas);
    schemaLines.push(`export const ${schemaName} = ${code};`);
    schemaLines.push('');
  }

  // Emit metadata schemas
  const metadataLines: string[] = [];
  for (const svc of services) {
    for (const method of svc.methods) {
      if (method.requiredHeaders.length > 0) {
        const schemaName = `${toCamelCase(method.name)}MetadataSchema`;
        const fields = method.requiredHeaders
          .map((h) => `  '${h}': z.string(),`)
          .join('\n');
        metadataLines.push(`export const ${schemaName} = z.object({\n${fields}\n});`);
        metadataLines.push('');
      }
    }
  }

  // Emit streaming envelope+variant schemas
  const streamLines: string[] = [];
  const streamMethodData: Array<{
    service: ParsedService;
    method: ParsedMethod;
    clientEntries: Array<{ key: string; schemaName: string }>;
    serverEntries: Array<{ key: string; schemaName: string }>;
  }> = [];

  for (const svc of services) {
    for (const method of svc.methods) {
      if (!method.requestStreaming && !method.responseStreaming) continue;

      const clientEntries: Array<{ key: string; schemaName: string }> = [];
      const serverEntries: Array<{ key: string; schemaName: string }> = [];

      if (method.requestStreaming) {
        const reqMsg = messages.get(method.requestType);
        if (reqMsg) {
          emitStreamVariantSchemas(
            reqMsg, 'Client', messages, enums, emittedSchemas,
            streamLines, clientEntries,
          );
        }
      }

      if (method.responseStreaming) {
        const resMsg = messages.get(method.responseType);
        if (resMsg) {
          emitStreamVariantSchemas(
            resMsg, 'Server', messages, enums, emittedSchemas,
            streamLines, serverEntries,
          );
        }
      }

      streamMethodData.push({ service: svc, method, clientEntries, serverEntries });
    }
  }

  // Emit service interfaces
  const interfaceLines: string[] = [];
  const typeHelperLines: string[] = [];

  for (const svc of services) {
    const unaryMethods = svc.methods.filter(
      (m) => !m.requestStreaming && !m.responseStreaming,
    );
    const streamMethods = svc.methods.filter(
      (m) => m.requestStreaming || m.responseStreaming,
    );

    // Unary service interface
    if (unaryMethods.length > 0) {
      const entries: string[] = [];
      for (const method of unaryMethods) {
        const reqSchema = toSchemaName(method.requestType);
        const resSchema = toSchemaName(method.responseType);
        const metadataSchema = method.requiredHeaders.length > 0
          ? `${toCamelCase(method.name)}MetadataSchema`
          : undefined;

        let entry = `  ${method.name}: {\n    request: z.infer<typeof ${reqSchema}>;\n    response: z.infer<typeof ${resSchema}>;`;
        if (metadataSchema) {
          entry += `\n    metadata: z.infer<typeof ${metadataSchema}>;`;
        }
        entry += '\n  };';
        entries.push(entry);
      }

      interfaceLines.push(`/**`);
      interfaceLines.push(` * Use with: new GrpcUnaryProtocol<${svc.name}>({ schema: '${protoSource}' })`);
      if (unaryMethods.some((m) => m.requiredHeaders.length > 0)) {
        interfaceLines.push(` *`);
        interfaceLines.push(` * Note: The \`metadata\` field is safely ignored by GrpcUnaryOperations<T>`);
        interfaceLines.push(` * and provides type hints for runtime metadata usage.`);
      }
      interfaceLines.push(` */`);
      interfaceLines.push(`export interface ${svc.name} {`);
      interfaceLines.push(entries.join('\n'));
      interfaceLines.push('}');
      interfaceLines.push('');

      typeHelperLines.push(`export type ${svc.name}Method = keyof ${svc.name};`);
    }

    // Stream service interface
    if (streamMethods.length > 0) {
      const streamSvcName = unaryMethods.length > 0
        ? `${svc.name}Streams`
        : svc.name;

      const entries: string[] = [];
      for (const method of streamMethods) {
        const data = streamMethodData.find(
          (d) => d.service.name === svc.name && d.method.name === method.name,
        );
        if (!data) continue;

        const clientFields = data.clientEntries
          .map((e) => `      ${e.key}: z.infer<typeof ${e.schemaName}>;`)
          .join('\n');
        const serverFields = data.serverEntries
          .map((e) => `      ${e.key}: z.infer<typeof ${e.schemaName}>;`)
          .join('\n');

        entries.push(`  ${method.name}: {`);
        if (clientFields) {
          entries.push(`    clientMessages: {\n${clientFields}\n    };`);
        }
        if (serverFields) {
          entries.push(`    serverMessages: {\n${serverFields}\n    };`);
        }
        entries.push(`  };`);
      }

      interfaceLines.push(`/**`);
      interfaceLines.push(` * Use with: new GrpcStreamProtocol<${streamSvcName}['MethodName']>({`);
      interfaceLines.push(` *   schema: '${protoSource}',`);
      interfaceLines.push(` *   serviceName: '${svc.fullName}',`);
      interfaceLines.push(` *   methodName: 'MethodName',`);
      interfaceLines.push(` * })`);
      interfaceLines.push(` */`);
      interfaceLines.push(`export interface ${streamSvcName} {`);
      interfaceLines.push(entries.join('\n'));
      interfaceLines.push('}');
      interfaceLines.push('');

      typeHelperLines.push(`export type ${streamSvcName}Method = keyof ${streamSvcName};`);
    }
  }

  return {
    enums: enumLines.join('\n'),
    schemas: schemaLines.join('\n'),
    metadataSchemas: metadataLines.join('\n'),
    streamSchemas: streamLines.join('\n'),
    serviceInterface: interfaceLines.join('\n'),
    typeHelpers: typeHelperLines.join('\n'),
  };
}

/**
 * Emit Zod schema for a message type.
 */
function emitMessageSchema(
  msg: ParsedMessage,
  messages: Map<string, ParsedMessage>,
  enums: Map<string, ParsedEnum>,
  emittedSchemas: Set<string>,
): string {
  const fieldEntries: string[] = [];

  // Collect oneof field names
  const oneofFieldNames = new Set<string>();
  for (const oneof of msg.oneofs) {
    for (const name of oneof.fields) {
      oneofFieldNames.add(name);
    }
  }

  // Emit regular fields (non-oneof)
  for (const field of msg.fields) {
    if (oneofFieldNames.has(field.name)) continue;

    const zodType = fieldToZod(field, messages, enums, emittedSchemas);
    const optional = field.optional ? '.optional()' : '';
    fieldEntries.push(`  ${field.name}: ${zodType}${optional},`);
  }

  // Emit oneof as union
  for (const oneof of msg.oneofs) {
    const variants: string[] = [];
    for (const fieldName of oneof.fields) {
      const field = msg.fields.find((f) => f.name === fieldName);
      if (!field) continue;
      const zodType = fieldToZod(field, messages, enums, emittedSchemas);
      variants.push(`z.object({ ${fieldName}: ${zodType} })`);
    }

    if (variants.length === 1) {
      // Single variant — just add the field directly
      const fieldName = oneof.fields[0];
      const field = msg.fields.find((f) => f.name === fieldName);
      if (field) {
        const zodType = fieldToZod(field, messages, enums, emittedSchemas);
        fieldEntries.push(`  ${fieldName}: ${zodType}.optional(),`);
      }
    } else if (variants.length > 1) {
      // Multiple variants — use z.union with partial schemas
      // In proto3, oneof fields are optional — only one can be set
      for (const fieldName of oneof.fields) {
        const field = msg.fields.find((f) => f.name === fieldName);
        if (!field) continue;
        const zodType = fieldToZod(field, messages, enums, emittedSchemas);
        fieldEntries.push(`  ${fieldName}: ${zodType}.optional(),`);
      }
    }
  }

  return `z.object({\n${fieldEntries.join('\n')}\n})`;
}

function fieldToZod(
  field: ParsedField,
  messages: Map<string, ParsedMessage>,
  enums: Map<string, ParsedEnum>,
  emittedSchemas: Set<string>,
): string {
  if (field.map) {
    const keyZod = scalarToZod(field.mapKeyType ?? 'string');
    const valueZod = typeRefToZod(field.type, messages, enums, emittedSchemas);
    return `z.record(${keyZod}, ${valueZod})`;
  }

  const baseType = typeRefToZod(field.type, messages, enums, emittedSchemas);

  if (field.repeated) {
    return `z.array(${baseType})`;
  }

  return baseType;
}

function typeRefToZod(
  type: string,
  messages: Map<string, ParsedMessage>,
  enums: Map<string, ParsedEnum>,
  emittedSchemas: Set<string>,
): string {
  // Check well-known types
  if (WELL_KNOWN_TYPES[type]) {
    return WELL_KNOWN_TYPES[type];
  }

  // Check scalar
  if (isScalar(type)) {
    return scalarToZod(type);
  }

  // Check enum
  if (enums.has(type)) {
    return toEnumSchemaName(type);
  }

  // Check message reference
  if (messages.has(type)) {
    return toSchemaName(type);
  }

  return 'z.unknown()';
}

/**
 * Emit streaming envelope+variant schemas for a stream message.
 */
function emitStreamVariantSchemas(
  msg: ParsedMessage,
  direction: 'Client' | 'Server',
  messages: Map<string, ParsedMessage>,
  enums: Map<string, ParsedEnum>,
  emittedSchemas: Set<string>,
  lines: string[],
  entries: Array<{ key: string; schemaName: string }>,
): void {
  if (msg.oneofs.length === 0) {
    // No oneof — single message type, use message type name as key
    const schemaName = toSchemaName(msg.fullName);
    entries.push({ key: msg.name, schemaName });
    return;
  }

  // Get envelope fields (non-oneof)
  const oneofFieldNames = new Set<string>();
  for (const oneof of msg.oneofs) {
    for (const name of oneof.fields) {
      oneofFieldNames.add(name);
    }
  }

  const envelopeFields = msg.fields.filter((f) => !oneofFieldNames.has(f.name));

  // For each oneof variant, generate envelope + variant schema
  for (const oneof of msg.oneofs) {
    for (const fieldName of oneof.fields) {
      const field = msg.fields.find((f) => f.name === fieldName);
      if (!field) continue;

      const variantSchemaName = `${fieldName}${direction}MessageSchema`;

      const fieldEntries: string[] = [];

      // Add envelope fields
      for (const ef of envelopeFields) {
        const zodType = fieldToZod(ef, messages, enums, emittedSchemas);
        fieldEntries.push(`  ${ef.name}: ${zodType},`);
      }

      // Add the active variant field
      const variantZod = typeRefToZod(field.type, messages, enums, emittedSchemas);
      fieldEntries.push(`  ${fieldName}: ${variantZod},`);

      lines.push(`export const ${variantSchemaName} = z.object({\n${fieldEntries.join('\n')}\n});`);
      lines.push('');

      entries.push({ key: fieldName, schemaName: variantSchemaName });
    }
  }
}

/**
 * Resolve dependency order for messages (topological sort).
 */
function resolveDependencyOrder(
  messages: Map<string, ParsedMessage>,
  enums: Map<string, ParsedEnum>,
): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const msg = messages.get(name);
    if (!msg) return;

    // Visit dependencies first
    for (const field of msg.fields) {
      if (!isScalar(field.type) && !enums.has(field.type) && !WELL_KNOWN_TYPES[field.type]) {
        if (messages.has(field.type) && field.type !== name) {
          visit(field.type);
        }
      }
    }

    order.push(name);
  }

  for (const name of messages.keys()) {
    visit(name);
  }

  return order;
}
