/**
 * Allure Reporter Integration Tests with Multi-Component Scenarios
 *
 * Tests the Allure reporter with real Testurio test scenarios including:
 * - Client → Proxy → Mock component chains
 * - Multiple test steps
 * - Snapshot testing of generated reports
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AllureReporter } from "@testurio/reporter-allure";
import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ============================================================================
// Type Definitions
// ============================================================================

interface User {
	id: number;
	name: string;
	email?: string;
}

interface CreateUserPayload {
	name: string;
	email: string;
}

interface ErrorResponse {
	error: string;
	code?: number;
}

interface ServiceOperations {
	getUsers: {
		request: { method: "GET"; path: "/users"; body?: never };
		response: { code: 200; body: User[] };
	};
	getUsersEmpty: {
		request: { method: "GET"; path: "/users"; body?: never };
		response: { code: 200; body: User[] };
	};
	getUsersOne: {
		request: { method: "GET"; path: "/users"; body?: never };
		response: { code: 200; body: User[] };
	};
	getUsersTwo: {
		request: { method: "GET"; path: "/users"; body?: never };
		response: { code: 200; body: User[] };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body: CreateUserPayload };
		response: { code: 201; body: User };
	};
	createUserAlice: {
		request: { method: "POST"; path: "/users"; body: CreateUserPayload };
		response: { code: 201; body: User };
	};
	createUserBob: {
		request: { method: "POST"; path: "/users"; body: CreateUserPayload };
		response: { code: 201; body: User };
	};
	getUser: {
		request: { method: "GET"; path: "/users/:id"; body?: never };
		response: { code: 200; body: User } | { code: 404; body: ErrorResponse };
	};
	deleteUser: {
		request: { method: "DELETE"; path: "/users/:id"; body?: never };
		response: { code: 204; body?: never };
	};
	getHealth: {
		request: { method: "GET"; path: "/health"; body?: never };
		response: { code: 200; body: { status: string } };
	};
	getHealthCheck: {
		request: { method: "GET"; path: "/health"; body?: never };
		response: { code: 200; body: { status: string } };
	};
}

// Port counter for this test file (17xxx range to avoid conflicts)
let portCounter = 17000;
function getNextPort(): number {
	return portCounter++;
}

// Helper functions for creating HTTP components
const createMockServer = (name: string, port: number) =>
	new Server(name, {
		protocol: new HttpProtocol<ServiceOperations>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new Client(name, {
		protocol: new HttpProtocol<ServiceOperations>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new Server(name, {
		protocol: new HttpProtocol<ServiceOperations>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

// ============================================================================
// Snapshot Helpers
// ============================================================================

/**
 * Normalize a value for snapshot comparison by replacing dynamic values
 */
function normalizeForSnapshot(obj: unknown): unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (typeof obj === "string") {
		// Replace UUIDs
		let normalized = obj.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>");
		// Replace MD5 hashes (32 hex chars)
		normalized = normalized.replace(/^[0-9a-f]{32}$/i, "<MD5_HASH>");
		// Normalize file paths and line numbers in stack traces (handles both Windows and Unix paths)
		normalized = normalized.replace(/at\s+[^\n]+\.(ts|js):\d+:\d+/g, "at <STACK_FRAME>");
		return normalized;
	}

	if (typeof obj === "number") {
		// Check if it looks like a timestamp (13 digits, starts with 17...)
		if (obj > 1700000000000 && obj < 2000000000000) {
			return "<TIMESTAMP>";
		}
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(normalizeForSnapshot);
	}

	if (typeof obj === "object") {
		const normalized: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			// Special handling for known dynamic fields
			if (key === "uuid" || key === "historyId" || key === "testCaseId") {
				normalized[key] = `<${key.toUpperCase()}>`;
			} else if (key === "start" || key === "stop") {
				normalized[key] = "<TIMESTAMP>";
			} else if (key === "source" && typeof value === "string" && value.includes("-attachment.")) {
				normalized[key] = "<ATTACHMENT_FILE>";
			} else {
				normalized[key] = normalizeForSnapshot(value);
			}
		}
		return normalized;
	}

	return obj;
}

/**
 * Read all Allure result files from a directory and normalize for snapshot
 */
