export { buildSourcesFromInputs, createCli, resolveOutputPath } from "./cli.js";
export { expandDirectorySources, loadConfig } from "./config/loader.js";
export type { Config, ConfigInput, GenerateConfig, GrpcSource, OpenApiSource, SourceInput } from "./config/schema.js";
export {
	configSchema,
	defineConfig,
	detectSourceType,
	OPENAPI_EXTENSIONS,
	PROTO_EXTENSIONS,
	resolveInputs,
	SUPPORTED_EXTENSIONS,
} from "./config/schema.js";
export type { GeneratedFile, Generator, GeneratorContext, Logger } from "./generators/types.js";
