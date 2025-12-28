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
class MockAdapter extends BaseSyncProtocol {
	readonly type = "test-protocol";
	readonly characteristics: ProtocolCharacteristics = {
		type: "test-protocol",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: false,
		bidirectional: false,
	};

	async startServer(config: { listenAddress: { host: string; port: number } }) {
		return {
			id: "test-server-1",
			type: "test-protocol",
			address: config.listenAddress,
			isRunning: true,
		};
	}

	async stopServer() {}

	async createClient(config: { targetAddress: { host: string; port: number } }) {
		return {
			id: "test-client-1",
			type: "test-protocol",
			address: config.targetAddress,
			isConnected: true,
		};
	}

	async closeClient() {}

	async request<TRes = unknown>(): Promise<TRes> {
		return { data: "mock response" } as TRes;
	}
}

// Helper to create components with mock adapter
const createClient = (name: string, port: number) => new Client(name, {
	adapter: new MockAdapter(),
	targetAddress: { host: "localhost", port },
});

const createServer = (name: string, port: number) => new Server(name, {
	protocol: new MockAdapter(),
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
			const customAdapter = new MockAdapter();
			const client = new Client("custom-client", {
				adapter: customAdapter,
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
