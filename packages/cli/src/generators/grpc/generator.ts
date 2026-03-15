import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Generator, GeneratorContext, GeneratedFile } from '../types.js';
import type { GrpcSource } from '../../config/schema.js';
import { parseProtoFile } from './proto-parser.js';
import { emitGrpcSchemas } from './emitter.js';

export class GrpcGenerator implements Generator<GrpcSource> {
  readonly name = 'grpc';

  async generate(context: GeneratorContext<GrpcSource>): Promise<GeneratedFile[]> {
    const source = context.source;
    const inputs = Array.isArray(source.input) ? source.input : [source.input];
    if (!source.output) {
      throw new Error('Output path is required. This is resolved by the CLI before calling the generator.');
    }
    const outputPath = path.resolve(context.rootDir, source.output);

    // Validate inputs exist
    for (const input of inputs) {
      const inputPath = path.resolve(context.rootDir, input);
      if (!existsSync(inputPath)) {
        throw new Error(
          `Proto file not found: ${inputPath}\n` +
          `  Check the 'input' path in your config.`,
        );
      }
    }

    const resolvedInputs = inputs.map((p) => path.resolve(context.rootDir, p));
    const optionName = source.options?.metadata?.optionName ?? 'required_headers';
    const includeDirs = source.options?.includeDirs;

    context.logger.info(`Parsing proto file(s): ${inputs.join(', ')}`);

    // Step 1: Parse proto files
    const { services, messages, enums } = await parseProtoFile(
      resolvedInputs,
      optionName,
      includeDirs,
    );

    context.logger.debug(`Found ${services.length} service(s), ${messages.size} message(s), ${enums.size} enum(s)`);

    // Step 2: Filter services if config specifies
    let filteredServices = services;
    if (source.options?.services) {
      const allowed = new Set(source.options.services);
      filteredServices = services.filter((s) => allowed.has(s.name));
      context.logger.debug(`Filtered to ${filteredServices.length} service(s)`);
    }

    if (filteredServices.length === 0) {
      context.logger.warn('No services found to generate. Check your config.');
      return [];
    }

    // Step 3: Filter streaming methods if disabled
    if (source.options?.streaming === false) {
      filteredServices = filteredServices.map((svc) => ({
        ...svc,
        methods: svc.methods.filter((m) => !m.requestStreaming && !m.responseStreaming),
      }));
    }

    // Step 4: Emit schemas
    const inputDisplay = typeof source.input === 'string' ? source.input : source.input[0];
    const result = emitGrpcSchemas(filteredServices, messages, enums, inputDisplay);

    // Step 5: Assemble output
    const sections: string[] = [
      "import { z } from 'zod';",
      '',
    ];

    if (result.enums.trim()) {
      sections.push('// ===== Enums =====');
      sections.push('');
      sections.push(result.enums);
    }

    if (result.schemas.trim()) {
      sections.push('// ===== Zod Schemas =====');
      sections.push('');
      sections.push(result.schemas);
    }

    if (result.metadataSchemas.trim()) {
      sections.push('// ===== Metadata Schemas =====');
      sections.push('');
      sections.push(result.metadataSchemas);
    }

    if (result.streamSchemas.trim()) {
      sections.push('// ===== Streaming Message Schemas =====');
      sections.push('');
      sections.push(result.streamSchemas);
    }

    if (result.serviceInterface.trim()) {
      sections.push('// ===== Testurio Service Type =====');
      sections.push('');
      sections.push(result.serviceInterface);
    }

    if (result.typeHelpers.trim()) {
      sections.push('// ===== Type Helpers =====');
      sections.push('');
      sections.push(result.typeHelpers);
      sections.push('');
    }

    return [
      {
        path: outputPath,
        content: sections.join('\n'),
      },
    ];
  }
}
