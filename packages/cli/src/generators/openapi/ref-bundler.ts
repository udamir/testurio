import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from 'api-ref-bundler';
import YAML from 'yaml';
import type { OpenApiSpec } from './operations-map.js';

/**
 * Bundle an OpenAPI spec, resolving all external $ref references into a single
 * self-contained document. Specs without external refs pass through unchanged.
 */
export async function bundleOpenApiSpec(specPath: string): Promise<object> {
  const resolvedPath = path.resolve(specPath);
  const specDir = path.dirname(resolvedPath);

  const resolver = async (sourcePath: string): Promise<object> => {
    const filePath = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(specDir, sourcePath);

    const content = await readFile(filePath, 'utf-8');
    return parseSpecContent(content, filePath);
  };

  const bundled = await bundle(resolvedPath, resolver);
  return bundled;
}

/**
 * Read and parse an OpenAPI spec file (YAML or JSON).
 */
export async function readOpenApiSpec(specPath: string): Promise<OpenApiSpec> {
  const content = await readFile(specPath, 'utf-8');
  return parseSpecContent(content, specPath);
}

function parseSpecContent(content: string, filePath: string): OpenApiSpec {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(content);
  }
  // YAML for .yaml, .yml, or anything else
  return YAML.parse(content);
}
