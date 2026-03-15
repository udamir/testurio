import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { OpenApiGenerator } from '@testurio/cli/generators/openapi/generator';
import { createLogger } from '@testurio/cli/utils/logger';
import {
  extractOperations,
  extractOrvalSchemaNames,
  buildOperationsMap,
  deriveServiceName,
} from '@testurio/cli/generators/openapi/operations-map';
import { readOpenApiSpec } from '@testurio/cli/generators/openapi/ref-bundler';
import type { OpenApiSource } from '@testurio/cli/config/schema';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const TEMP_DIR = path.resolve(__dirname, '../.temp-openapi-test');

describe('OpenAPI Generator', () => {
  beforeAll(async () => {
    await mkdir(TEMP_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (existsSync(TEMP_DIR)) {
      await rm(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe('extractOperations', () => {
    it('extracts operations from petstore spec', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.operationId)).toEqual(['listPets', 'createPet', 'getPetById']);
    });

    it('extracts method and path correctly', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const listPets = ops.find((o) => o.operationId === 'listPets')!;
      expect(listPets.method).toBe('GET');
      expect(listPets.path).toBe('/pets');

      const createPet = ops.find((o) => o.operationId === 'createPet')!;
      expect(createPet.method).toBe('POST');
      expect(createPet.path).toBe('/pets');
    });

    it('extracts query parameters', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const listPets = ops.find((o) => o.operationId === 'listPets')!;
      expect(listPets.queryParams).toHaveLength(1);
      expect(listPets.queryParams[0].name).toBe('limit');
    });

    it('extracts header parameters', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const listPets = ops.find((o) => o.operationId === 'listPets')!;
      expect(listPets.headerParams).toHaveLength(2);
      expect(listPets.headerParams[0].name).toBe('Authorization');
      expect(listPets.headerParams[0].required).toBe(true);
      expect(listPets.headerParams[1].name).toBe('X-Request-Id');
      expect(listPets.headerParams[1].required).toBe(false);
    });

    it('extracts request body ref', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const createPet = ops.find((o) => o.operationId === 'createPet')!;
      expect(createPet.requestBodyRef).toBe('CreatePet');
    });

    it('extracts response schema refs and detects array responses', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const listPets = ops.find((o) => o.operationId === 'listPets')!;
      expect(listPets.responses[0].code).toBe('200');
      expect(listPets.responses[0].isArray).toBe(true);
      expect(listPets.responses[0].schemaRef).toBe('Pet');

      const getPetById = ops.find((o) => o.operationId === 'getPetById')!;
      expect(getPetById.responses[0].code).toBe('200');
      expect(getPetById.responses[0].isArray).toBe(false);
      expect(getPetById.responses[0].schemaRef).toBe('Pet');
    });
  });

  describe('extractOrvalSchemaNames', () => {
    it('extracts exported const names from Orval output', () => {
      const orvalOutput = `
export const listPetsResponseItem = z.object({
  id: z.number(),
  name: z.string(),
});
export const listPetsResponse = z.array(listPetsResponseItem);
export const createPetBody = z.object({
  name: z.string(),
});
`;
      const names = extractOrvalSchemaNames(orvalOutput);
      expect(names).toContain('listPetsResponseItem');
      expect(names).toContain('listPetsResponse');
      expect(names).toContain('createPetBody');
      expect(names.size).toBe(3);
    });
  });

  describe('deriveServiceName', () => {
    it('derives PascalCase name from spec title', () => {
      expect(deriveServiceName({ info: { title: 'Pet Store' } })).toBe('PetStore');
      expect(deriveServiceName({ info: { title: 'My API Service' } })).toBe('MyAPIService');
      expect(deriveServiceName({})).toBe('Api');
    });
  });

  describe('buildOperationsMap', () => {
    it('generates operations map referencing Orval-generated names', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      // Simulate Orval-generated export names
      const exportedNames = new Set([
        'listPetsQueryParams', 'listPetsHeader',
        'listPetsResponseItem', 'listPetsResponse',
        'createPetBody', 'createPetResponse',
        'getPetByIdParams', 'getPetByIdResponse',
      ]);

      const result = buildOperationsMap(
        spec as Record<string, unknown>,
        ops,
        exportedNames,
        logger,
      );

      // Operations map should reference Orval's generated names
      expect(result.operationsMap).toContain('listPetsQueryParams');
      expect(result.operationsMap).toContain('listPetsHeader');
      expect(result.operationsMap).toContain('listPetsResponse');
      expect(result.operationsMap).toContain('createPetBody');
      expect(result.operationsMap).toContain('getPetByIdResponse');
    });

    it('generates service interface with correct structure', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const exportedNames = new Set([
        'listPetsResponse', 'createPetBody', 'createPetResponse',
        'getPetByIdResponse',
      ]);

      const result = buildOperationsMap(
        spec as Record<string, unknown>,
        ops,
        exportedNames,
        logger,
      );

      expect(result.serviceInterface).toContain('export interface PetStore');
      expect(result.serviceInterface).toContain("method: 'GET'");
      expect(result.serviceInterface).toContain("path: '/pets'");
      expect(result.serviceInterface).toContain('z.infer<typeof createPetBody>');
      expect(result.serviceInterface).toContain('z.infer<typeof getPetByIdResponse>');
    });

    it('includes headers in service interface when header params present', async () => {
      const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, 'petstore.yaml'));
      const logger = createLogger({ quiet: true });
      const ops = extractOperations(spec as Record<string, unknown>, logger);

      const exportedNames = new Set(['listPetsHeader', 'listPetsResponse']);
      const result = buildOperationsMap(
        spec as Record<string, unknown>,
        ops,
        exportedNames,
        logger,
      );

      expect(result.serviceInterface).toContain('headers?:');
      expect(result.serviceInterface).toContain('Authorization: string');
      expect(result.serviceInterface).toContain("'X-Request-Id'?: string");
    });
  });

  describe('full generation', () => {
    it('generates valid TypeScript from petstore.yaml', async () => {
      const outputPath = path.join(TEMP_DIR, 'petstore-generated.ts');

      const generator = new OpenApiGenerator();
      const logger = createLogger({ quiet: true });

      const source: OpenApiSource = {
        type: 'openapi',
        input: path.join(FIXTURES_DIR, 'petstore.yaml'),
        output: outputPath,
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe(outputPath);

      const content = files[0].content;

      // Must have single z import
      expect(content).toContain("import { z } from 'zod'");

      // Must have Orval-generated schemas (normalized to z.)
      expect(content).toContain('z.object(');
      expect(content).toContain('z.number()');
      expect(content).toContain('z.string()');

      // Must have service interface
      expect(content).toContain('export interface PetStore');

      // Must have operations map
      expect(content).toContain('export const operations');

      // Must have correct method/path literals
      expect(content).toContain("method: 'GET'");
      expect(content).toContain("method: 'POST'");
      expect(content).toContain("path: '/pets'");
      expect(content).toContain("path: '/pets/{petId}'");

      // Must have type helpers
      expect(content).toContain('PetStoreOperations');
      expect(content).toContain('PetStoreOperationId');

      // Should NOT have raw `zod.` references (should be normalized to `z.`)
      expect(content).not.toMatch(/\bzod\./);
    }, 60000);

    it('generates from multi-file spec with external $ref', async () => {
      const outputPath = path.join(TEMP_DIR, 'petstore-split-generated.ts');

      const generator = new OpenApiGenerator();
      const logger = createLogger({ quiet: true });

      const source: OpenApiSource = {
        type: 'openapi',
        input: path.join(FIXTURES_DIR, 'petstore-split', 'openapi.yaml'),
        output: outputPath,
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      expect(files).toHaveLength(1);
      const content = files[0].content;

      // External $ref schemas should be resolved and present
      expect(content).toContain('z.object(');
      expect(content).toContain('z.number()');
      expect(content).toContain('z.string()');

      // Service interface should be generated from resolved spec
      expect(content).toContain('export interface PetStoreSplit');
      expect(content).toContain('export const operations');

      // All 3 operations should be present
      expect(content).toContain('listPets');
      expect(content).toContain('createPet');
      expect(content).toContain('getPetById');
    }, 60000);

    it('generated output passes tsc --noEmit', async () => {
      const { execSync } = await import('node:child_process');
      const { writeFile } = await import('node:fs/promises');

      const outputPath = path.join(TEMP_DIR, 'tsc-check.ts');

      const generator = new OpenApiGenerator();
      const logger = createLogger({ quiet: true });

      const source: OpenApiSource = {
        type: 'openapi',
        input: path.join(FIXTURES_DIR, 'petstore.yaml'),
        output: outputPath,
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      // Write the generated file with header
      const header = `/* eslint-disable */\n/* tslint:disable */\n`;
      await writeFile(outputPath, header + files[0].content, 'utf-8');

      // Write a temporary tsconfig that can resolve zod from the cli package
      const cliNodeModules = path.resolve(process.cwd(), 'packages/cli/node_modules');
      const tsconfigPath = path.join(TEMP_DIR, 'tsconfig.tsc-check.json');
      await writeFile(tsconfigPath, JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'CommonJS',
          moduleResolution: 'node',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          typeRoots: [path.join(cliNodeModules, '@types'), 'node_modules/@types'],
          baseUrl: cliNodeModules,
        },
        include: [outputPath],
      }), 'utf-8');

      // Run tsc --noEmit to verify TypeScript compilation
      const result = execSync(`npx tsc --project ${tsconfigPath} 2>&1 || true`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      // If tsc output contains errors, fail the test with the output
      if (result.includes('error TS')) {
        throw new Error(`tsc --noEmit failed on generated output:\n${result}`);
      }
    }, 60000);
  });
});
