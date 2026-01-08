/**
 * DataSource Component Tests
 *
 * Unit tests for DataSource component, step builder, and testing utilities.
 */

import type { Component } from "testurio";
import { DataSource, TestCaseBuilder } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryClient } from "../mocks/fakeAdapter";
import { createFakeAdapter, createInMemoryClient } from "../mocks/fakeAdapter";

describe("DataSource", () => {
	describe("lifecycle", () => {
		it("should start and connect adapter", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });

			expect(ds.getState()).toBe("created");
			expect(ds.isStarted()).toBe(false);

			await ds.start();

			expect(ds.getState()).toBe("started");
			expect(ds.isStarted()).toBe(true);
			expect(adapter.isConnected()).toBe(true);
		});

		it("should stop and disconnect adapter", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });
			await ds.start();

			await ds.stop();

			expect(ds.getState()).toBe("stopped");
			expect(ds.isStopped()).toBe(true);
			expect(adapter.isConnected()).toBe(false);
		});

		it("should throw if started twice", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });
			await ds.start();

			await expect(ds.start()).rejects.toThrow(/Cannot start DataSource/);
		});

		it("should allow restart after stop", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });

			await ds.start();
			await ds.stop();
			await ds.start();

			expect(ds.isStarted()).toBe(true);
		});

		it("should handle adapter init failure", async () => {
			const adapter = createFakeAdapter(undefined, { failOnInit: true });
			const ds = new DataSource("test", { adapter });

			await expect(ds.start()).rejects.toThrow(/init failed/);
			expect(ds.getState()).toBe("error");
		});

		it("should handle adapter dispose failure", async () => {
			const adapter = createFakeAdapter(undefined, { failOnDispose: true });
			const ds = new DataSource("test", { adapter });
			await ds.start();

			await expect(ds.stop()).rejects.toThrow(/dispose failed/);
			expect(ds.getState()).toBe("error");
		});
	});

	describe("exec", () => {
		it("should execute callback with client", async () => {
			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const ds = new DataSource("test", { adapter });
			await ds.start();

			await ds.exec(async (c) => {
				(c as InMemoryClient).set("key", "value");
			});

			expect(client.data.get("key")).toBe("value");
		});

		it("should return callback result", async () => {
			const client = createInMemoryClient();
			client.set("key", "value");
			const adapter = createFakeAdapter(client);
			const ds = new DataSource("test", { adapter });
			await ds.start();

			const result = await ds.exec(async (c) => (c as InMemoryClient).get("key"));

			expect(result).toBe("value");
		});

		it("should throw if exec called before start", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });

			await expect(ds.exec(async (c) => c)).rejects.toThrow(/not started/);
		});

		it("should propagate callback errors", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });
			await ds.start();

			await expect(
				ds.exec(async () => {
					throw new Error("Query failed");
				})
			).rejects.toThrow("Query failed");
		});
	});

	describe("getClient", () => {
		it("should return native client when started", async () => {
			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const ds = new DataSource("test", { adapter });
			await ds.start();

			const result = ds.getClient();

			expect(result).toBe(client);
		});

		it("should throw when not started", () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });

			expect(() => ds.getClient()).toThrow(/not started/);
		});
	});

	describe("Component interface compatibility", () => {
		it("should implement Component interface", () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });

			// Check that ds satisfies Component interface
			const component: Component = ds;
			expect(component.name).toBe("test");
			expect(typeof component.start).toBe("function");
			expect(typeof component.stop).toBe("function");
			expect(typeof component.getState).toBe("function");
			expect(typeof component.isStarted).toBe("function");
			expect(typeof component.isStopped).toBe("function");
			expect(typeof component.createStepBuilder).toBe("function");
			expect(typeof component.clearTestCaseHooks).toBe("function");
			expect(typeof component.clearHooks).toBe("function");
			expect(typeof component.getUnhandledErrors).toBe("function");
			expect(typeof component.clearUnhandledErrors).toBe("function");
		});

		it("should have no-op hook methods (DataSource has no hooks)", async () => {
			const adapter = createFakeAdapter();
			const ds = new DataSource("test", { adapter });

			// These should not throw
			ds.clearTestCaseHooks();
			ds.clearHooks();
			expect(ds.getUnhandledErrors()).toEqual([]);
		});
	});
});

