/**
 * Allure Interaction Payloads — End-to-End Integration Test (FR-9 v2).
 *
 * Runs a real HTTP scenario and asserts that the on-disk Allure *-result.json
 * files contain per-step request/response parameters and attachments pointing
 * to files whose contents are the actual payloads stamped by sync-client and
 * sync-server during execution.
 *
 * Validates the v2 step.metadata-stamping path end-to-end. `recording: true`
 * is explicitly NOT enabled — payloads come from `step.metadata`, decoupled
 * from the recorder.
 *
 * Port range: 30xxx (first new test to use this range).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AllureReporter } from "@testurio/reporter-allure";
import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ============================================================================
// Service Definition
// ============================================================================

interface UsersService {
	getUsers: {
		request: { method: "GET"; path: "/users" };
		response: { code: 200; body: Array<{ id: number; name: string }> };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body: { name: string } };
		response: { code: 201; body: { id: number; name: string } };
	};
}

// Port counter for this test file (30xxx range — first new test to use this range)
let portCounter = 30000;
const getNextPort = (): number => portCounter++;

// ============================================================================
// Helpers
// ============================================================================

interface AllureResultJson {
	uuid: string;
	name: string;
	steps: Array<{
		name: string;
		parameters: Array<{ name: string; value: string }>;
		attachments: Array<{ name: string; source: string; type: string }>;
	}>;
	attachments: Array<{ name: string; source: string; type: string }>;
}

const readAllResultFiles = (dir: string): AllureResultJson[] => {
	const files = fs.readdirSync(dir).filter((f) => f.endsWith("-result.json"));
	return files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as AllureResultJson);
};

// ============================================================================
// Tests
// ============================================================================

describe("AllureReporter — per-step payloads via step.metadata (FR-9 v2)", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "allure-fr9-"));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("emits per-step request/response parameters + attachments (recording OFF)", async () => {
		const port = getNextPort();

		const server = new Server("mock", {
			protocol: new HttpProtocol<UsersService>(),
			listenAddress: { host: "localhost", port },
		});

		const client = new Client("api", {
			protocol: new HttpProtocol<UsersService>(),
			targetAddress: { host: "localhost", port },
		});

		const reporter = new AllureReporter({
			resultsDir: tempDir,
			includePayloads: "both",
			maxPayloadSize: 4000,
		});

		const scenario = new TestScenario({
			name: "FR-9 v2 Payloads",
			components: [server, client],
			// recording explicitly OFF — payload path is decoupled from recorder
		});
		scenario.addReporter(reporter);

		const tc1 = testCase("getUsers", (test) => {
			const api = test.use(client);
			const mock = test.use(server);
			mock.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
				code: 200,
				body: [{ id: 1, name: "Ada" }],
			}));
			api.request("getUsers", { method: "GET", path: "/users" });
			api.onResponse("getUsers").assert((res) => res.code === 200);
		});

		const tc2 = testCase("createUser", (test) => {
			const api = test.use(client);
			const mock = test.use(server);
			mock.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse(() => ({
				code: 201,
				body: { id: 2, name: "Lovelace" },
			}));
			api.request("createUser", { method: "POST", path: "/users", body: { name: "Lovelace" } });
			api.onResponse("createUser").assert((res) => res.code === 201);
		});

		const result = await scenario.run(tc1, tc2);

		expect(result.passed, result.error).toBe(true);

		const allureResults = readAllResultFiles(tempDir);
		expect(allureResults).toHaveLength(2);

		// Every test case should have at least one step with a `request` attachment
		// (the client `request` step) and one with a `response` attachment
		// (either the server's mockResponse hook step or the client's onResponse step).
		// Per task 044, payloads no longer render as Parameter rows — only as JSON attachments.
		for (const allureResult of allureResults) {
			const stepWithRequest = allureResult.steps.find((s) => s.attachments.some((a) => a.name === "request"));
			expect(stepWithRequest).toBeDefined();
			const requestAttachment = stepWithRequest?.attachments.find((a) => a.name === "request");
			expect(requestAttachment).toBeDefined();
			const requestPath = path.join(tempDir, requestAttachment?.source ?? "");
			expect(fs.existsSync(requestPath)).toBe(true);
			expect(() => JSON.parse(fs.readFileSync(requestPath, "utf-8"))).not.toThrow();

			const stepWithResponse = allureResult.steps.find((s) => s.attachments.some((a) => a.name === "response"));
			expect(stepWithResponse).toBeDefined();
			const responseAttachment = stepWithResponse?.attachments.find((a) => a.name === "response");
			expect(responseAttachment).toBeDefined();
			const responsePath = path.join(tempDir, responseAttachment?.source ?? "");
			expect(fs.existsSync(responsePath)).toBe(true);
		}

		// The createUser scenario should mention "Lovelace" in at least one response attachment
		const createUserResult = allureResults.find((r) => r.name === "createUser");
		expect(createUserResult).toBeDefined();
		const responseAttachmentContents = (createUserResult?.steps ?? [])
			.flatMap((s) => s.attachments)
			.filter((a) => a.name === "response")
			.map((a) => fs.readFileSync(path.join(tempDir, a.source), "utf-8"));
		expect(responseAttachmentContents.some((c) => c.includes("Lovelace"))).toBe(true);
	});

	it("emits NO per-step payload rows when includePayloads is omitted", async () => {
		const port = getNextPort();

		const server = new Server("mock", {
			protocol: new HttpProtocol<UsersService>(),
			listenAddress: { host: "localhost", port },
		});

		const client = new Client("api", {
			protocol: new HttpProtocol<UsersService>(),
			targetAddress: { host: "localhost", port },
		});

		const reporter = new AllureReporter({
			resultsDir: tempDir,
			// includePayloads omitted → no payload emission even though metadata is stamped
		});

		const scenario = new TestScenario({
			name: "FR-9 v2 No Payloads",
			components: [server, client],
		});
		scenario.addReporter(reporter);

		const tc = testCase("getUsers", (test) => {
			const api = test.use(client);
			const mock = test.use(server);
			mock.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
				code: 200,
				body: [],
			}));
			api.request("getUsers", { method: "GET", path: "/users" });
		});

		const result = await scenario.run(tc);

		expect(result.passed, result.error).toBe(true);

		const allureResults = readAllResultFiles(tempDir);
		expect(allureResults).toHaveLength(1);

		// No step should have a "request" or "response" parameter — only "component"
		for (const step of allureResults[0].steps) {
			const paramNames = step.parameters.map((p) => p.name);
			expect(paramNames).not.toContain("request");
			expect(paramNames).not.toContain("response");
			expect(step.attachments).toHaveLength(0);
		}
	});
});