function readAndNormalizeResults(dir: string): {
	results: unknown[];
	containers: unknown[];
	environment: string | null;
	attachmentCount: number;
} {
	const files = fs.readdirSync(dir);

	const results: unknown[] = [];
	const containers: unknown[] = [];
	let environment: string | null = null;
	let attachmentCount = 0;

	for (const file of files.sort()) {
		const filePath = path.join(dir, file);

		if (file.endsWith("-result.json")) {
			const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			results.push(normalizeForSnapshot(content));
		} else if (file.endsWith("-container.json")) {
			const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			// Normalize children array (UUIDs)
			const normalized = normalizeForSnapshot(content) as Record<string, unknown>;
			if (Array.isArray(normalized.children)) {
				normalized.children = normalized.children.map(() => "<UUID>");
			}
			containers.push(normalized);
		} else if (file === "environment.properties") {
			environment = fs.readFileSync(filePath, "utf-8");
		} else if (file.includes("-attachment.")) {
			attachmentCount++;
		}
	}

	// Sort results by name for consistent ordering
	results.sort((a, b) => {
		const nameA = (a as { name: string }).name;
		const nameB = (b as { name: string }).name;
		return nameA.localeCompare(nameB);
	});

	return { results, containers, environment, attachmentCount };
}

// ============================================================================
// Tests
// ============================================================================

