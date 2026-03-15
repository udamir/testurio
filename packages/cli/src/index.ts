export { defineConfig, configSchema, detectSourceType, resolveInputs, SUPPORTED_EXTENSIONS, OPENAPI_EXTENSIONS, PROTO_EXTENSIONS } from './config/schema.js';
export type { Config, ConfigInput, SourceInput, OpenApiSource, GrpcSource, GenerateConfig } from './config/schema.js';
export type { Generator, GeneratedFile, GeneratorContext, Logger } from './generators/types.js';
export { createCli, resolveOutputPath, buildSourcesFromInputs } from './cli.js';
export { loadConfig, expandDirectorySources } from './config/loader.js';
