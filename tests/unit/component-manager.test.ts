/**
 * TestScenario Component Management Tests
 *
 * Tests for component management functionality that is now inlined in TestScenario.
 */

import { BaseSyncProtocol, Client, Server, TestScenario } from "testurio";
import { describe, expect, it } from "vitest";

// Mock adapter class implementing SyncAdapter
class MockProtocol extends BaseSyncProtocol {
	readonly type = "http";

	// Expose protected properties as public to satisfy ISyncProtocol interface
	public override server = { isRunning: false };
	public override client = { isConnected: false };

	async startServer(_config: { listenAddress: { host: string; port: number } }): Promise<void> {
		this.server.isRunning = true;
	}

	async stopServer() {}

	async createClient(_config: { targetAddress: { host: string; port: number } }): Promise<void> {
		this.client.isConnected = true;
	}

	async closeClient() {}

	async request<TRes = unknown>(): Promise<TRes> {
		return { data: "mock response" } as TRes;
	}

	respond(_traceId: string, _payload: unknown): void {
		// Mock implementation - no-op
	}
}

// Helper to create components with mock adapter
const createClient = (name: string, port: number) =>
	new Client(name, {
		protocol: new MockProtocol(),
		targetAddress: { host: "localhost", port },
	});

const createServer = (name: string, port: number) =>
	new Server(name, {
		protocol: new MockProtocol(),
		listenAddress: { host: "localhost", port },
	});

describe("TestScenario Component Management", () => {
	describe("component creation", () => {
		it("should create scenario with client component", () => {
			const scenario = new TestScenario({
				name: "Test",
				components: [createClient("test-client", 8080)],
			});

			expect(scenario).toBeDefined();
		});

		it("should create scenario with mock component", () => {
			const scenario = new TestScenario({
				name: "Test",
				components: [createServer("test-mock", 8080)],
			});

			expect(scenario).toBeDefined();
		});

		it("should throw if component already exists", () => {
			expect(
				() =>
					new TestScenario({
						name: "Test",
						components: [createClient("duplicate", 8080), createClient("duplicate", 8081)],
					})
			).toThrow("already exists");
		});
	});
});
