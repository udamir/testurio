import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenApiSource } from "@testurio/cli/config/schema";
import { OpenApiGenerator } from "@testurio/cli/generators/openapi/generator";
import type { OpenApiSpec } from "@testurio/cli/generators/openapi/operations-map";
import {
	assertNoOperationIdCollisions,
	buildOperationsMap,
	deriveOperationId,
	deriveServiceName,
	extractOperations,
	extractOrvalSchemaNames,
	synthesizeOperationIds,
} from "@testurio/cli/generators/openapi/operations-map";
import { readOpenApiSpec } from "@testurio/cli/generators/openapi/ref-bundler";
import { createLogger } from "@testurio/cli/utils/logger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const TEMP_DIR = path.resolve(__dirname, "../.temp-openapi-test");

describe("OpenAPI Generator", () => {
	beforeAll(async () => {
		await mkdir(TEMP_DIR, { recursive: true });
	});

	afterAll(async () => {
		if (existsSync(TEMP_DIR)) {
			await rm(TEMP_DIR, { recursive: true, force: true });
		}
	});

	describe("extractOperations", () => {
		it("extracts operations from petstore spec", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			expect(ops).toHaveLength(3);
			expect(ops.map((o) => o.operationId)).toEqual(["listPets", "createPet", "getPetById"]);
		});

		it("extracts method and path correctly", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const listPets = ops.find((o) => o.operationId === "listPets");
			expect(listPets).toBeDefined();
			expect(listPets?.method).toBe("GET");
			expect(listPets?.path).toBe("/pets");

			const createPet = ops.find((o) => o.operationId === "createPet");
			expect(createPet).toBeDefined();
			expect(createPet?.method).toBe("POST");
			expect(createPet?.path).toBe("/pets");
		});

		it("extracts query parameters", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const listPets = ops.find((o) => o.operationId === "listPets");
			expect(listPets).toBeDefined();
			expect(listPets?.queryParams).toHaveLength(1);
			expect(listPets?.queryParams[0].name).toBe("limit");
		});

		it("extracts header parameters", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const listPets = ops.find((o) => o.operationId === "listPets");
			expect(listPets).toBeDefined();
			expect(listPets?.headerParams).toHaveLength(2);
			expect(listPets?.headerParams[0].name).toBe("Authorization");
			expect(listPets?.headerParams[0].required).toBe(true);
			expect(listPets?.headerParams[1].name).toBe("X-Request-Id");
			expect(listPets?.headerParams[1].required).toBe(false);
		});

		it("extracts request body ref", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const createPet = ops.find((o) => o.operationId === "createPet");
			expect(createPet).toBeDefined();
			expect(createPet?.requestBodyRef).toBe("CreatePet");
		});

		it("extracts response schema refs and detects array responses", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const listPets = ops.find((o) => o.operationId === "listPets");
			expect(listPets).toBeDefined();
			expect(listPets?.responses[0].code).toBe("200");
			expect(listPets?.responses[0].isArray).toBe(true);
			expect(listPets?.responses[0].schemaRef).toBe("Pet");

			const getPetById = ops.find((o) => o.operationId === "getPetById");
			expect(getPetById).toBeDefined();
			expect(getPetById?.responses[0].code).toBe("200");
			expect(getPetById?.responses[0].isArray).toBe(false);
			expect(getPetById?.responses[0].schemaRef).toBe("Pet");
		});
	});

	describe("extractOrvalSchemaNames", () => {
		it("extracts exported const names from Orval output", () => {
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
			expect(names).toContain("listPetsResponseItem");
			expect(names).toContain("listPetsResponse");
			expect(names).toContain("createPetBody");
			expect(names.size).toBe(3);
		});
	});

	describe("deriveServiceName", () => {
		it("derives PascalCase name from spec title", () => {
			expect(deriveServiceName({ info: { title: "Pet Store" } })).toBe("PetStore");
			expect(deriveServiceName({ info: { title: "My API Service" } })).toBe("MyAPIService");
			expect(deriveServiceName({})).toBe("Api");
		});
	});

	describe("buildOperationsMap", () => {
		it("generates operations map referencing Orval-generated names", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			// Simulate Orval-generated export names
			const exportedNames = new Set([
				"listPetsQueryParams",
				"listPetsHeader",
				"listPetsResponseItem",
				"listPetsResponse",
				"createPetBody",
				"createPetResponse",
				"getPetByIdParams",
				"getPetByIdResponse",
			]);

			const result = buildOperationsMap(spec as Record<string, unknown>, ops, exportedNames, logger);

			// Operations map should reference Orval's generated names
			expect(result.operationsMap).toContain("listPetsQueryParams");
			expect(result.operationsMap).toContain("listPetsHeader");
			expect(result.operationsMap).toContain("listPetsResponse");
			expect(result.operationsMap).toContain("createPetBody");
			expect(result.operationsMap).toContain("getPetByIdResponse");
		});

		it("emits a one-line service type alias derived from operations", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const exportedNames = new Set(["listPetsResponse", "createPetBody", "createPetResponse", "getPetByIdResponse"]);

			const result = buildOperationsMap(spec as Record<string, unknown>, ops, exportedNames, logger);

			// Unified shape: inline mapped type derived via z.infer — no testurio dependency.
			expect(result.serviceInterface).toContain("export type PetStore = {");
			expect(result.serviceInterface).toContain("[K in keyof typeof operations]");
			expect(result.serviceInterface).toContain('request: z.infer<(typeof operations)[K]["request"]>');
			expect(result.serviceInterface).toContain('response: z.infer<(typeof operations)[K]["response"]>');
			expect(result.serviceInterface).not.toContain("InferSyncService");
			expect(result.serviceInterface).not.toContain("export interface PetStore");

			// Method, path, body schemas appear inside the unified operationsMap (z.object-wrapped) now
			expect(result.operationsMap).toContain("method: z.literal('GET')");
			expect(result.operationsMap).toContain("path: z.literal('/pets')");
			expect(result.operationsMap).toContain("body: createPetBody");
			expect(result.operationsMap).toContain("body: getPetByIdResponse");
		});

		it("includes header schemas in the unified operations map when header params present", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			const exportedNames = new Set(["listPetsHeader", "listPetsResponse"]);
			const result = buildOperationsMap(spec as Record<string, unknown>, ops, exportedNames, logger);

			// Orval-named header schema is referenced inline (no separate generated header schema).
			expect(result.operationsMap).toContain("headers: listPetsHeader.optional()");
			expect(result.headerSchema).toBe("");
		});

		it("emits a generated header schema when Orval did not provide one", async () => {
			const spec = await readOpenApiSpec(path.join(FIXTURES_DIR, "petstore.yaml"));
			const logger = createLogger({ quiet: true });
			const ops = extractOperations(spec as Record<string, unknown>, logger);

			// No listPetsHeader in exports — generator should emit its own header schema.
			const exportedNames = new Set(["listPetsResponse"]);
			const result = buildOperationsMap(spec as Record<string, unknown>, ops, exportedNames, logger);

			expect(result.headerSchema).toContain("export const listPetsHeaderSchema");
			expect(result.headerSchema).toContain("Authorization: z.string()");
			expect(result.headerSchema).toContain("'X-Request-Id': z.string().optional()");
			expect(result.operationsMap).toContain("headers: listPetsHeaderSchema.optional()");
		});
	});

	describe("full generation", () => {
		it("generates valid TypeScript from petstore.yaml", async () => {
			const outputPath = path.join(TEMP_DIR, "petstore-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "petstore.yaml"),
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
			// Must NOT depend on testurio — generated file is self-contained (zod only)
			expect(content).not.toContain("from 'testurio'");
			expect(content).not.toContain("InferSyncService");

			// Must have Orval-generated schemas (normalized to z.)
			expect(content).toContain("z.object(");
			expect(content).toContain("z.number()");
			expect(content).toContain("z.string()");

			// Service type derived via inline mapped type + z.infer
			expect(content).toContain("export type PetStore = {");
			expect(content).toContain("[K in keyof typeof operations]");
			expect(content).toContain('z.infer<(typeof operations)[K]["request"]>');
			expect(content).not.toContain("export interface PetStore");
			// Standalone Protocol Schema artifact is gone
			expect(content).not.toContain("// ===== Protocol Schema =====");
			expect(content).not.toContain("export const petStoreSchema");

			// Must have unified operations map
			expect(content).toContain("export const operations");

			// Method/path literals appear inside z.literal() now
			expect(content).toContain("method: z.literal('GET')");
			expect(content).toContain("method: z.literal('POST')");
			expect(content).toContain("path: z.literal('/pets')");
			// getPetById has a path param — path is z.string() rather than a literal
			expect(content).toMatch(/getPetById:[\s\S]*?path:\s*z\.string\(\)/);

			// Must have type helpers
			expect(content).toContain("PetStoreOperations");
			expect(content).toContain("PetStoreOperationId");

			// Should NOT have raw `zod.` references (should be normalized to `z.`)
			expect(content).not.toMatch(/\bzod\./);
		}, 60000);

		it("generates from multi-file spec with external $ref", async () => {
			const outputPath = path.join(TEMP_DIR, "petstore-split-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "petstore-split", "openapi.yaml"),
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
			expect(content).toContain("z.object(");
			expect(content).toContain("z.number()");
			expect(content).toContain("z.string()");

			// Service type derived inline (no testurio dependency)
			expect(content).toContain("export type PetStoreSplit = {");
			expect(content).toContain('z.infer<(typeof operations)[K]["request"]>');
			expect(content).not.toContain("InferSyncService");
			expect(content).toContain("export const operations");

			// All 3 operations should be present
			expect(content).toContain("listPets");
			expect(content).toContain("createPet");
			expect(content).toContain("getPetById");
		}, 60000);

		it("generated output passes tsc --noEmit", async () => {
			const { execSync } = await import("node:child_process");

			const outputPath = path.join(TEMP_DIR, "tsc-check.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "petstore.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			// Write the generated file with header
			const header = `/* eslint-disable */\n/* tslint:disable */\n`;
			await writeFile(outputPath, header + files[0].content, "utf-8");

			// Write a temporary tsconfig that can resolve zod from the cli package
			const cliNodeModules = path.resolve(process.cwd(), "packages/cli/node_modules");
			const tsconfigPath = path.join(TEMP_DIR, "tsconfig.tsc-check.json");
			await writeFile(
				tsconfigPath,
				JSON.stringify({
					compilerOptions: {
						target: "ES2020",
						module: "CommonJS",
						moduleResolution: "node",
						strict: true,
						esModuleInterop: true,
						skipLibCheck: true,
						noEmit: true,
						typeRoots: [path.join(cliNodeModules, "@types"), "node_modules/@types"],
						baseUrl: cliNodeModules,
					},
					include: [outputPath],
				}),
				"utf-8"
			);

			// Run tsc --noEmit to verify TypeScript compilation
			const result = execSync(`npx tsc --project ${tsconfigPath} 2>&1 || true`, {
				cwd: process.cwd(),
				encoding: "utf-8",
			});

			// If tsc output contains errors, fail the test with the output
			if (result.includes("error TS")) {
				throw new Error(`tsc --noEmit failed on generated output:\n${result}`);
			}
		}, 60000);
	});

	describe("deriveOperationId", () => {
		const cases: Array<{ method: string; pathStr: string; expected: string }> = [
			{ method: "GET", pathStr: "/v1/accounts/{account-id}", expected: "v1getAccountsAccountId" },
			{ method: "DELETE", pathStr: "/v1/accounts/{account-id}", expected: "v1deleteAccountsAccountId" },
			{ method: "POST", pathStr: "/v1/orders", expected: "v1postOrders" },
			{ method: "GET", pathStr: "/v1/health/ping", expected: "v1getHealthPing" },
			{
				method: "GET",
				pathStr: "/v1/connection/{clientId}/drop",
				expected: "v1getConnectionClientIdDrop",
			},
			{ method: "GET", pathStr: "/{id}/things", expected: "getIdThings" },
			{ method: "POST", pathStr: "/users", expected: "postUsers" },
			{ method: "GET", pathStr: "/v1/server/performance", expected: "v1getServerPerformance" },
			{ method: "PUT", pathStr: "/v1/restart", expected: "v1putRestart" },
			{ method: "PATCH", pathStr: "/v1/users/{user-id}", expected: "v1patchUsersUserId" },
			{ method: "HEAD", pathStr: "/health", expected: "headHealth" },
			{ method: "OPTIONS", pathStr: "/v1/preflight", expected: "v1optionsPreflight" },
			{ method: "POST", pathStr: "/api.v2/items", expected: "postApiV2Items" },
		];

		for (const { method, pathStr, expected } of cases) {
			it(`derives ${expected} for ${method} ${pathStr}`, () => {
				expect(deriveOperationId(method, pathStr)).toBe(expected);
			});
		}
	});

	describe("synthesizeOperationIds end-to-end", () => {
		it("generates complete schema from a spec with zero operationIds", async () => {
			const outputPath = path.join(TEMP_DIR, "no-op-ids-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "no-operation-ids.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			expect(files).toHaveLength(1);
			const content = files[0].content;

			// All 6 synthesized operationIds must appear in the operations map AND service interface
			const synthesizedIds = [
				"v1getAccountsAccountId",
				"v1deleteAccountsAccountId",
				"v1postOrders",
				"v1getServerPerformance",
				"getHealth",
				"postUsers",
			];
			for (const id of synthesizedIds) {
				expect(content).toContain(`${id}:`);
			}

			// Orval should have produced body/response schemas derived from the synthesized ids.
			// Orval applies its own PascalCase to the first letter; verify the suffix portion
			// matches our synthesis so the two pipelines agree on the underlying operationId.
			//   v1postOrders → V1postOrdersBody
			//   v1getAccountsAccountId → V1getAccountsAccountIdResponse
			//   postUsers → PostUsersBody
			expect(content).toMatch(/V1postOrdersBody/i);
			expect(content).toMatch(/V1getAccountsAccountIdResponse/i);
			expect(content).toMatch(/PostUsersBody/i);
		}, 60000);
	});

	describe("collision detection", () => {
		it("throws when two paths synthesize to the same operationId", () => {
			// Both paths normalize to v1getFooBar via kebab vs nested-segment split.
			const spec: OpenApiSpec = {
				paths: {
					"/v1/foo-bar": {
						get: { responses: { "200": { description: "" } } },
					},
					"/v1/foo/bar": {
						get: { responses: { "200": { description: "" } } },
					},
				},
			};

			synthesizeOperationIds(spec);

			expect(() => assertNoOperationIdCollisions(spec)).toThrow(/Duplicate operationId 'v1getFooBar'/);
			expect(() => assertNoOperationIdCollisions(spec)).toThrow(/GET \/v1\/foo-bar/);
			expect(() => assertNoOperationIdCollisions(spec)).toThrow(/GET \/v1\/foo\/bar/);
		});

		it("throws when an explicit operationId collides with a synthesized one", async () => {
			// Construct a temp spec where /v1/orders has explicit operationId 'v1postUsers',
			// which would also be synthesized from POST /v1/users.
			const tempSpecPath = path.join(TEMP_DIR, "collision.yaml");
			const yaml = `openapi: 3.0.0
info:
  title: Collision Spec
  version: 1.0.0
paths:
  /v1/orders:
    post:
      operationId: v1postUsers
      responses:
        '200':
          description: ok
  /v1/users:
    post:
      responses:
        '200':
          description: ok
`;
			await writeFile(tempSpecPath, yaml, "utf-8");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: tempSpecPath,
				output: path.join(TEMP_DIR, "collision-generated.ts"),
			};

			await expect(
				generator.generate({
					source,
					rootDir: process.cwd(),
					logger,
				})
			).rejects.toThrow(/Duplicate operationId 'v1postUsers'/);
		}, 60000);
	});

	describe("Orval export normalization", () => {
		it("lowercases the first letter of every Orval-generated export and resolves operations map references", async () => {
			const outputPath = path.join(TEMP_DIR, "no-op-ids-lowercase.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "no-operation-ids.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// All Orval exports must start with a lowercase letter (BUG-001 fix).
			const exportMatches = [...content.matchAll(/^export const (\w+)/gm)];
			expect(exportMatches.length).toBeGreaterThan(0);
			for (const m of exportMatches) {
				const firstChar = m[1].charAt(0);
				expect(firstChar).toBe(firstChar.toLowerCase());
			}

			// Operations map slots now resolve to the lowercased exports instead of
			// falling back to z.never() (the core BUG-001 symptom).
			// v1postOrders has a request body — expect body: v1postOrdersBody inside the request z.object.
			expect(content).toMatch(/v1postOrders:\s*\{[\s\S]*?request:\s*z\.object\(\{[\s\S]*?body:\s*v1postOrdersBody/);
			// v1getAccountsAccountId has a 200 response body — expect body: v1getAccountsAccountIdResponse inside the response z.object.
			expect(content).toMatch(
				/v1getAccountsAccountId:\s*\{[\s\S]*?response:\s*z\.object\(\{[\s\S]*?body:\s*v1getAccountsAccountIdResponse/
			);
		}, 60000);

		it("lowercases petstore exports and resolves createPet body + listPets response", async () => {
			const outputPath = path.join(TEMP_DIR, "petstore-lowercase.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "petstore.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// Pre-028 regression: Orval emitted `CreatePetBody` while our lookup built `createPetBody` → miss → `body: z.never()`.
			// After fix: Orval's export is lowercased to `createPetBody` and the map references it.
			expect(content).toMatch(/^export const createPetBody/m);
			expect(content).toMatch(/createPet:\s*\{[\s\S]*?body:\s*createPetBody/);
			// listPets returns an array of Pet — response body slot should reference the lowercased export.
			expect(content).toMatch(
				/listPets:\s*\{[\s\S]*?response:\s*z\.object\(\{[\s\S]*?body:\s*listPets(Response|ResponseItem)/
			);
		}, 60000);
	});

	describe("Orval output formatting", () => {
		it("re-indents nested z.object children one level deeper than the parent (BUG-002)", async () => {
			// Build a small spec with a nested object so we can verify Orval's formatter ran.
			const tempSpecPath = path.join(TEMP_DIR, "nested.yaml");
			const yaml = `openapi: 3.0.0
info:
  title: Nested Spec
  version: 1.0.0
paths:
  /v1/preset/apply:
    post:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  errors:
                    type: array
                    items:
                      type: object
                      properties:
                        type:
                          type: string
                        id:
                          type: string
                        message:
                          type: string
`;
			await writeFile(tempSpecPath, yaml, "utf-8");

			const outputPath = path.join(TEMP_DIR, "nested-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: tempSpecPath,
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// The inner z.object child fields (e.g. `type: z.string()`) must be indented
			// at least 4 spaces from the line start — i.e. nested deeper than the outer
			// z.object's 2-space children. Without Biome formatting they would sit at
			// 2 spaces (same column as the outer object's children).
			// Biome's formatter unquotes single-identifier keys (`"type"` → `type`).
			const innerFieldMatch = content.match(/^( +)"?type"?:\s*z\.string\(\)/m);
			expect(innerFieldMatch).not.toBeNull();
			const innerIndent = innerFieldMatch?.[1].length ?? 0;
			expect(innerIndent).toBeGreaterThanOrEqual(4);
		}, 60000);
	});

	describe("Unified operations map (BUG-004)", () => {
		it("emits a single operations artifact — no standalone Protocol Schema section", async () => {
			const outputPath = path.join(TEMP_DIR, "unified-no-op-ids.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "no-operation-ids.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// One operations artifact
			expect(content).toMatch(/^export const operations = \{/m);
			// No standalone Protocol Schema section
			expect(content).not.toContain("// ===== Protocol Schema =====");
			// No {service}Schema export (named after the service title)
			expect(content).not.toMatch(/^export const \w+Schema = \{/m);

			// Each operation's request / response is a z.object — satisfies SyncSchemaInput
			expect(content).toMatch(/v1getAccountsAccountId:\s*\{\s*request:\s*z\.object\(/);
			expect(content).toMatch(/v1getAccountsAccountId:\s*\{[\s\S]*?response:\s*z\.object\(/);
		}, 60000);

		it("emits body: z.never() for every body-less slot (subsumes BUG-003)", async () => {
			const outputPath = path.join(TEMP_DIR, "unified-z-never.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "no-operation-ids.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// No z.unknown().optional() — that was the BUG-003 symptom for body-less request slots
			expect(content).not.toContain("z.unknown().optional()");
			// Body-less request slots use z.never().optional() (BUG-007): rejects stray bodies
			// at runtime/design-time but accepts the typical no-body request payload.
			expect(content).toMatch(/v1getAccountsAccountId:\s*\{[\s\S]*?body:\s*z\.never\(\)\.optional\(\)/);
			expect(content).toMatch(/getHealth:\s*\{[\s\S]*?body:\s*z\.never\(\)\.optional\(\)/);
			// 204 No Content response (v1deleteAccountsAccountId) → body: z.never().optional() on response side
			expect(content).toMatch(
				/v1deleteAccountsAccountId:\s*\{[\s\S]*?response:\s*z\.object\([\s\S]*?body:\s*z\.never\(\)\.optional\(\)/
			);
			// Naked z.never() with no .optional() suffix would re-introduce the runtime failure for body-less payloads.
			expect(content).not.toMatch(/body:\s*z\.never\(\),/);
		}, 60000);

		it("emits a one-line service type alias derived from operations", async () => {
			const outputPath = path.join(TEMP_DIR, "unified-type-alias.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: path.join(FIXTURES_DIR, "petstore.yaml"),
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// Service type derived inline via mapped type + z.infer — no testurio dependency.
			expect(content).not.toContain("from 'testurio'");
			expect(content).not.toContain("InferSyncService");
			expect(content).toContain("export type PetStore = {");
			expect(content).toContain('z.infer<(typeof operations)[K]["request"]>');
			expect(content).not.toMatch(/^export interface PetStore/m);
		}, 60000);
	});

	describe("Multi-response discriminated union (BUG-005)", () => {
		it("wraps 2+ responses in z.discriminatedUnion('code', [...]) with one z.object per status code", async () => {
			// Inline-build a spec where one op has 200, 400, and 404 responses.
			const tempSpecPath = path.join(TEMP_DIR, "multi-response.yaml");
			const yaml = `openapi: 3.0.0
info:
  title: Multi Response
  version: 1.0.0
paths:
  /v1/items:
    get:
      operationId: getItems
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  name:
                    type: string
        '400':
          description: bad request
        '404':
          description: not found
`;
			await writeFile(tempSpecPath, yaml, "utf-8");

			const outputPath = path.join(TEMP_DIR, "multi-response-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: tempSpecPath,
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// Multi-response op uses z.discriminatedUnion('code', [...])
			expect(content).toMatch(/getItems:\s*\{[\s\S]*?response:\s*z\.discriminatedUnion\(['"]code['"],\s*\[/);
			// Each status code appears as its own z.object variant
			expect(content).toMatch(/z\.object\(\{\s*code:\s*z\.literal\(200\),\s*body:\s*getItemsResponse/);
			expect(content).toMatch(/z\.object\(\{\s*code:\s*z\.literal\(400\),\s*body:\s*z\.never\(\)/);
			expect(content).toMatch(/z\.object\(\{\s*code:\s*z\.literal\(404\),\s*body:\s*z\.never\(\)/);
		}, 60000);

		it("falls back to a plain z.object for single-response operations", async () => {
			const tempSpecPath = path.join(TEMP_DIR, "single-response.yaml");
			const yaml = `openapi: 3.0.0
info:
  title: Single Response
  version: 1.0.0
paths:
  /v1/ping:
    get:
      operationId: getPing
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
`;
			await writeFile(tempSpecPath, yaml, "utf-8");

			const outputPath = path.join(TEMP_DIR, "single-response-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: tempSpecPath,
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// Single-response op uses plain z.object (no discriminatedUnion overhead)
			expect(content).toMatch(/getPing:\s*\{[\s\S]*?response:\s*z\.object\(/);
			expect(content).not.toContain("z.discriminatedUnion");
		}, 60000);
	});

	describe("mixed spec preservation", () => {
		it("preserves explicit operationIds and synthesizes only missing ones", async () => {
			const tempSpecPath = path.join(TEMP_DIR, "mixed.yaml");
			const yaml = `openapi: 3.0.0
info:
  title: Mixed Spec
  version: 1.0.0
paths:
  /v1/explicit:
    get:
      operationId: customListThings
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
  /v1/synthesized:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
`;
			await writeFile(tempSpecPath, yaml, "utf-8");

			const outputPath = path.join(TEMP_DIR, "mixed-generated.ts");

			const generator = new OpenApiGenerator();
			const logger = createLogger({ quiet: true });

			const source: OpenApiSource = {
				type: "openapi",
				input: tempSpecPath,
				output: outputPath,
			};

			const files = await generator.generate({
				source,
				rootDir: process.cwd(),
				logger,
			});

			const content = files[0].content;

			// Explicit operationId preserved verbatim
			expect(content).toContain("customListThings:");
			// Synthesized id appears
			expect(content).toContain("v1getSynthesized:");
			// Explicit id was NOT renamed to a synthesized one
			expect(content).not.toContain("v1getExplicit:");
		}, 60000);
	});
});