describe("Allure Reporter Integration Tests", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "allure-integration-"));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true });
		}
	});

	describe("Single Component Scenario", () => {
		it("should generate report for client-mock scenario with single test case", async () => {
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				environmentInfo: { "Node.js": "test-version", Environment: "test" },
			});

			const scenario = new TestScenario({
				name: "Simple API Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase("Get all users", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("getUsers", { method: "GET", path: "/users" });

				backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
					code: 200,
					body: [
						{ id: 1, name: "Alice" },
						{ id: 2, name: "Bob" },
					],
				}));

				api.onResponse("getUsers").assert((res) => res.body.length === 2);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(1);
			expect(report.containers).toHaveLength(1);
			expect(report.environment).not.toBeNull();

			expect(report.results[0]).toMatchSnapshot("single-test-case-result");
			expect(report.containers[0]).toMatchSnapshot("single-test-case-container");
		});
	});

	describe("Multi-Component Chain Scenario", () => {
		it("should generate report for client → proxy → mock chain", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				defaultEpic: "User Management",
				defaultFeature: "User API",
			});

			const scenario = new TestScenario({
				name: "API Chain Test",
				components: [backendServer, gatewayProxy, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase(
				"Get users through proxy",
				(test) => {
					const api = test.use(apiClient);
					const backend = test.use(backendServer);

					api.request("getUsers", { method: "GET", path: "/users" });

					backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
						code: 200,
						body: [{ id: 1, name: "Alice" }],
					}));

					api.onResponse("getUsers").assert((res) => res.code === 200);
				},
				{
					story: "List Users",
					severity: "critical",
					tags: ["api", "smoke"],
				}
			);

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(1);
			expect(report.results[0]).toMatchSnapshot("proxy-chain-result");
		});

		it("should generate report for multiple requests (client to mock)", async () => {
			// Use direct client-to-mock (no proxy) to avoid path routing conflicts
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				includePayloads: "parameters",
				maxPayloadSize: 500,
			});

			const scenario = new TestScenario({
				name: "Multi-Request Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase(
				"Multiple API operations",
				(test) => {
					const api = test.use(apiClient);
					const backend = test.use(mockServer);

					// Step 1: Get users
					api.request("getUsers", { method: "GET", path: "/users" });
					backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
						code: 200,
						body: [{ id: 1, name: "Alice" }],
					}));
					api.onResponse("getUsers").assert((res) => res.body.length === 1);

					// Step 2: Create a user
					api.request("createUser", {
						method: "POST",
						path: "/users",
						body: { name: "Charlie", email: "charlie@example.com" },
					});
					backend.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse((req) => ({
						code: 201,
						body: { id: 2, name: req.body.name, email: req.body.email },
					}));
					api.onResponse("createUser").assert((res) => res.body.id === 2);

					// Step 3: Health check
					api.request("getHealth", { method: "GET", path: "/health" });
					backend.onRequest("getHealth", { method: "GET", path: "/health" }).mockResponse(() => ({
						code: 200,
						body: { status: "healthy" },
					}));
					api.onResponse("getHealth").assert((res) => res.body.status === "healthy");
				},
				{
					epic: "User Management",
					feature: "User CRUD",
					story: "Create and List Users",
					description: "Tests multiple API operations in sequence",
				}
			);

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(1);

			// Verify step count - should have 6 steps (3 requests + 3 responses)
			const testResult = report.results[0] as { steps: unknown[] };
			expect(testResult.steps.length).toBeGreaterThanOrEqual(6);

			expect(report.results[0]).toMatchSnapshot("multi-request-result");
		});
	});

	describe("Multiple Test Cases", () => {
		it("should generate report for multiple test cases in sequence", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				defaultEpic: "User Management",
				tmsUrlPattern: "https://testrail.example.com/view/{id}",
				issueUrlPattern: "https://jira.example.com/browse/{id}",
			});

			const scenario = new TestScenario({
				name: "Multi Test Case Scenario",
				components: [backendServer, gatewayProxy, apiClient],
			});
			scenario.addReporter(reporter);

			const tc1 = testCase(
				"TC-001: List users",
				(test) => {
					const api = test.use(apiClient);
					const backend = test.use(backendServer);

					api.request("getUsers", { method: "GET", path: "/users" });
					backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
						code: 200,
						body: [{ id: 1, name: "Alice" }],
					}));
					api.onResponse("getUsers").assert((res) => res.code === 200);
				},
				{
					id: "TC-001",
					feature: "User List",
					tags: ["smoke"],
				}
			);

			const tc2 = testCase(
				"TC-002: Create user",
				(test) => {
					const api = test.use(apiClient);
					const backend = test.use(backendServer);

					api.request("createUser", {
						method: "POST",
						path: "/users",
						body: { name: "Bob", email: "bob@example.com" },
					});
					backend.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse(() => ({
						code: 201,
						body: { id: 2, name: "Bob", email: "bob@example.com" },
					}));
					api.onResponse("createUser").assert((res) => res.code === 201);
				},
				{
					id: "TC-002",
					feature: "User Create",
					issues: ["BUG-123"],
					tags: ["regression"],
				}
			);

			const tc3 = testCase(
				"TC-003: Health check",
				(test) => {
					const api = test.use(apiClient);
					const backend = test.use(backendServer);

					api.request("getHealth", { method: "GET", path: "/health" });
					backend.onRequest("getHealth", { method: "GET", path: "/health" }).mockResponse(() => ({
						code: 200,
						body: { status: "healthy" },
					}));
					api.onResponse("getHealth").assert((res) => res.body.status === "healthy");
				},
				{
					id: "TC-003",
					feature: "Health",
					severity: "blocker",
				}
			);

			const result = await scenario.run(tc1, tc2, tc3);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(3);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(3);
			expect(report.containers).toHaveLength(1);

			// Container should have all 3 test case UUIDs
			const container = report.containers[0] as { children: string[] };
			expect(container.children).toHaveLength(3);

			expect(report.results).toMatchSnapshot("multiple-test-cases-results");
			expect(report.containers[0]).toMatchSnapshot("multiple-test-cases-container");
		});
	});

	describe("Failure Scenarios", () => {
		it("should generate report with failed status for assertion error", async () => {
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({ resultsDir: tempDir });

			const scenario = new TestScenario({
				name: "Failure Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase("Should fail on wrong status", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("getUsers", { method: "GET", path: "/users" });
				backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
					code: 200,
					body: [],
				}));
				// This assertion will fail
				api.onResponse("getUsers").assert((res) => {
					expect(res.body.length).toBe(5); // Will fail: 0 !== 5
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(1);

			const testResult = report.results[0] as { status: string; statusDetails: { message?: string } };
			expect(testResult.status).toBe("failed");
			expect(testResult.statusDetails.message).toBeDefined();

			expect(report.results[0]).toMatchSnapshot("failed-test-result");
		});

		it("should generate report with broken status for unexpected error", async () => {
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({ resultsDir: tempDir });

			const scenario = new TestScenario({
				name: "Broken Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase("Should break on runtime error", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("getUsers", { method: "GET", path: "/users" });
				backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
					code: 200,
					body: [],
				}));
				api.onResponse("getUsers").assert((_res) => {
					// Cause a runtime error (not an assertion)
					const obj = null as unknown as { prop: string };
					return obj.prop === "value"; // TypeError: Cannot read property 'prop' of null
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);

			const report = readAndNormalizeResults(tempDir);

			const testResult = report.results[0] as { status: string };
			expect(testResult.status).toBe("broken");

			expect(report.results[0]).toMatchSnapshot("broken-test-result");
		});

		it("should generate report with mixed pass/fail results", async () => {
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({ resultsDir: tempDir });

			const scenario = new TestScenario({
				name: "Mixed Results Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tcPass = testCase("Passing test", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("getUsers", { method: "GET", path: "/users" });
				backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
					code: 200,
					body: [{ id: 1, name: "Alice" }],
				}));
				api.onResponse("getUsers").assert((res) => res.code === 200);
			});

			const tcFail = testCase("Failing test", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("getHealth", { method: "GET", path: "/health" });
				backend.onRequest("getHealth", { method: "GET", path: "/health" }).mockResponse(() => ({
					code: 200,
					body: { status: "degraded" },
				}));
				api.onResponse("getHealth").assert((res) => {
					expect(res.body.status).toBe("healthy"); // Will fail
					return true;
				});
			});

			const result = await scenario.run(tcPass, tcFail);

			expect(result.passed).toBe(false);
			expect(result.passedTests).toBe(1);
			expect(result.failedTests).toBe(1);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(2);

			const statuses = report.results.map((r) => (r as { status: string }).status);
			expect(statuses).toContain("passed");
			expect(statuses).toContain("failed");

			expect(report.results).toMatchSnapshot("mixed-results");
		});
	});

	describe("Payload Capture Configuration", () => {
		it("should generate report with payload configuration enabled", async () => {
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				includePayloads: "both",
				maxPayloadSize: 200,
			});

			const scenario = new TestScenario({
				name: "Payload Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase("Create user with payload capture", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("createUser", {
					method: "POST",
					path: "/users",
					body: {
						name: "Test User",
						email: "test@example.com",
					},
				});

				backend.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse((req) => ({
					code: 201,
					body: { id: 1, name: req.body.name, email: req.body.email },
				}));

				api.onResponse("createUser").assert((res) => res.code === 201);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(1);
			// Note: Attachments are only created when step.metadata contains payload keys
			// The actual payload recording depends on how Testurio populates step metadata

			expect(report.results[0]).toMatchSnapshot("payload-capture-result");
		});
	});

	describe("Environment Info", () => {
		it("should write environment properties file", async () => {
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				environmentInfo: {
					"Node.js": process.version,
					Platform: process.platform,
					Environment: "integration-test",
					"Test Framework": "vitest",
				},
			});

			const scenario = new TestScenario({
				name: "Environment Test",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase("Simple test", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(mockServer);

				api.request("getHealth", { method: "GET", path: "/health" });
				backend.onRequest("getHealth", { method: "GET", path: "/health" }).mockResponse(() => ({
					code: 200,
					body: { status: "healthy" },
				}));
				api.onResponse("getHealth");
			});

			await scenario.run(tc);

			const report = readAndNormalizeResults(tempDir);

			expect(report.environment).not.toBeNull();
			expect(report.environment).toContain("Node.js=");
			expect(report.environment).toContain("Platform=");
			expect(report.environment).toContain("Environment=integration-test");
			expect(report.environment).toContain("Test Framework=vitest");
		});
	});

	describe("Complex Multi-Step Workflow", () => {
		it("should generate comprehensive report for complex workflow", async () => {
			// Use direct client-to-mock (no proxy) to avoid path routing conflicts
			const mockPort = getNextPort();
			const mockServer = createMockServer("backend", mockPort);
			const apiClient = createClient("api", mockPort);

			const reporter = new AllureReporter({
				resultsDir: tempDir,
				defaultEpic: "E-Commerce Platform",
				environmentInfo: {
					"API Version": "v1",
					"Test Suite": "Integration",
				},
				labels: [
					{ name: "owner", value: "api-team" },
					{ name: "layer", value: "integration" },
				],
			});

			const scenario = new TestScenario({
				name: "E-Commerce User Workflow",
				components: [mockServer, apiClient],
			});
			scenario.addReporter(reporter);

			const tc = testCase(
				"Complete user lifecycle",
				(test) => {
					const api = test.use(apiClient);
					const backend = test.use(mockServer);

					// Step 1: Health check
					api.request("getHealth", { method: "GET", path: "/health" });
					backend.onRequest("getHealth", { method: "GET", path: "/health" }).mockResponse(() => ({
						code: 200,
						body: { status: "healthy" },
					}));
					api.onResponse("getHealth").assert((res) => res.body.status === "healthy");

					// Step 2: Get users
					api.request("getUsers", { method: "GET", path: "/users" });
					backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
						code: 200,
						body: [{ id: 1, name: "Existing" }],
					}));
					api.onResponse("getUsers").assert((res) => res.body.length === 1);

					// Step 3: Create user
					api.request("createUser", {
						method: "POST",
						path: "/users",
						body: { name: "Alice", email: "alice@example.com" },
					});
					backend.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse(() => ({
						code: 201,
						body: { id: 2, name: "Alice", email: "alice@example.com" },
					}));
					api.onResponse("createUser").assert((res) => res.body.id === 2);
				},
				{
					id: "WF-001",
					feature: "User Lifecycle",
					story: "User Registration Flow",
					description: "Tests the complete user lifecycle including health check, listing, and creating multiple users",
					severity: "critical",
					tags: ["workflow", "e2e", "critical-path"],
				}
			);

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);

			const report = readAndNormalizeResults(tempDir);

			expect(report.results).toHaveLength(1);

			// Verify step count (3 requests + 3 responses = 6 steps)
			const testResult = report.results[0] as { steps: unknown[]; labels: Array<{ name: string; value: string }> };
			expect(testResult.steps.length).toBeGreaterThanOrEqual(6);

			// Verify labels (defaultEpic from options, owner/layer from options.labels)
			expect(testResult.labels).toContainEqual({ name: "epic", value: "E-Commerce Platform" });
			expect(testResult.labels).toContainEqual({ name: "owner", value: "api-team" });
			expect(testResult.labels).toContainEqual({ name: "layer", value: "integration" });

			expect(report.results[0]).toMatchSnapshot("complex-workflow-result");
			expect(report.containers[0]).toMatchSnapshot("complex-workflow-container");
		});
	});
});