describe("DataSourceStepBuilder", () => {
	let ds: DataSource<InMemoryClient, ReturnType<typeof createFakeAdapter<InMemoryClient>>>;
	let client: InMemoryClient;
	let builder: TestCaseBuilder;

	beforeEach(async () => {
		client = createInMemoryClient();
		const adapter = createFakeAdapter(client);
		ds = new DataSource("test", { adapter });
		await ds.start();
		builder = new TestCaseBuilder(new Map());
	});

	it("should register exec step", () => {
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(async (c) => c.get("key"));

		const steps = builder.getSteps();
		expect(steps).toHaveLength(1);
		expect(steps[0].type).toBe("datasource");
	});

	it("should accept description as first argument to exec", () => {
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec("fetch cached value", async (c) => c.get("key"));

		const steps = builder.getSteps();
		expect(steps[0].description).toContain("fetch cached value");
	});

	it("should chain assert", () => {
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(async (c) => c.get("key")).assert((result) => result === "value");

		const steps = builder.getSteps();
		expect(steps).toHaveLength(1);
	});

	it("should accept description as first argument to assert", () => {
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(async (c) => c.get("key")).assert("key should have value", (result) => result === "value");

		const steps = builder.getSteps();
		expect(steps[0].metadata?.assertDescription).toBe("key should have value");
	});

	it("should execute step and return result", async () => {
		client.set("user:1", { name: "John" });
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(async (c) => c.get("user:1"));

		const steps = builder.getSteps();
		await steps[0].action();
		// Step executes without error
	});

	it("should execute step with assertion - pass", async () => {
		client.set("user:1", { name: "John" });
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(async (c) => c.get("user:1")).assert((result) => result !== null);

		const steps = builder.getSteps();
		await steps[0].action();
		// Step executes without error
	});

	it("should execute step with assertion - fail", async () => {
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(async (c) => c.get("nonexistent")).assert("value should exist", (result) => result !== null);

		const steps = builder.getSteps();
		await expect(steps[0].action()).rejects.toThrow("Assertion failed: value should exist");
	});

	it("should support timeout option", async () => {
		const stepBuilder = ds.createStepBuilder(builder);

		stepBuilder.exec(
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return "done";
			},
			{ timeout: 50 }
		);

		const steps = builder.getSteps();
		await expect(steps[0].action()).rejects.toThrow(/timeout/i);
	});
});

describe("createFakeAdapter", () => {
	it("should create adapter with default InMemoryClient", async () => {
		const adapter = createFakeAdapter();

		await adapter.init();
		const client = adapter.getClient() as InMemoryClient;

		client.set("key", "value");
		expect(client.get("key")).toBe("value");

		await adapter.dispose();
	});

	it("should accept custom client", async () => {
		const customClient = {
			customMethod: () => "custom",
		};
		const adapter = createFakeAdapter(customClient);

		await adapter.init();
		const client = adapter.getClient();

		expect(client.customMethod()).toBe("custom");
	});

	it("should emit events", async () => {
		const adapter = createFakeAdapter();
		const events: string[] = [];

		adapter.on("connected", () => events.push("connected"));
		adapter.on("disconnected", () => events.push("disconnected"));

		await adapter.init();
		await adapter.dispose();

		expect(events).toEqual(["connected", "disconnected"]);
	});

	it("should support unsubscribe", async () => {
		const adapter = createFakeAdapter();
		let callCount = 0;

		const unsubscribe = adapter.on("connected", () => {
			callCount++;
		});

		await adapter.init();
		expect(callCount).toBe(1);

		unsubscribe();
		await adapter.dispose();
		await adapter.init();
		expect(callCount).toBe(1); // Not incremented after unsubscribe
	});

	it("should throw when getClient called before init", () => {
		const adapter = createFakeAdapter();

		expect(() => adapter.getClient()).toThrow(/not connected/);
	});

	it("should support operation delay", async () => {
		const adapter = createFakeAdapter(undefined, { operationDelay: 50 });

		const start = Date.now();
		await adapter.init();
		const duration = Date.now() - start;

		expect(duration).toBeGreaterThanOrEqual(40); // Allow some margin
	});
});

describe("createInMemoryClient", () => {
	it("should support get/set/del operations", () => {
		const client = createInMemoryClient();

		client.set("key", "value");
		expect(client.get("key")).toBe("value");

		client.del("key");
		expect(client.get("key")).toBeNull();
	});

	it("should return null for missing keys", () => {
		const client = createInMemoryClient();

		expect(client.get("nonexistent")).toBeNull();
	});

	it("should support query with default empty result", () => {
		const client = createInMemoryClient();

		const result = client.query("SELECT * FROM users", [1]);

		expect(result.rows).toEqual([]);
		expect(result.rowCount).toBe(0);
	});

	it("should expose data Map for inspection", () => {
		const client = createInMemoryClient();

		client.set("a", 1);
		client.set("b", 2);

		expect(client.data.size).toBe(2);
		expect(client.data.get("a")).toBe(1);
	});
});
