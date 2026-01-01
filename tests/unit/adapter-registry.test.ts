/**
 * TestScenario Adapter Tests
 * 
 * Tests that adapters are properly injected into components.
 */

import { describe, expect, it } from "vitest";
import {
	TestScenario,
	BaseSyncProtocol,
	Client,
	Server,
} from "testurio";
import type { ProtocolCharacteristics } from "testurio";

// Mock adapter class implementing SyncAdapter
class MockProtocol extends BaseSyncProtocol {
	readonly type = "http";
	readonly characteristics: ProtocolCharacteristics = {
		type: "http",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: false,
		bidirectional: false,
	};

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
const createClient = (name: string, port: number) => new Client(name, {
	protocol: new MockProtocol(),
	targetAddress: { host: "localhost", port },
});

const createServer = (name: string, port: number) => new Server(name, {
	protocol: new MockProtocol(),
	listenAddress: { host: "localhost", port },
});

describe("TestScenario Adapter Management", () => {
	describe("component creation with adapters", () => {
		it("should create scenario with client component", () => {
			const scenario = new TestScenario({
				name: "Test",
				components: [createClient("test-client", 8080)],
			});

			expect(scenario).toBeDefined();
		});

		it("should create scenario with server component", () => {
			const scenario = new TestScenario({
				name: "Test",
				components: [createServer("test-server", 8080)],
			});

			expect(scenario).toBeDefined();
		});

		it("should create scenario with multiple components", () => {
			const scenario = new TestScenario({
				name: "Test",
				components: [
					createServer("backend", 8080),
					createClient("api", 8080),
				],
			});

			expect(scenario).toBeDefined();
		});
	});

	describe("custom adapters", () => {
		it("should allow using custom adapter in component", () => {
			const customProtocol = new MockProtocol();
			const client = new Client("custom-client", {
				protocol: customProtocol,
				targetAddress: { host: "localhost", port: 8080 },
			});

			const scenario = new TestScenario({
				name: "Test",
				components: [client],
			});

			expect(scenario).toBeDefined();
		});
	});
});
