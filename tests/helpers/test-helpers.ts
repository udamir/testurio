/**
 * Test Helpers
 *
 * Shared utilities for test-framework unit tests.
 */

import { vi } from "vitest";
import type {
	SyncAdapter,
	AdapterServerHandle,
	AdapterClientHandle,
} from "testurio";
import { Server, Client } from "testurio";

/**
 * Create a mock protocol adapter for testing
 */
export const createServerAdapter = (overrides?: Partial<SyncAdapter>): SyncAdapter => ({
	type: "http",
	characteristics: {
		type: "http",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: false,
		bidirectional: false,
	},
	startServer: vi.fn().mockResolvedValue({
		id: "server-1",
		type: "http",
		address: { host: "localhost", port: 8080 },
		isRunning: true,
	} as AdapterServerHandle),
	stopServer: vi.fn().mockResolvedValue(undefined),
	createClient: vi.fn().mockResolvedValue({
		id: "client-1",
		type: "http",
		address: { host: "localhost", port: 8080 },
		isConnected: true,
	} as AdapterClientHandle),
	closeClient: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn().mockResolvedValue(undefined),
	setHookRegistry: vi.fn(),
	onRequest: vi.fn(),
	request: vi.fn().mockResolvedValue({ data: "response" }),
	...overrides,
});


/**
 * Create a mock Server component for TestScenario
 */
export const createMockServer = (name: string, port: number, adapter?: SyncAdapter): Server =>
	new Server(name, {
		adapter: adapter ?? createServerAdapter(),
		listenAddress: { host: "localhost", port },
	});

/**
 * Create a Client component for TestScenario
 */
export const createClient = (name: string, port: number, adapter?: SyncAdapter): Client =>
	new Client(name, {
		adapter: adapter ?? createServerAdapter(),
		targetAddress: { host: "localhost", port },
	});

/**
 * Create a proxy Server component for TestScenario
 */
export const createProxyServer = (name: string, listenPort: number, targetPort: number, adapter?: SyncAdapter): Server =>
	new Server(name, {
		adapter: adapter ?? createServerAdapter(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});
