import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';

// --- Source type detection ---

export const OPENAPI_EXTENSIONS = ['.yaml', '.yml', '.json'];
export const PROTO_EXTENSIONS = ['.proto'];
export const SUPPORTED_EXTENSIONS = [...OPENAPI_EXTENSIONS, ...PROTO_EXTENSIONS];

export function detectSourceType(filePath: string): 'openapi' | 'grpc' {
  const ext = path.extname(filePath).toLowerCase();
  if (OPENAPI_EXTENSIONS.includes(ext)) return 'openapi';
  if (PROTO_EXTENSIONS.includes(ext)) return 'grpc';
  throw new Error(
    `Cannot determine source type from '${filePath}'.\n` +
    `  Supported: .yaml, .yml, .json (OpenAPI) or .proto (gRPC)`,
  );
}

// --- Directory input resolution ---

export function resolveInputs(inputs: string[]): string[] {
  const resolved: string[] = [];
  for (const input of inputs) {
    const stat = fs.statSync(input, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      const entries = fs.readdirSync(input);
      const supported = entries
        .filter((entry) => SUPPORTED_EXTENSIONS.includes(path.extname(entry).toLowerCase()))
        .sort()
        .map((entry) => path.join(input, entry));
      if (supported.length === 0) {
        throw new Error(
          `No supported files found in directory '${input}'.\n` +
          `  Supported extensions: .yaml, .yml, .json (OpenAPI) or .proto (gRPC)`,
        );
      }
      resolved.push(...supported);
    } else {
      resolved.push(input);
    }
  }
  return resolved;
}

// --- Zod schemas ---

const zodOptionsSchema = z.object({
  strict: z.object({
    response: z.boolean().optional(),
    body: z.boolean().optional(),
  }).optional(),
  coerce: z.object({
    query: z.boolean().optional(),
    params: z.boolean().optional(),
  }).optional(),
}).optional();

const openApiSourceSchema = z.object({
  type: z.literal('openapi'),
  input: z.string(),
  output: z.string().optional(),
  options: z.object({
    zod: zodOptionsSchema,
    operationsMap: z.boolean().default(true),
    errorSchemaName: z.string().optional(),
  }).optional(),
});

const grpcSourceSchema = z.object({
  type: z.literal('grpc'),
  input: z.union([z.string(), z.array(z.string())]),
  output: z.string().optional(),
  options: z.object({
    services: z.array(z.string()).optional(),
    streaming: z.boolean().default(true),
    includeDirs: z.array(z.string()).optional(),
    metadata: z.object({
      optionName: z.string().default('required_headers'),
    }).optional(),
  }).optional(),
});

const sourceWithAutoDetect = z.preprocess((val) => {
  if (typeof val === 'object' && val !== null && 'input' in val) {
    const rec = val as Record<string, unknown>;
    if (!('type' in rec) || rec.type === undefined) {
      const input = rec.input;
      const primaryInput = Array.isArray(input) ? String(input[0]) : String(input);
      try {
        return { ...rec, type: detectSourceType(primaryInput) };
      } catch {
        // Return val as-is; the discriminated union will reject it
        return val;
      }
    }
  }
  return val;
}, z.discriminatedUnion('type', [openApiSourceSchema, grpcSourceSchema]));

const generateConfigSchema = z.object({
  sources: z.array(sourceWithAutoDetect),
});

export const configSchema = z.object({
  generate: generateConfigSchema.optional(),
  // Future: run config for test runner
});

export type OpenApiSource = z.infer<typeof openApiSourceSchema>;
export type GrpcSource = z.infer<typeof grpcSourceSchema>;
export type GenerateConfig = z.infer<typeof generateConfigSchema>;
export type Config = z.infer<typeof configSchema>;

// --- User-facing input types (no `type` field) ---

export type SourceInput = {
  input: string | string[];
  output?: string;
  options?: Record<string, unknown>;
};

export type ConfigInput = {
  generate?: {
    sources: SourceInput[];
  };
};

export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}
