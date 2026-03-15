import fs from 'node:fs';
import path from 'node:path';
import { cosmiconfig } from 'cosmiconfig';
import { configSchema, SUPPORTED_EXTENSIONS, type Config } from './schema.js';

const MODULE_NAME = 'testurio';

export async function loadConfig(configPath?: string): Promise<{ config: Config; filepath: string }> {
  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      `${MODULE_NAME}.config.ts`,
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.mjs`,
      `${MODULE_NAME}.config.cjs`,
      `${MODULE_NAME}.config.json`,
      `${MODULE_NAME}.config.yaml`,
      `${MODULE_NAME}.config.yml`,
    ],
  });

  const result = configPath
    ? await explorer.load(path.resolve(configPath))
    : await explorer.search();

  if (!result || result.isEmpty) {
    throw new Error(
      'No config file found. Run `testurio init` to create one, or use `--config` to specify a path.',
    );
  }

  const rawConfig = result.config?.default ?? result.config;
  const configDir = path.dirname(result.filepath);

  // Expand directory inputs before Zod parsing (directories have no file extension
  // and would fail detectSourceType in z.preprocess)
  const expandedConfig = expandDirectorySources(rawConfig, configDir);

  const parsed = configSchema.safeParse(expandedConfig);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid config in ${result.filepath}:\n${issues}`);
  }

  const config = resolveConfigPaths(parsed.data, configDir);

  return { config, filepath: result.filepath };
}

export function expandDirectorySources(rawConfig: unknown, configDir: string): unknown {
  if (typeof rawConfig !== 'object' || rawConfig === null) return rawConfig;
  const config = rawConfig as Record<string, unknown>;
  if (!config.generate || typeof config.generate !== 'object') return rawConfig;
  const generate = config.generate as Record<string, unknown>;
  if (!Array.isArray(generate.sources)) return rawConfig;

  const expandedSources: unknown[] = [];

  for (const source of generate.sources) {
    if (typeof source !== 'object' || source === null || !('input' in source)) {
      expandedSources.push(source);
      continue;
    }
    const s = source as Record<string, unknown>;
    const input = s.input;

    if (typeof input !== 'string') {
      // Array input (gRPC multi-file) — pass through
      expandedSources.push(source);
      continue;
    }

    const resolvedInput = path.resolve(configDir, input);
    const stat = fs.statSync(resolvedInput, { throwIfNoEntry: false });

    if (!stat?.isDirectory()) {
      // Regular file — pass through
      expandedSources.push(source);
      continue;
    }

    // Directory: scan for supported files
    const entries = fs.readdirSync(resolvedInput);
    const supported = entries
      .filter((e) => SUPPORTED_EXTENSIONS.includes(path.extname(e).toLowerCase()))
      .sort();

    if (supported.length === 0) {
      throw new Error(
        `No supported files found in directory '${input}'.\n` +
        `  Supported extensions: .yaml, .yml, .json (OpenAPI) or .proto (gRPC)`,
      );
    }

    for (const file of supported) {
      const filePath = path.join(input, file); // keep relative — resolveConfigPaths handles it
      const expanded: Record<string, unknown> = { input: filePath };

      // Inherit output as directory: append {basename}.types.ts
      if (s.output) {
        const base = path.basename(file, path.extname(file));
        expanded.output = path.join(String(s.output), `${base}.types.ts`);
      }

      // Inherit options
      if (s.options) expanded.options = s.options;

      expandedSources.push(expanded);
    }
  }

  return {
    ...config,
    generate: { ...generate, sources: expandedSources },
  };
}

function resolveConfigPaths(config: Config, configDir: string): Config {
  if (!config.generate) return config;

  const sources = config.generate.sources.map((source) => {
    const resolved = { ...source };

    if (typeof resolved.input === 'string') {
      resolved.input = path.resolve(configDir, resolved.input);
    } else if (Array.isArray(resolved.input)) {
      resolved.input = resolved.input.map((p) => path.resolve(configDir, p));
    }

    if (resolved.output) {
      resolved.output = path.resolve(configDir, resolved.output);
    }

    if (resolved.type === 'grpc' && resolved.options?.includeDirs) {
      resolved.options = {
        ...resolved.options,
        includeDirs: resolved.options.includeDirs.map((d) => path.resolve(configDir, d)),
      };
    }

    return resolved;
  });

  return {
    ...config,
    generate: { sources },
  };
}
