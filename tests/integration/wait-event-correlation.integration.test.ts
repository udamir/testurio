/**
 * Wait Event Correlation Integration Tests
 *
 * Tests the parallel send + filtered wait pattern enabled by:
 * 1. findMatchingHook skipping resolved hooks (FIFO for same-type waits)
 * 2. executeWaitEvent/executeWaitMessage allowing pre-resolved hooks when matcher is present
 *
 * Port range: 19xxx
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface OrderRequest {
	price: number;
	amount: number;
}

interface OrderResponse {
	price: number;
	orderId: string;
}

interface PingRequest {
	id: number;
}

interface PongResponse {
	id: number;
}

// Service definition for type-safe TCP messaging
interface CorrelationTestService {
	clientMessages: {
		NewOrder: OrderRequest;
		Ping: PingRequest;
	};
	serverMessages: {
		OrderConfirm: OrderResponse;
		Pong: PongResponse;
	};
}

// Port counter for this test file (19xxx range)
let portCounter = 19000;
function getNextPort(): number {
	return portCounter++;
}

// Helper functions
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<CorrelationTestService>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		autoConnect: true,
		protocol: new TcpProtocol<CorrelationTestService>(),
		targetAddress: { host: "localhost", port },
	});

describe("Wait Event Correlation", () => {
	describe("AsyncClient: parallel send + filtered wait", () => {
		it("should correlate events with matchers when responses arrive in order", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Parallel Send Filtered Wait (In-Order)",
				components: [server, client],
			});

			const tc = testCase("3 sends + 3 filtered waits, in-order responses", (test) => {
				const srv = test.use(server);
				const api = test.use(client);

				// Server responds to each order with confirmation including the price
				srv.onMessage("NewOrder").mockEvent("OrderConfirm", (p) => ({
					price: p.price,
					orderId: `ORD-${p.price}`,
				}));

				// Batch sends
				api.sendMessage("NewOrder", { price: 1.9, amount: 4000 });
				api.sendMessage("NewOrder", { price: 0.99, amount: 7000 });
				api.sendMessage("NewOrder", { price: 0.85, amount: 8000 });

				// Filtered waits — each matcher routes to the correct response
				api.waitEvent("OrderConfirm", { matcher: (r) => r.price === 1.9 })
					.timeout(3000)
					.assert((r) => r.orderId === "ORD-1.9");

				api.waitEvent("OrderConfirm", { matcher: (r) => r.price === 0.99 })
					.timeout(3000)
					.assert((r) => r.orderId === "ORD-0.99");

				api.waitEvent("OrderConfirm", { matcher: (r) => r.price === 0.85 })
					.timeout(3000)
					.assert((r) => r.orderId === "ORD-0.85");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should correlate events with matchers when wait order differs from send order", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Parallel Send Filtered Wait (Reverse Wait Order)",
				components: [server, client],
			});

			const tc = testCase("3 sends + 3 filtered waits in reverse order", (test) => {
				const srv = test.use(server);
				const api = test.use(client);

				srv.onMessage("NewOrder").mockEvent("OrderConfirm", (p) => ({
					price: p.price,
					orderId: `ORD-${p.price}`,
				}));

				// Batch sends
				api.sendMessage("NewOrder", { price: 1.9, amount: 4000 });
				api.sendMessage("NewOrder", { price: 0.99, amount: 7000 });
				api.sendMessage("NewOrder", { price: 0.85, amount: 8000 });

				// Filtered waits in REVERSE order of sending — matchers still correlate
				api.waitEvent("OrderConfirm", { matcher: (r) => r.price === 0.85 })
					.timeout(3000)
					.assert((r) => r.orderId === "ORD-0.85");

				api.waitEvent("OrderConfirm", { matcher: (r) => r.price === 1.9 })
					.timeout(3000)
					.assert((r) => r.orderId === "ORD-1.9");

				api.waitEvent("OrderConfirm", { matcher: (r) => r.price === 0.99 })
					.timeout(3000)
					.assert((r) => r.orderId === "ORD-0.99");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should consume events in FIFO order for interleaved send-wait pattern", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "FIFO Interleaved Send-Wait",
				components: [server, client],
			});

			const tc = testCase("interleaved send+wait, FIFO order via skip-resolved", (test) => {
				const srv = test.use(server);
				const api = test.use(client);

				srv.onConnection("c1");

				// First send-wait pair
				api.sendMessage("Ping", { id: 1 });
				srv.waitMessage("Ping").timeout(2000).mockEvent("Pong", () => ({ id: 100 }));
				api.waitEvent("Pong")
					.timeout(3000)
					.assert((p) => p.id === 100);

				// Second send-wait pair — skip-resolved ensures second Pong goes to second hook
				api.sendMessage("Ping", { id: 2 });
				srv.waitMessage("Ping").timeout(2000).mockEvent("Pong", () => ({ id: 200 }));
				api.waitEvent("Pong")
					.timeout(3000)
					.assert((p) => p.id === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("AsyncServer: parallel messages + filtered waitMessage", () => {
		it("should correlate messages with matchers on server side", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Server Filtered WaitMessage",
				components: [server, client],
			});

			const tc = testCase("3 client messages + 3 filtered waitMessages", (test) => {
				const srv = test.use(server);
				const api = test.use(client);

				// Client sends 3 orders
				api.sendMessage("NewOrder", { price: 1.9, amount: 4000 });
				api.sendMessage("NewOrder", { price: 0.99, amount: 7000 });
				api.sendMessage("NewOrder", { price: 0.85, amount: 8000 });

				// Server uses filtered waitMessage to match each by price
				srv.waitMessage("NewOrder", { matcher: (p) => p.price === 1.9 })
					.timeout(3000)
					.assert((p) => p.amount === 4000);

				srv.waitMessage("NewOrder", { matcher: (p) => p.price === 0.99 })
					.timeout(3000)
					.assert((p) => p.amount === 7000);

				srv.waitMessage("NewOrder", { matcher: (p) => p.price === 0.85 })
					.timeout(3000)
					.assert((p) => p.amount === 8000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should correlate messages when wait order differs from send order", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Server Reverse Wait Order",
				components: [server, client],
			});

			const tc = testCase("3 messages + 3 filtered waitMessages in reverse order", (test) => {
				const srv = test.use(server);
				const api = test.use(client);

				api.sendMessage("NewOrder", { price: 1.9, amount: 4000 });
				api.sendMessage("NewOrder", { price: 0.99, amount: 7000 });
				api.sendMessage("NewOrder", { price: 0.85, amount: 8000 });

				// Wait in reverse order — matchers still correlate
				srv.waitMessage("NewOrder", { matcher: (p) => p.price === 0.85 })
					.timeout(3000)
					.assert((p) => p.amount === 8000);

				srv.waitMessage("NewOrder", { matcher: (p) => p.price === 1.9 })
					.timeout(3000)
					.assert((p) => p.amount === 4000);

				srv.waitMessage("NewOrder", { matcher: (p) => p.price === 0.99 })
					.timeout(3000)
					.assert((p) => p.amount === 7000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
