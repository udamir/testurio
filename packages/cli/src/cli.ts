import path from 'node:path';
import { Command } from 'commander';
import { loadConfig } from './config/loader.js';
import { createLogger } from './utils/logger.js';
import { writeGeneratedFiles } from './output/writer.js';
import { detectSourceType, resolveInputs } from './config/schema.js';
import type { GeneratedFile } from './generators/types.js';
import type { OpenApiSource, GrpcSource } from './config/schema.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('testurio')
    .description('Testurio CLI - Generate type-safe schemas for testing')
    .version('0.4.0');

  program
    .command('generate')
    .description('Generate TypeScript types and Zod schemas from API specifications')
    .argument('[inputs...]', 'Input files or directories (.yaml, .yml, .json for OpenAPI; .proto for gRPC)')
    .option('-c, --config <path>', 'Path to config file')
    .option('-o, --output <path>', 'Output file or directory (default: {input}.types.ts)')
    .option('--quiet', 'Suppress non-error output')
    .option('--verbose', 'Enable debug output')
    .action(async (inputs: string[], options) => {
      const logger = createLogger({
        quiet: options.quiet,
        verbose: options.verbose,
      });

      try {
        await runGenerate(inputs, options, logger);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  program
    .command('init')
    .description('Create a starter testurio.config.ts')
    .action(async () => {
      const logger = createLogger();
      try {
        await runInit(logger);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  return program;
}

async function runGenerate(
  inputs: string[],
  options: {
    config?: string;
    output?: string;
    quiet?: boolean;
    verbose?: boolean;
  },
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (inputs.length > 0) {
    // Inline mode: generate from positional args
    const sources = buildSourcesFromInputs(inputs, options.output);
    for (const source of sources) {
      await generateFromSource(source, process.cwd(), logger);
    }
    return;
  }

  // Config mode: load config file
  const { config, filepath } = await loadConfig(options.config);
  logger.info(`Using config: ${filepath}`);

  if (!config.generate?.sources.length) {
    logger.warn('No sources defined in config. Nothing to generate.');
    return;
  }

  let hasError = false;
  for (const source of config.generate.sources) {
    try {
      await generateFromSource(source, process.cwd(), logger);
    } catch (err) {
      logger.error(`Failed to generate from ${source.input}: ${err instanceof Error ? err.message : String(err)}`);
      hasError = true;
    }
  }

  if (hasError) {
    throw new Error('Some sources failed to generate. See errors above.');
  }
}

export function buildSourcesFromInputs(
  inputs: string[],
  output?: string,
): Array<OpenApiSource | GrpcSource> {
  if (inputs.length === 0) return [];

  const resolvedFiles = resolveInputs(inputs);

  return resolvedFiles.map((input) => {
    const type = detectSourceType(input);
    let resolvedOutput: string;

    if (output) {
      if (resolvedFiles.length > 1) {
        const base = path.basename(input, path.extname(input));
        resolvedOutput = path.join(output, `${base}.types.ts`);
      } else {
        resolvedOutput = output;
      }
    } else {
      resolvedOutput = resolveOutputPath(input);
    }

    if (type === 'openapi') {
      return { type, input, output: resolvedOutput } satisfies OpenApiSource;
    }
    return { type, input, output: resolvedOutput } satisfies GrpcSource;
  });
}

export function resolveOutputPath(input: string | string[]): string {
  const primaryInput = Array.isArray(input) ? input[0] : input;
  const dir = path.dirname(primaryInput);
  const base = path.basename(primaryInput, path.extname(primaryInput));
  return path.join(dir, `${base}.types.ts`);
}

async function generateFromSource(
  source: OpenApiSource | GrpcSource,
  rootDir: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const resolvedSource = {
    ...source,
    output: source.output ?? resolveOutputPath(source.input),
  };

  const generatorLogger = createLogger({
    prefix: resolvedSource.type,
  });

  logger.info(`Generating from ${resolvedSource.type}: ${typeof resolvedSource.input === 'string' ? resolvedSource.input : resolvedSource.input.join(', ')}`);

  let files: GeneratedFile[];

  if (resolvedSource.type === 'openapi') {
    const { OpenApiGenerator } = await import('./generators/openapi/generator.js');
    const generator = new OpenApiGenerator();
    files = await generator.generate({ source: resolvedSource, rootDir, logger: generatorLogger });
  } else {
    const { GrpcGenerator } = await import('./generators/grpc/generator.js');
    const generator = new GrpcGenerator();
    files = await generator.generate({ source: resolvedSource, rootDir, logger: generatorLogger });
  }

  const inputPath = typeof resolvedSource.input === 'string' ? resolvedSource.input : resolvedSource.input[0];
  await writeGeneratedFiles(files, inputPath, logger);

  logger.success(`Generated ${files.length} file(s) for ${resolvedSource.type}`);
}

async function runInit(logger: ReturnType<typeof createLogger>): Promise<void> {
  const { existsSync } = await import('node:fs');
  const { writeFile } = await import('node:fs/promises');
  const path = await import('node:path');

  const configPath = path.resolve(process.cwd(), 'testurio.config.ts');

  if (existsSync(configPath)) {
    logger.warn(`Config file already exists: ${configPath}`);
    logger.info('Delete it first if you want to regenerate.');
    return;
  }

  const template = `import { defineConfig } from '@testurio/cli';

export default defineConfig({
  generate: {
    sources: [
      {
        input: './api/openapi.yaml',    // OpenAPI spec (auto-detected from .yaml)
      },
      {
        input: './proto/service.proto',  // Proto file (auto-detected from .proto)
      },
    ],
  },
});
`;

  await writeFile(configPath, template, 'utf-8');
  logger.success(`Created ${configPath}`);
  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Update the input paths in testurio.config.ts');
  logger.info('  2. Run: testurio generate');
}
