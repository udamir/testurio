import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { OpenApiGenerator } from '@testurio/cli/generators/openapi/generator';
import { GrpcGenerator } from '@testurio/cli/generators/grpc/generator';
import { createLogger } from '@testurio/cli/utils/logger';
import { writeGeneratedFiles } from '@testurio/cli/output/writer';
import {
  buildSourcesFromInputs,
  configSchema,
  expandDirectorySources,
} from '@testurio/cli';
import type { OpenApiSource, GrpcSource } from '@testurio/cli/config/schema';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const PROTO_DIR = path.resolve(__dirname, '../proto');
const TEMP_DIR = path.resolve(__dirname, '../.temp-multi-source-test');

describe('Multi-source generation', () => {
  beforeAll(async () => {
    await mkdir(TEMP_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (existsSync(TEMP_DIR)) {
      await rm(TEMP_DIR, { recursive: true, force: true });
    }
  });

  it('generates both OpenAPI and gRPC outputs from config', async () => {
    const logger = createLogger({ quiet: true });
    const openapiOutput = path.join(TEMP_DIR, 'api.ts');
    const grpcOutput = path.join(TEMP_DIR, 'service.ts');

    // Generate OpenAPI
    const openapiSource: OpenApiSource = {
      type: 'openapi',
      input: path.join(FIXTURES_DIR, 'petstore.yaml'),
      output: openapiOutput,
    };

    const openapiGenerator = new OpenApiGenerator();
    const openapiFiles = await openapiGenerator.generate({
      source: openapiSource,
      rootDir: process.cwd(),
      logger,
    });

    // Generate gRPC
    const grpcSource: GrpcSource = {
      type: 'grpc',
      input: path.join(PROTO_DIR, 'test-service.proto'),
      output: grpcOutput,
      options: {
        services: ['TestService'],
      },
    };

    const grpcGenerator = new GrpcGenerator();
    const grpcFiles = await grpcGenerator.generate({
      source: grpcSource,
      rootDir: process.cwd(),
      logger,
    });

    // Write both outputs
    await writeGeneratedFiles(openapiFiles, openapiSource.input, logger);
    await writeGeneratedFiles(grpcFiles, grpcSource.input, logger);

    // Verify both files exist
    expect(existsSync(openapiOutput)).toBe(true);
    expect(existsSync(grpcOutput)).toBe(true);

    // Verify OpenAPI output content
    const openapiContent = await readFile(openapiOutput, 'utf-8');
    expect(openapiContent).toContain('export interface PetStore');
    expect(openapiContent).toContain('export const operations');

    // Verify OpenAPI protocol schema bridge
    expect(openapiContent).toContain('export const petStoreSchema');
    expect(openapiContent).toContain('// ===== Protocol Schema =====');
    expect(openapiContent).toContain('z.literal(');
    expect(openapiContent).toContain('z.object({');

    // Verify path parameter handling: z.string() for parameterized, z.literal() for non-parameterized
    expect(openapiContent).toContain("path: z.string(),"); // getPetById has {petId}
    expect(openapiContent).toContain("path: z.literal('/pets'),"); // listPets + createPet have no path params

    // Verify header schema naming uses singular convention
    expect(openapiContent).not.toContain('HeadersSchema');

    // Verify OpenAPI singular section naming
    expect(openapiContent).toContain('// ===== Zod Schema =====');
    expect(openapiContent).not.toContain('// ===== Zod Schemas =====');

    // Verify OpenAPI doc comments — schema-first and current usage patterns
    expect(openapiContent).toContain('Schema-first (recommended');
    expect(openapiContent).toContain('new HttpProtocol({ schema: petStoreSchema })');
    expect(openapiContent).toContain('Current usage (explicit generic');
    expect(openapiContent).toContain('new HttpProtocol<PetStore>()');

    // Verify gRPC output content
    const grpcContent = await readFile(grpcOutput, 'utf-8');
    expect(grpcContent).toContain('export interface TestService');
    expect(grpcContent).toContain('getUserRequestSchema');

    // Verify gRPC protocol schema bridge
    expect(grpcContent).toContain('export const testServiceSchema');
    expect(grpcContent).toContain('// ===== Protocol Schema =====');
    expect(grpcContent).toContain('payload: getUserRequestSchema,');
    expect(grpcContent).toContain('payload: getUserResponseSchema,');

    // Verify gRPC singular section naming
    expect(grpcContent).toContain('// ===== Zod Schema =====');
    expect(grpcContent).not.toContain('// ===== Zod Schemas =====');
    expect(grpcContent).not.toContain('// ===== Metadata Schemas =====');

    // Verify gRPC doc comments — both schema-first and current usage patterns
    expect(grpcContent).toContain('Schema-first (recommended');
    expect(grpcContent).toContain('protoPath:');
    expect(grpcContent).toContain('Current usage (explicit generic');
  }, 60000);

  it('one source failing does not block the other', async () => {
    const logger = createLogger({ quiet: true });
    const openapiOutput = path.join(TEMP_DIR, 'api-independent.ts');
    const grpcOutput = path.join(TEMP_DIR, 'service-independent.ts');

    // Valid gRPC source
    const grpcSource: GrpcSource = {
      type: 'grpc',
      input: path.join(PROTO_DIR, 'test-service.proto'),
      output: grpcOutput,
    };

    // Invalid OpenAPI source (file doesn't exist)
    const openapiSource: OpenApiSource = {
      type: 'openapi',
      input: path.join(FIXTURES_DIR, 'nonexistent.yaml'),
      output: openapiOutput,
    };

    // OpenAPI should fail
    const openapiGenerator = new OpenApiGenerator();
    await expect(
      openapiGenerator.generate({
        source: openapiSource,
        rootDir: process.cwd(),
        logger,
      }),
    ).rejects.toThrow('not found');

    // gRPC should still succeed independently
    const grpcGenerator = new GrpcGenerator();
    const grpcFiles = await grpcGenerator.generate({
      source: grpcSource,
      rootDir: process.cwd(),
      logger,
    });

    expect(grpcFiles.length).toBeGreaterThan(0);
    expect(grpcFiles[0].content).toContain('export interface TestService');
  });

  describe('directory input — CLI mode', () => {
    it('resolves all supported files from a directory via buildSourcesFromInputs', () => {
      const sources = buildSourcesFromInputs([FIXTURES_DIR]);
      expect(sources.length).toBeGreaterThanOrEqual(2);

      const openApiSources = sources.filter((s) => s.type === 'openapi');
      const grpcSources = sources.filter((s) => s.type === 'grpc');

      expect(openApiSources.length).toBeGreaterThanOrEqual(1);
      expect(grpcSources.length).toBeGreaterThanOrEqual(1);

      // Each source should have an auto-derived output path
      for (const source of sources) {
        expect(source.output).toMatch(/\.schema\.ts$/);
      }
    });

    it('combines directory input with output directory', () => {
      const sources = buildSourcesFromInputs([FIXTURES_DIR], './out/');
      expect(sources.length).toBeGreaterThanOrEqual(2);

      for (const source of sources) {
        expect(source.output).toMatch(/^out[/\\]/);
        expect(source.output).toMatch(/\.schema\.ts$/);
      }
    });
  });

  describe('directory input — config mode', () => {
    it('expands directory source in config and auto-detects types', () => {
      const testsDir = path.resolve(__dirname, '..');
      const rawConfig = {
        generate: {
          sources: [{ input: './fixtures/' }],
        },
      };

      const expanded = expandDirectorySources(rawConfig, testsDir);
      const parsed = configSchema.safeParse(expanded);

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const sources = parsed.data.generate!.sources;
        expect(sources.length).toBeGreaterThanOrEqual(2);

        const types = sources.map((s) => s.type);
        expect(types).toContain('openapi');
        expect(types).toContain('grpc');
      }
    });

    it('inherits output directory for expanded config sources', () => {
      const testsDir = path.resolve(__dirname, '..');
      const rawConfig = {
        generate: {
          sources: [{ input: './fixtures/', output: './generated/' }],
        },
      };

      const expanded = expandDirectorySources(rawConfig, testsDir);
      const parsed = configSchema.safeParse(expanded);

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const sources = parsed.data.generate!.sources;
        for (const source of sources) {
          expect(source.output).toBeDefined();
          expect(source.output).toMatch(/generated[/\\]/);
          expect(source.output).toMatch(/\.schema\.ts$/);
        }
      }
    });
  });
});
