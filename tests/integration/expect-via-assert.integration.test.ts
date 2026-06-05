/**
 * Native expect via .assert() — end-to-end integration
 *
 * Verifies that testurio's native expect() works seamlessly inside
 * .assert() predicates: failures propagate with rich Expected/Received
 * messages, source links point to the user's expect(...) line, and the
 * D-3 truthiness flip allows expect-only bodies without `return true;`.
 *
 * Port range: 31xxx
 */

import { Client, HttpProtocol, Server, TestScenario, testCase, expect as texpect } from "testurio";
import { describe, expect, it } from "vitest";

interface ServiceOperations {
	getUser: {
		request: { method: "GET"; path: "/user"; body?: never };
		response: { code: 200; body: { id: number; name: string; role: string } } | { code: 404; body: { error: string } };
	};
}

let portCounter = 31000;
function getNextPort(): number {
	return portCounter++;
}

function buildPair(mockResponse: { code: number; body: unknown }) {
	const backendPort = getNextPort();
	const backend = new Server("backend", {
		protocol: new HttpProtocol<ServiceOperations>(),
		listenAddress: { host: "localhost", port: backendPort },
	});
	const api = new Client("api", {
		protocol: new HttpProtocol<ServiceOperations>(),
		targetAddress: { host: "localhost", port: backendPort },
	});
	return { backend, api, mockResponse };
}

describe("expect() via .assert() — D-3 truthiness flip", () => {
	it("passes when expect succeeds and predicate returns undefined (no `return true;`)", async () => {
		const { backend, api } = buildPair({ code: 200, body: {} });
		const scenario = new TestScenario({
			name: "D-3 flip — passing case",
			components: [backend, api],
		});

		const tc = testCase("expect-only body passes", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 200, body: { id: 1, name: "Alice", role: "user" } }));
			apiC.onResponse("getUser").assert((res) => {
				texpect(res.code).toBe(200);
				// no return; undefined now passes
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("fails with Expected/Received + source link when expect fails", async () => {
		const { backend, api } = buildPair({ code: 404, body: { error: "Not Found" } });
		const scenario = new TestScenario({
			name: "D-3 flip — failing case",
			components: [backend, api],
		});

		const tc = testCase("expect-only body fails", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 404, body: { error: "Not Found" } }));
			apiC.onResponse("getUser").assert((res) => {
				texpect(res.code).toBe(200);
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(false);
		const message = result.testCases[0]?.error ?? "";
		expect(message).toContain("Expected: 200");
		expect(message).toContain("Received: 404");
		expect(message).toContain("tests/integration/expect-via-assert.integration.test.ts");
	});

	it("renders a Diff: block for toEqual mismatches on nested objects", async () => {
		const { backend, api } = buildPair({ code: 200, body: { id: 1, name: "Bob", role: "user" } });
		const scenario = new TestScenario({
			name: "toEqual diff",
			components: [backend, api],
		});

		const tc = testCase("toEqual diff body", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 200, body: { id: 1, name: "Bob", role: "user" } }));
			apiC.onResponse("getUser").assert((res) => {
				if (res.code === 200) {
					texpect(res.body).toEqual({ id: 1, name: "Alice", role: "user" });
				}
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(false);
		const message = result.testCases[0]?.error ?? "";
		expect(message).toContain("Diff:");
		expect(message).toContain('"Alice"');
		expect(message).toContain('"Bob"');
	});

	it("toMatchObject allows extra keys", async () => {
		const { backend, api } = buildPair({ code: 200, body: { id: 1, name: "Alice", role: "user" } });
		const scenario = new TestScenario({
			name: "toMatchObject extra keys",
			components: [backend, api],
		});

		const tc = testCase("toMatchObject body", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 200, body: { id: 1, name: "Alice", role: "user" } }));
			apiC.onResponse("getUser").assert((res) => {
				if (res.code === 200) {
					texpect(res.body).toMatchObject({ id: 1 });
				}
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it(".not.toBe failure shows 'not.toBe' operator", async () => {
		const { backend, api } = buildPair({ code: 200, body: {} });
		const scenario = new TestScenario({
			name: "not.toBe failing",
			components: [backend, api],
		});

		const tc = testCase("not.toBe body", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 200, body: { id: 1, name: "Alice", role: "user" } }));
			apiC.onResponse("getUser").assert((res) => {
				texpect(res.code).not.toBe(200);
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(false);
		const message = result.testCases[0]?.error ?? "";
		expect(message).toContain("Received: 200");
	});

	it("first expect failure surfaces; second never runs", async () => {
		const { backend, api } = buildPair({ code: 404, body: { error: "x" } });
		const scenario = new TestScenario({
			name: "first failure short-circuits",
			components: [backend, api],
		});

		let secondMatcherInvoked = false;

		const tc = testCase("first failure body", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 404, body: { error: "x" } }));
			apiC.onResponse("getUser").assert((res) => {
				texpect(res.code).toBe(200); // throws here
				secondMatcherInvoked = true;
				texpect(res.code).toBeLessThan(500);
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(false);
		expect(secondMatcherInvoked).toBe(false);
	});
});

describe("backward compatibility — boolean predicates", () => {
	it("returning true still passes", async () => {
		const { backend, api } = buildPair({ code: 200, body: {} });
		const scenario = new TestScenario({
			name: "bool true",
			components: [backend, api],
		});

		const tc = testCase("bool true body", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 200, body: { id: 1, name: "Alice", role: "user" } }));
			apiC.onResponse("getUser").assert((res) => res.code === 200);
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("returning false still fails with the generic message", async () => {
		const { backend, api } = buildPair({ code: 404, body: { error: "x" } });
		const scenario = new TestScenario({
			name: "bool false",
			components: [backend, api],
		});

		const tc = testCase("bool false body", (test) => {
			const apiC = test.use(api);
			const backendC = test.use(backend);
			apiC.request("getUser", { method: "GET", path: "/user" });
			backendC
				.onRequest("getUser", { method: "GET", path: "/user" })
				.mockResponse(() => ({ code: 404, body: { error: "x" } }));
			apiC.onResponse("getUser").assert("status check", (res) => res.code === 200);
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(false);
		const message = result.testCases[0]?.error ?? "";
		expect(message).toContain("Assertion failed");
		expect(message).toContain("status check");
	});
});
