/**
 * TestScenario Component Management Tests
 * 
 * Tests for component management functionality that is now inlined in TestScenario.
 */

import { describe, expect, it } from "vitest";
import {
	TestScenario,
	BaseSyncAdapter,
	Client,
	Server,
} from "testurio";
import type { ProtocolCharacteristics } from "testurio";

// Mock adapter class implementing SyncAdapter
class MockAdapter extends BaseSyncAdapter {
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

	async startServer(config: { listenAddress: { host: string; port: number } }) {
		return {
			id: "mock-server-1",
			type: "http",
			address: config.listenAddress,
			isRunning: true,
		};
	}

	async stopServer() {}

	async createClient(config: { targetAddress: { host: string; port: number } }) {
		return {
			id: "mock-client-1",
			type: "http",
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
	adapter: new MockAdapter(),
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
			expect(() => new TestScenario({
				name: "Test",
				components: [
					createClient("duplicate", 8080),
					createClient("duplicate", 8081),
				],
			})).toThrow("already exists");
		});
	});
});
