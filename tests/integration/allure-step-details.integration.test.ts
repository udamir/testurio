/**
 * Allure step-details — end-to-end integration test (task 044).
 *
 * Runs a real HTTP scenario with passing and failing `.assert()` handlers and
 * verifies the on-disk Allure JSON carries the three task-044 surfaces:
 *
 *  1. Per-step start / stop timestamps.
 *  2. Payload-bearing steps reference a JSON attachment whose file contents
 *     match the actual stamped payload.
 *  3. Steps with `.assert()` handlers carry one nested sub-step per assertion,
 *     each with the right `name` and `status` (PASSED / FAILED).
 *
 * Port range: 31xxx (first new test to use this range).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AllureReporter } from "@testurio/reporter-allure";
import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface UsersService {
	getUsers: {
		request: { method: "GET"; path: "/users" };
		response: { code: 200; body: Array<{ id: number; name: string }> };
	};
}

let portCounter = 31000;
const getNextPort = (): number => portCounter++;

interface AllureStepJson {
	name: string;
	status: string;
	start?: number;
	stop?: number;
	parameters: Array<{ name: string; value: string }>;
	attachments: Array<{ name: string; source: string; type: string }>;
	steps: AllureStepJson[];
	statusDetails?: { message?: string };
}

interface AllureResultJson {
	uuid: string;
	name: string;
	status: string;
	steps: AllureStepJson[];
}

const readAllResultFiles = (dir: string): AllureResultJson[] => {
	const files = fs.readdirSync(dir).filter((f) => f.endsWith("-result.json"));
	return files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as AllureResultJson);
};

describe("AllureReporter — step details (start/stop, JSON attachments, nested assertions)", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "allure-044-"));
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("renders per-step duration, JSON payload attachments, and nested assertion sub-steps", async () => {
		const port = getNextPort();

		const server = new Server("mock", {
			protocol: new HttpProtocol<UsersService>(),
			listenAddress: { host: "localhost", port },
		});
		const client = new Client("api", {
			protocol: new HttpProtocol<UsersService>(),
			targetAddress: { host: "localhost", port },
		});

		const reporter = new AllureReporter({ resultsDir: tempDir, includePayloads: "attachments" });

		const scenario = new TestScenario({
			name: "Allure step details",
			components: [server, client],
		});
		scenario.addReporter(reporter);

		const tc = testCase("getUsers — mixed pass/fail assertions", (test) => {
			const api = test.use(client);
			const mock = test.use(server);

			mock.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
				code: 200,
				body: [{ id: 1, name: "Ada" }],
			}));
			api.request("getUsers", { method: "GET", path: "/users" });
			api
				.onResponse("getUsers")
				.assert("code is 200", (res) => res.code === 200)
				.assert("body length > 5", (res) => res.body.length > 5);
		});

		await scenario.run(tc);

		const results = readAllResultFiles(tempDir);
		expect(results).toHaveLength(1);
		const tcResult = results[0];

		for (const s of tcResult.steps) {
			expect(typeof s.start).toBe("number");
			expect(typeof s.stop).toBe("number");
			expect(s.stop ?? 0).toBeGreaterThanOrEqual(s.start ?? 0);
		}

		const requestStep = tcResult.steps.find((s) => /Step \d+: request /.test(s.name));
		expect(requestStep).toBeDefined();
		const requestAttachment = requestStep?.attachments.find((a) => a.name === "request");
		expect(requestAttachment).toBeDefined();
		expect(requestAttachment?.type).toBe("application/json");
		const attachmentPath = path.join(tempDir, requestAttachment?.source ?? "");
		expect(fs.existsSync(attachmentPath)).toBe(true);
		const parsed = JSON.parse(fs.readFileSync(attachmentPath, "utf-8")) as { method: string; path: string };
		expect(parsed.method).toBe("GET");
		expect(parsed.path).toBe("/users");

		const onResponseStep = tcResult.steps.find((s) => /Step \d+: onResponse /.test(s.name));
		expect(onResponseStep).toBeDefined();
		expect(onResponseStep?.steps).toHaveLength(2);

		const [pass, fail] = onResponseStep?.steps ?? [];
		expect(pass.name).toBe("code is 200");
		expect(pass.status).toBe("passed");
		expect(fail.name).toBe("body length > 5");
		expect(fail.status).toBe("failed");
		expect(fail.statusDetails?.message).toContain("body length > 5");
	});
});
