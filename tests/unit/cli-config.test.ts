import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  configSchema,
  defineConfig,
  resolveOutputPath,
  detectSourceType,
  resolveInputs,
  buildSourcesFromInputs,
  expandDirectorySources,
  SUPPORTED_EXTENSIONS,
  OPENAPI_EXTENSIONS,
  PROTO_EXTENSIONS,
} from '@testurio/cli';
import type { ConfigInput } from '@testurio/cli';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const TEMP_DIR = path.resolve(__dirname, '../.temp-cli-config-test');

describe('CLI Config Schema', () => {
  beforeAll(async () => {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });
    // Empty directory for testing
    await fs.promises.mkdir(path.join(TEMP_DIR, 'empty-dir'), { recursive: true });
    // Directory with only unsupported files
    await fs.promises.mkdir(path.join(TEMP_DIR, 'unsupported-dir'), { recursive: true });
    await fs.promises.writeFile(path.join(TEMP_DIR, 'unsupported-dir', 'README.md'), '# Test');
    await fs.promises.writeFile(path.join(TEMP_DIR, 'unsupported-dir', 'data.txt'), 'data');
    // Directory with nested subdirectory (for non-recursive test)
    await fs.promises.mkdir(path.join(TEMP_DIR, 'nested-dir', 'sub'), { recursive: true });
    await fs.promises.writeFile(path.join(TEMP_DIR, 'nested-dir', 'api.yaml'), 'openapi: 3.0.0');
    await fs.promises.writeFile(path.join(TEMP_DIR, 'nested-dir', 'sub', 'nested.yaml'), 'openapi: 3.0.0');
    // Mixed directory with supported and unsupported files
    await fs.promises.mkdir(path.join(TEMP_DIR, 'mixed-dir'), { recursive: true });
    await fs.promises.writeFile(path.join(TEMP_DIR, 'mixed-dir', 'api.yaml'), 'openapi: 3.0.0');
    await fs.promises.writeFile(path.join(TEMP_DIR, 'mixed-dir', 'service.proto'), 'syntax = "proto3";');
    await fs.promises.writeFile(path.join(TEMP_DIR, 'mixed-dir', 'README.md'), '# Test');
  });

  afterAll(async () => {
    if (fs.existsSync(TEMP_DIR)) {
      await fs.promises.rm(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe('detectSourceType', () => {
    it('detects .yaml as openapi', () => {
      expect(detectSourceType('api.yaml')).toBe('openapi');
    });

    it('detects .yml as openapi', () => {
      expect(detectSourceType('api.yml')).toBe('openapi');
    });

    it('detects .json as openapi', () => {
      expect(detectSourceType('api.json')).toBe('openapi');
    });

    it('detects .proto as grpc', () => {
      expect(detectSourceType('service.proto')).toBe('grpc');
    });

    it('is case insensitive', () => {
      expect(detectSourceType('api.YAML')).toBe('openapi');
      expect(detectSourceType('api.YML')).toBe('openapi');
      expect(detectSourceType('api.JSON')).toBe('openapi');
      expect(detectSourceType('service.PROTO')).toBe('grpc');
    });

    it('works with directory paths', () => {
      expect(detectSourceType('./dir/file.yaml')).toBe('openapi');
      expect(detectSourceType('/absolute/path/service.proto')).toBe('grpc');
    });

    it('throws for unknown extension', () => {
      expect(() => detectSourceType('file.txt')).toThrow('Cannot determine source type');
      expect(() => detectSourceType('file.txt')).toThrow('Supported:');
    });

    it('throws for file with no extension', () => {
      expect(() => detectSourceType('Makefile')).toThrow('Cannot determine source type');
    });
  });

  describe('resolveInputs', () => {
    it('passes through file paths as-is', () => {
      const result = resolveInputs(['a.yaml', 'b.proto']);
      expect(result).toEqual(['a.yaml', 'b.proto']);
    });

    it('expands directory with supported files', () => {
      const result = resolveInputs([FIXTURES_DIR]);
      expect(result).toContain(path.join(FIXTURES_DIR, 'chat-service.proto'));
      expect(result).toContain(path.join(FIXTURES_DIR, 'petstore.yaml'));
      // .types.ts files should NOT be included
      expect(result).not.toContain(path.join(FIXTURES_DIR, 'petstore.types.ts'));
      expect(result).not.toContain(path.join(FIXTURES_DIR, 'chat-service.types.ts'));
    });

    it('handles mixed inputs (files + directories)', () => {
      const result = resolveInputs(['extra.json', FIXTURES_DIR]);
      expect(result[0]).toBe('extra.json');
      expect(result.length).toBeGreaterThan(1);
      expect(result).toContain(path.join(FIXTURES_DIR, 'petstore.yaml'));
    });

    it('ignores unsupported files in directory', () => {
      const mixedDir = path.join(TEMP_DIR, 'mixed-dir');
      const result = resolveInputs([mixedDir]);
      expect(result).toHaveLength(2);
      expect(result).toContain(path.join(mixedDir, 'api.yaml'));
      expect(result).toContain(path.join(mixedDir, 'service.proto'));
    });

    it('throws for directory with no supported files', () => {
      const unsupportedDir = path.join(TEMP_DIR, 'unsupported-dir');
      expect(() => resolveInputs([unsupportedDir])).toThrow('No supported files found');
    });

    it('is non-recursive (does not scan subdirectories)', () => {
      const nestedDir = path.join(TEMP_DIR, 'nested-dir');
      const result = resolveInputs([nestedDir]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(path.join(nestedDir, 'api.yaml'));
    });

    it('sorts expanded files alphabetically', () => {
      const result = resolveInputs([FIXTURES_DIR]);
      const filenames = result.map((r) => path.basename(r));
      expect(filenames).toEqual([...filenames].sort());
    });
  });

  describe('expandDirectorySources', () => {
    const testsDir = path.resolve(__dirname, '..');

    it('expands directory input to individual file sources', () => {
      const rawConfig = {
        generate: {
          sources: [{ input: './fixtures/' }],
        },
      };

      const result = expandDirectorySources(rawConfig, testsDir) as Record<string, unknown>;
      const generate = result.generate as Record<string, unknown>;
      const sources = generate.sources as Array<Record<string, unknown>>;

      expect(sources.length).toBeGreaterThanOrEqual(2);
      const inputs = sources.map((s) => s.input);
      expect(inputs).toContain(path.join('./fixtures/', 'chat-service.proto'));
      expect(inputs).toContain(path.join('./fixtures/', 'petstore.yaml'));
    });

    it('inherits output as directory with basename', () => {
      const rawConfig = {
        generate: {
          sources: [{ input: './fixtures/', output: './generated/' }],
        },
      };

      const result = expandDirectorySources(rawConfig, testsDir) as Record<string, unknown>;
      const generate = result.generate as Record<string, unknown>;
      const sources = generate.sources as Array<Record<string, unknown>>;

      const outputs = sources.map((s) => s.output);
      expect(outputs).toContain(path.join('./generated/', 'chat-service.types.ts'));
      expect(outputs).toContain(path.join('./generated/', 'petstore.types.ts'));
    });

    it('inherits options to all expanded files', () => {
      const rawConfig = {
        generate: {
          sources: [
            {
              input: './fixtures/',
              options: { zod: { strict: { response: true } } },
            },
          ],
        },
      };

      const result = expandDirectorySources(rawConfig, testsDir) as Record<string, unknown>;
      const generate = result.generate as Record<string, unknown>;
      const sources = generate.sources as Array<Record<string, unknown>>;

      for (const source of sources) {
        expect(source.options).toEqual({ zod: { strict: { response: true } } });
      }
    });

    it('passes through non-directory source unchanged', () => {
      const rawConfig = {
        generate: {
          sources: [{ input: './api.yaml', output: './out.ts' }],
        },
      };

      const result = expandDirectorySources(rawConfig, testsDir) as Record<string, unknown>;
      const generate = result.generate as Record<string, unknown>;
      const sources = generate.sources as Array<Record<string, unknown>>;

      expect(sources).toHaveLength(1);
      expect(sources[0].input).toBe('./api.yaml');
      expect(sources[0].output).toBe('./out.ts');
    });

    it('throws for empty directory', () => {
      const rawConfig = {
        generate: {
          sources: [{ input: './empty-dir' }],
        },
      };

      expect(() => expandDirectorySources(rawConfig, TEMP_DIR)).toThrow('No supported files found');
    });

    it('passes through array input (gRPC multi-file) unchanged', () => {
      const rawConfig = {
        generate: {
          sources: [{ input: ['./proto/a.proto', './proto/b.proto'] }],
        },
      };

      const result = expandDirectorySources(rawConfig, testsDir) as Record<string, unknown>;
      const generate = result.generate as Record<string, unknown>;
      const sources = generate.sources as Array<Record<string, unknown>>;

      expect(sources).toHaveLength(1);
      expect(sources[0].input).toEqual(['./proto/a.proto', './proto/b.proto']);
    });

    it('returns non-config objects unchanged', () => {
      expect(expandDirectorySources(null, '/dir')).toBe(null);
      expect(expandDirectorySources('string', '/dir')).toBe('string');
      expect(expandDirectorySources({}, '/dir')).toEqual({});
    });
  });

  describe('auto-detection via configSchema', () => {
    it('auto-detects openapi from .yaml extension', () => {
      const config = {
        generate: {
          sources: [{ input: './api.yaml' }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generate?.sources[0].type).toBe('openapi');
      }
    });

    it('auto-detects openapi from .yml extension', () => {
      const config = {
        generate: {
          sources: [{ input: './api.yml' }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generate?.sources[0].type).toBe('openapi');
      }
    });

    it('auto-detects openapi from .json extension', () => {
      const config = {
        generate: {
          sources: [{ input: './api.json' }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generate?.sources[0].type).toBe('openapi');
      }
    });

    it('auto-detects grpc from .proto extension', () => {
      const config = {
        generate: {
          sources: [{ input: './service.proto' }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generate?.sources[0].type).toBe('grpc');
      }
    });

    it('auto-detects from first element of array input', () => {
      const config = {
        generate: {
          sources: [{ input: ['./a.proto', './b.proto'] }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generate?.sources[0].type).toBe('grpc');
      }
    });

    it('rejects source with unsupported extension when auto-detecting', () => {
      const config = {
        generate: {
          sources: [{ input: './data.csv' }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('preserves explicit type when provided', () => {
      const config = {
        generate: {
          sources: [{ type: 'openapi', input: './api.yaml' }],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generate?.sources[0].type).toBe('openapi');
      }
    });
  });

  describe('valid configs', () => {
    it('accepts a config with an openapi source', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './api/openapi.yaml',
              output: './generated/api.ts',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts a config with a grpc source', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './proto/service.proto',
              output: './generated/service.ts',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts a config with multiple sources', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './api/openapi.yaml',
              output: './generated/api.ts',
            },
            {
              input: './proto/service.proto',
              output: './generated/service.ts',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts grpc source with array input', () => {
      const config = {
        generate: {
          sources: [
            {
              input: ['./proto/a.proto', './proto/b.proto'],
              output: './generated/service.ts',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts openapi source with full options', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './api/openapi.yaml',
              output: './generated/api.ts',
              options: {
                zod: {
                  strict: { response: true, body: true },
                  coerce: { query: true, params: true },
                },
                operationsMap: true,
                errorSchemaName: 'apiErrorSchema',
              },
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts grpc source with full options', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './proto/service.proto',
              output: './generated/service.ts',
              options: {
                services: ['UserService'],
                streaming: true,
                includeDirs: ['./proto'],
                metadata: {
                  optionName: 'required_headers',
                },
              },
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts openapi source without output', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './api/petstore.yaml',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        const source = result.data.generate?.sources[0];
        expect(source?.output).toBeUndefined();
      }
    });

    it('accepts grpc source without output', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './proto/service.proto',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        const source = result.data.generate?.sources[0];
        expect(source?.output).toBeUndefined();
      }
    });

    it('accepts empty config (no generate section)', () => {
      const config = {};
      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('applies default for grpc streaming option', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './proto/service.proto',
              output: './generated/service.ts',
              options: {},
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        const grpcSource = result.data.generate?.sources[0];
        expect(grpcSource?.type).toBe('grpc');
        if (grpcSource?.type === 'grpc') {
          expect(grpcSource.options?.streaming).toBe(true);
        }
      }
    });

    it('applies default for openapi operationsMap option', () => {
      const config = {
        generate: {
          sources: [
            {
              input: './api.yaml',
              output: './out.ts',
              options: {},
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        const source = result.data.generate?.sources[0];
        if (source?.type === 'openapi') {
          expect(source.options?.operationsMap).toBe(true);
        }
      }
    });
  });

  describe('invalid configs', () => {
    it('rejects source with invalid type', () => {
      const config = {
        generate: {
          sources: [
            {
              type: 'invalid',
              input: './spec.yaml',
              output: './out.ts',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects source missing input', () => {
      const config = {
        generate: {
          sources: [
            {
              type: 'openapi',
              output: './out.ts',
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects source with invalid input type', () => {
      const config = {
        generate: {
          sources: [
            {
              type: 'grpc',
              input: 123,
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects generate section without sources array', () => {
      const config = {
        generate: {},
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('defineConfig', () => {
    it('returns the config object as-is', () => {
      const config: ConfigInput = {
        generate: {
          sources: [
            {
              input: './api.yaml',
              output: './out.ts',
            },
          ],
        },
      };

      const result = defineConfig(config);
      expect(result).toEqual(config);
    });

    it('accepts config without type fields', () => {
      const config = defineConfig({
        generate: {
          sources: [
            {
              input: './service.proto',
              output: './out.ts',
            },
          ],
        },
      });

      expect(config.generate?.sources).toHaveLength(1);
    });
  });

  describe('resolveOutputPath', () => {
    it('derives .types.ts from yaml input', () => {
      expect(resolveOutputPath('petstore.yaml')).toBe('petstore.types.ts');
    });

    it('derives .types.ts from proto input', () => {
      expect(resolveOutputPath('service.proto')).toBe('service.types.ts');
    });

    it('preserves directory path', () => {
      expect(resolveOutputPath('./api/petstore.yaml')).toBe(
        path.join('api', 'petstore.types.ts'),
      );
    });

    it('preserves nested directory path', () => {
      expect(resolveOutputPath('./specs/v2/api.json')).toBe(
        path.join('specs', 'v2', 'api.types.ts'),
      );
    });

    it('handles filename with multiple dots', () => {
      expect(resolveOutputPath('api.v2.yaml')).toBe('api.v2.types.ts');
    });

    it('uses first element for array input', () => {
      expect(resolveOutputPath(['./proto/a.proto', './proto/b.proto'])).toBe(
        path.join('proto', 'a.types.ts'),
      );
    });
  });

  describe('buildSourcesFromInputs', () => {
    it('produces correct output paths for multiple inputs with output directory', () => {
      const sources = buildSourcesFromInputs(['a.yaml', 'b.proto'], './out/');
      expect(sources).toHaveLength(2);
      expect(sources[0]).toEqual({
        type: 'openapi',
        input: 'a.yaml',
        output: path.join('out', 'a.types.ts'),
      });
      expect(sources[1]).toEqual({
        type: 'grpc',
        input: 'b.proto',
        output: path.join('out', 'b.types.ts'),
      });
    });

    it('treats output as file path for single input', () => {
      const sources = buildSourcesFromInputs(['api.yaml'], './custom-output.ts');
      expect(sources).toHaveLength(1);
      expect(sources[0].output).toBe('./custom-output.ts');
    });

    it('derives output from input when no output specified', () => {
      const sources = buildSourcesFromInputs(['./api/petstore.yaml']);
      expect(sources).toHaveLength(1);
      expect(sources[0].output).toBe(path.join('api', 'petstore.types.ts'));
    });

    it('auto-detects source type from file extension', () => {
      const sources = buildSourcesFromInputs(['api.yaml', 'api.json', 'service.proto']);
      expect(sources[0].type).toBe('openapi');
      expect(sources[1].type).toBe('openapi');
      expect(sources[2].type).toBe('grpc');
    });

    it('expands directory inputs via resolveInputs', () => {
      const sources = buildSourcesFromInputs([FIXTURES_DIR]);
      expect(sources.length).toBeGreaterThanOrEqual(2);
      const types = sources.map((s) => s.type);
      expect(types).toContain('openapi');
      expect(types).toContain('grpc');
    });

    it('returns empty array for no inputs', () => {
      expect(buildSourcesFromInputs([])).toEqual([]);
    });

    it('uses expanded file count for output-as-directory logic', () => {
      // A single directory that expands to multiple files should treat output as directory
      const mixedDir = path.join(TEMP_DIR, 'mixed-dir');
      const sources = buildSourcesFromInputs([mixedDir], './out/');
      expect(sources.length).toBe(2);
      for (const source of sources) {
        expect(source.output).toMatch(/^out[/\\]/);
        expect(source.output).toMatch(/\.types\.ts$/);
      }
    });
  });

  describe('extension constants', () => {
    it('OPENAPI_EXTENSIONS contains expected values', () => {
      expect(OPENAPI_EXTENSIONS).toContain('.yaml');
      expect(OPENAPI_EXTENSIONS).toContain('.yml');
      expect(OPENAPI_EXTENSIONS).toContain('.json');
    });

    it('PROTO_EXTENSIONS contains expected values', () => {
      expect(PROTO_EXTENSIONS).toContain('.proto');
    });

    it('SUPPORTED_EXTENSIONS is union of openapi and proto', () => {
      expect(SUPPORTED_EXTENSIONS).toEqual([...OPENAPI_EXTENSIONS, ...PROTO_EXTENSIONS]);
    });
  });
});
