import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { OpenApiSource } from "@testurio/cli/config/schema";
import { OpenApiGenerator } from "@testurio/cli/generators/openapi/generator";
import { createLogger } from "@testurio/cli/utils/logger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/openapi-invalid");
const VALID_FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const TEMP_DIR = path.resolve(__dirname, "../.temp-openapi-validation-test");

async function generate(inputPath: string): Promise<void> {
	const generator = new OpenApiGenerator();
	const logger = createLogger({ quiet: true });
	const source: OpenApiSource = {
		type: "openapi",
		input: inputPath,
		output: path.join(TEMP_DIR, `${path.basename(inputPath)}.ts`),
	};
	await generator.generate({ source, rootDir: process.cwd(), logger });
}

describe("OpenAPI Validation Error Reporting", () => {
	beforeAll(async () => {
		await mkdir(TEMP_DIR, { recursive: true });
	});

	afterAll(async () => {
		if (existsSync(TEMP_DIR)) {
			await rm(TEMP_DIR, { recursive: true, force: true });
		}
	});

	describe("schema validation errors", () => {
		it("reports a single validation error with its JSON-pointer path", async () => {
			const input = path.join(FIXTURES_DIR, "missing-description.yaml");

			await expect(generate(input)).rejects.toThrowError(/Invalid OpenAPI spec/);
			await expect(generate(input)).rejects.toThrowError(/Input:.*missing-description\.yaml/);
			await expect(generate(input)).rejects.toThrowError(/\/paths\/~1pets\/get\/responses\/200/);
			await expect(generate(input)).rejects.toThrowError(/required property 'description'/);
		});

		it("aggregates multiple validation errors in one message", async () => {
			const input = path.join(FIXTURES_DIR, "multi-error.yaml");

			let caught: Error | undefined;
			try {
				await generate(input);
			} catch (err) {
				caught = err as Error;
			}

			expect(caught).toBeDefined();
			const msg = caught?.message ?? "";
			expect(msg).toMatch(/Invalid OpenAPI spec/);
			expect(msg).toMatch(/Found \d+ error\(s\)/);
			// Each of the three real issues must be named in the aggregated output.
			expect(msg).toMatch(/\/info.*version/);
			expect(msg).toMatch(/\/paths\/~1pets\/get\/responses\/200.*description/);
			expect(msg).toMatch(/\/paths\/~1pets\/post\/requestBody.*content/);
			// Numbered list format
			expect(msg).toMatch(/^\s*1\./m);
			expect(msg).toMatch(/^\s*2\./m);
		});

		it("reports a broken $ref with the missing token name", async () => {
			const input = path.join(FIXTURES_DIR, "bad-ref.yaml");

			let caught: Error | undefined;
			try {
				await generate(input);
			} catch (err) {
				caught = err as Error;
			}

			expect(caught).toBeDefined();
			const msg = caught?.message ?? "";
			// Either the validator catches it (Invalid OpenAPI spec) or it bubbles up
			// from the bundle step (Failed to bundle OpenAPI spec). Both must name
			// the missing token so the user can find the broken $ref.
			expect(msg).toMatch(/DoesNotExist/);
			expect(msg).toMatch(/(Invalid OpenAPI spec|Failed to bundle)/);
		});
	});

	describe("parse errors", () => {
		it("reports a broken YAML file with path and line:col", async () => {
			const input = path.join(FIXTURES_DIR, "broken.yaml");

			let caught: Error | undefined;
			try {
				await generate(input);
			} catch (err) {
				caught = err as Error;
			}

			expect(caught).toBeDefined();
			const msg = caught?.message ?? "";
			expect(msg).toMatch(/Failed to parse YAML/);
			expect(msg).toMatch(/broken\.yaml:\d+:\d+/);
		});

		it("reports a broken JSON file with path and line:col", async () => {
			const input = path.join(FIXTURES_DIR, "broken.json");

			let caught: Error | undefined;
			try {
				await generate(input);
			} catch (err) {
				caught = err as Error;
			}

			expect(caught).toBeDefined();
			const msg = caught?.message ?? "";
			expect(msg).toMatch(/Failed to parse JSON/);
			expect(msg).toMatch(/broken\.json:\d+:\d+/);
		});
	});

	describe("valid spec regression", () => {
		it("does not throw for the petstore fixture", async () => {
			const input = path.join(VALID_FIXTURES_DIR, "petstore.yaml");
			await expect(generate(input)).resolves.not.toThrow();
		}, 60000);
	});
});
