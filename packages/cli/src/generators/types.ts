import type { OpenApiSource, GrpcSource } from '../config/schema.js';

export interface GeneratedFile {
  /** Relative output path */
  path: string;
  /** Generated TypeScript source code */
  content: string;
}

export interface GeneratorContext<S extends OpenApiSource | GrpcSource = OpenApiSource | GrpcSource> {
  /** Resolved config for this source */
  source: S;
  /** Project root directory */
  rootDir: string;
  /** Logger instance */
  logger: Logger;
}

export interface Generator<S extends OpenApiSource | GrpcSource = OpenApiSource | GrpcSource> {
  /** Generator name for logging */
  readonly name: string;
  /** Generate TypeScript files from the source */
  generate(context: GeneratorContext<S>): Promise<GeneratedFile[]>;
}

export interface Logger {
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}
