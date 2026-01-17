/**
 * Sync Client Request Builder Unit Tests
 *
 * Tests for the SyncClientRequestBuilder that enables fluent chaining:
 *   api.request(...).onResponse().assert(...)
 */

import type { Step } from "testurio";
import { Client, HttpProtocol, SyncClientRequestBuilder, TestCaseBuilder } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

interface TestServiceOperations {
	getUsers: {
		request: { method: "GET"; path: "/users" };
		response: { code: 200; body: { id: number; name: string }[] };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body: { name: string } };
		response: { code: 201; body: { id: number; name: string } };
	};
}

describe("SyncClientRequestBuilder", () => {
	let client: Client<HttpProtocol<TestServiceOperations>>;
	let builder: TestCaseBuilder;
	let registeredSteps: Step[];

	beforeEach(() => {
		client = new Client("api", {
			protocol: new HttpProtocol<TestServiceOperations>(),
			targetAddress: { host: "localhost", port: 3000 },
		});

		const components = new Map();
		builder = new TestCaseBuilder(components);
		registeredSteps = [];

		// Capture registered steps
		const originalRegisterStep = builder.registerStep.bind(builder);
		builder.registerStep = (step: Step) => {
			registeredSteps.push(step);
			return originalRegisterStep(step);
		};
	});

	describe("request() return value", () => {
		it("should return SyncClientRequestBuilder instance", () => {
			const stepBuilder = builder.use(client);

			const result = stepBuilder.request("getUsers", { method: "GET", path: "/users" });

			expect(result).toBeInstanceOf(SyncClientRequestBuilder);
		});

		it("should still register the request step", () => {
			const stepBuilder = builder.use(client);

			stepBuilder.request("getUsers", { method: "GET", path: "/users" });

			expect(registeredSteps).toHaveLength(1);
			expect(registeredSteps[0].type).toBe("request");
			expect(registeredSteps[0].params).toMatchObject({
				messageType: "getUsers",
				data: { method: "GET", path: "/users" },
			});
		});
	});

	describe("onResponse() chaining", () => {
		it("should create separate onResponse step when chained", () => {
			const stepBuilder = builder.use(client);

			stepBuilder.request("getUsers", { method: "GET", path: "/users" }).onResponse();

			expect(registeredSteps).toHaveLength(2);
			expect(registeredSteps[0].type).toBe("request");
			expect(registeredSteps[1].type).toBe("onResponse");
		});

		it("should pass messageType to onResponse step", () => {
			const stepBuilder = builder.use(client);

			stepBuilder.request("getUsers", { method: "GET", path: "/users" }).onResponse();

			expect(registeredSteps[1].params).toMatchObject({
				messageType: "getUsers",
			});
		});

		it("should pass traceId to onResponse step", () => {
			const stepBuilder = builder.use(client);

			stepBuilder.request("getUsers", { method: "GET", path: "/users" }, "trace-123").onResponse();

			expect(registeredSteps[0].params).toMatchObject({
				traceId: "trace-123",
			});
			expect(registeredSteps[1].params).toMatchObject({
				traceId: "trace-123",
			});
		});

		it("should pass timeout to onResponse step", () => {
			const stepBuilder = builder.use(client);

			stepBuilder.request("getUsers", { method: "GET", path: "/users" }).onResponse(10000);

			expect(registeredSteps[1].params).toMatchObject({
				timeout: 10000,
			});
		});

		it("should return SyncClientHookBuilder for further chaining", () => {
			const stepBuilder = builder.use(client);

			const hookBuilder = stepBuilder.request("getUsers", { method: "GET", path: "/users" }).onResponse();

			// SyncClientHookBuilder has assert, transform, timeout methods
			expect(typeof hookBuilder.assert).toBe("function");
			expect(typeof hookBuilder.transform).toBe("function");
			expect(typeof hookBuilder.timeout).toBe("function");
		});
	});

	describe("full chain: request().onResponse().assert()", () => {
		it("should add assert handler to onResponse step", () => {
			const stepBuilder = builder.use(client);

			stepBuilder
				.request("getUsers", { method: "GET", path: "/users" })
				.onResponse()
				.assert((res) => res.code === 200);

			expect(registeredSteps).toHaveLength(2);
			expect(registeredSteps[1].handlers).toHaveLength(1);
			expect(registeredSteps[1].handlers[0].type).toBe("assert");
		});

		it("should add multiple assert handlers", () => {
			const stepBuilder = builder.use(client);

			stepBuilder
				.request("getUsers", { method: "GET", path: "/users" })
				.onResponse()
				.assert("status check", (res) => res.code === 200)
				.assert("body check", (res) => Array.isArray(res.body));

			expect(registeredSteps[1].handlers).toHaveLength(2);
			expect(registeredSteps[1].handlers[0].description).toBe("status check");
			expect(registeredSteps[1].handlers[1].description).toBe("body check");
		});

		it("should support transform().assert() chain", () => {
			const stepBuilder = builder.use(client);

			stepBuilder
				.request("getUsers", { method: "GET", path: "/users" })
				.onResponse()
				.transform((res) => res.body)
				.assert((body) => body.length > 0);

			expect(registeredSteps[1].handlers).toHaveLength(2);
			expect(registeredSteps[1].handlers[0].type).toBe("transform");
			expect(registeredSteps[1].handlers[1].type).toBe("assert");
		});
	});

	describe("backwards compatibility", () => {
		it("should work without chaining (return value ignored)", () => {
			const stepBuilder = builder.use(client);

			// Old pattern: request without chaining
			stepBuilder.request("getUsers", { method: "GET", path: "/users" });

			expect(registeredSteps).toHaveLength(1);
			expect(registeredSteps[0].type).toBe("request");
		});

		it("should work with separate onResponse call", () => {
			const stepBuilder = builder.use(client);

			// Old pattern: separate request and onResponse
			stepBuilder.request("getUsers", { method: "GET", path: "/users" });
			stepBuilder.onResponse("getUsers").assert((res) => res.code === 200);

			expect(registeredSteps).toHaveLength(2);
			expect(registeredSteps[0].type).toBe("request");
			expect(registeredSteps[1].type).toBe("onResponse");
		});
	});
});
