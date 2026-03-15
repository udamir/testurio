import { existsSync } from "node:fs";
import path from "node:path";
import type { OpenApiSource } from "../../config/schema.js";
import type { GeneratedFile, Generator, GeneratorContext } from "../types.js";
import { buildOperationsMap, extractOperations } from "./operations-map.js";
import { generateZodSchemas } from "./orval-bridge.js";
import { bundleOpenApiSpec, readOpenApiSpec } from "./ref-bundler.js";

export class OpenApiGenerator implements Generator<OpenApiSource> {
	readonly name = "openapi";

	async generate(context: GeneratorContext<OpenApiSource>): Promise<GeneratedFile[]> {
		const source = context.source;
		const inputPath = path.resolve(context.rootDir, source.input);
		if (!source.output) {
			throw new Error("Output path is required. This is resolved by the CLI before calling the generator.");
		}
		const outputPath = path.resolve(context.rootDir, source.output);

		// Validate input exists
		if (!existsSync(inputPath)) {
			throw new Error(`OpenAPI spec not found: ${inputPath}\n  Check the 'input' path in your config.`);
		}

		context.logger.info("Reading OpenAPI spec...");

		// Step 1: Read and bundle the spec (resolves external $ref)
		const rawSpec = await readOpenApiSpec(inputPath);
		const bundledSpec = await bundleOpenApiSpec(inputPath);

		// Step 2: Generate Zod schemas via Orval
		context.logger.info("Generating Zod schemas...");
		const orvalResult = await generateZodSchemas(bundledSpec, source);
		context.logger.debug(
			`Found ${orvalResult.exportedNames.size} schema exports: ${[...orvalResult.exportedNames].join(", ")}`
		);

		// Step 3: Parse operations from spec
		const operations = extractOperations(rawSpec, context.logger);
		context.logger.debug(`Found ${operations.length} operations`);

		// Step 4: Build operations map and service type
		const result = buildOperationsMap(rawSpec, operations, orvalResult.exportedNames);

		// Step 5: Assemble output
		const sections: string[] = ["import { z } from 'zod';", ""];

		// Add Orval-generated Zod schemas (already normalized to use `z.`)
		if (orvalResult.schemasContent.trim()) {
			sections.push("// ===== Zod Schema =====");
			sections.push("");
			sections.push(orvalResult.schemasContent);
			sections.push("");
		}

		if (result.headerSchema) {
			sections.push(result.headerSchema);
			sections.push("");
		}

		if (source.options?.operationsMap !== false) {
			sections.push(result.operationsMap);
			sections.push("");
		}

		if (result.protocolSchema) {
			sections.push("// ===== Protocol Schema =====");
			sections.push("");
			sections.push(result.protocolSchema);
			sections.push("");
		}

		sections.push(result.serviceInterface);
		sections.push("");
		sections.push(result.typeHelpers);
		sections.push("");

		return [
			{
				path: outputPath,
				content: sections.join("\n"),
			},
		];
	}
}
