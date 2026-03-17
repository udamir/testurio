/**
 * AsyncClient Connection Control Integration Tests
 *
 * Tests the connection lifecycle features:
 * - autoConnect: false (default) — requires explicit connect()
 * - autoConnect: true — auto-connects on start
 * - connect() with dynamic params via factory function
 * - Reconnection flow (connect → disconnect → connect)
 * - Error on sendMessage before connect
 *
 * Port allocation: WS 16500-16599, TCP 16600-16699, gRPC 16700-16799
 */

import { GrpcStreamProtocol } from "@testurio/protocol-grpc";
import { TcpProtocol } from "@testurio/protocol-tcp";
import { WebSocketProtocol } from "@testurio/protocol-ws";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface SimpleWsService {
	clientMessages: {
		ping: { seq: number };
	};
	serverMessages: {
		pong: { seq: number };
	};
}

interface SimpleTcpService {
	clientMessages: {
		ping: { seq: number };
	};
	serverMessages: {
		pong: { seq: number };
	};
}

interface SimpleGrpcStreamService {
	clientMessages: {
		ping: { request_id: string; ping: { timestamp: number } };
	};
	serverMessages: {
		pong: { request_id: string; pong: { timestamp: number } };
	};
}

// Proto file path for gRPC tests
const TEST_PROTO = "tests/proto/test-service.proto";
const STREAM_SERVICE = "test.v1.StreamTestService";
const STREAM_METHOD = "DeliveryMessage";

// ============================================================================
// WebSocket Tests (ports 16500-16599)
// ============================================================================

describe("AsyncClient Connection Control", () => {
	describe("WebSocket", () => {
		it("WS-1: explicit connection (autoConnect: false default)", async () => {
			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				listenAddress: { host: "127.0.0.1", port: 16500 },
			});

			const client = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				targetAddress: { host: "127.0.0.1", port: 16500 },
				// autoConnect defaults to false
			});

			const scenario = new TestScenario({
				name: "WS explicit connect",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("explicit connect then send", (test) => {
				const ws = test.use(client);
				const mock = test.use(server);

				ws.connect();
				ws.sendMessage("ping", { seq: 1 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 1;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("WS-2: auto-connect opt-in (autoConnect: true)", async () => {
			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				listenAddress: { host: "127.0.0.1", port: 16510 },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol<SimpleWsService>(),
				targetAddress: { host: "127.0.0.1", port: 16510 },
			});

			const scenario = new TestScenario({
				name: "WS auto-connect",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("auto-connected, no explicit connect()", (test) => {
				const ws = test.use(client);
				const mock = test.use(server);

				// No connect() needed — connected automatically
				ws.sendMessage("ping", { seq: 2 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 2;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("WS-3: dynamic connect params via factory function", async () => {
			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				listenAddress: { host: "127.0.0.1", port: 16520 },
			});

			const client = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				targetAddress: { host: "127.0.0.1", port: 16520 },
			});

			const scenario = new TestScenario({
				name: "WS dynamic connect params",
				components: [server, client],
			});

			let factoryCallCount = 0;
			let received = false;

			const tc = testCase("connect with factory-resolved params", (test) => {
				const ws = test.use(client);
				const mock = test.use(server);

				// Factory function — evaluated at execution time
				ws.connect(() => {
					factoryCallCount++;
					return {
						headers: { "X-Token": "test-token-123" },
						query: { version: "2" },
					};
				});

				ws.sendMessage("ping", { seq: 3 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 3;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
			expect(factoryCallCount).toBe(1);
		});

		it("WS-4: reconnection flow (connect → disconnect → connect)", async () => {
			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				listenAddress: { host: "127.0.0.1", port: 16530 },
			});

			const client = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				targetAddress: { host: "127.0.0.1", port: 16530 },
			});

			const scenario = new TestScenario({
				name: "WS reconnection",
				components: [server, client],
			});

			let firstMessageReceived = false;
			let secondMessageReceived = false;

			const tc = testCase("connect, disconnect, reconnect", (test) => {
				const ws = test.use(client);
				const mock = test.use(server);

				// First connection
				ws.connect();
				ws.sendMessage("ping", { seq: 10 });

				mock.waitMessage("ping", { matcher: (p) => p.seq === 10 })
					.timeout(3000)
					.assert((payload) => {
						firstMessageReceived = true;
						return payload.seq === 10;
					});

				// Disconnect
				ws.disconnect();

				// Reconnect
				ws.connect();
				ws.sendMessage("ping", { seq: 20 });

				mock.waitMessage("ping", { matcher: (p) => p.seq === 20 })
					.timeout(3000)
					.assert((payload) => {
						secondMessageReceived = true;
						return payload.seq === 20;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(firstMessageReceived).toBe(true);
			expect(secondMessageReceived).toBe(true);
		});

		it("WS-6: auto-connect with object connect params (headers)", async () => {
			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				listenAddress: { host: "127.0.0.1", port: 16550 },
			});

			const client = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				targetAddress: { host: "127.0.0.1", port: 16550 },
				autoConnect: {
					headers: { "X-Token": "test-token" },
				},
			});

			const scenario = new TestScenario({
				name: "WS auto-connect with params",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("auto-connect with headers, no explicit connect()", (test) => {
				const ws = test.use(client);
				const mock = test.use(server);

				// No connect() needed — connected automatically with headers
				ws.sendMessage("ping", { seq: 6 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 6;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("WS-5: error on sendMessage before connect", async () => {
			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				listenAddress: { host: "127.0.0.1", port: 16540 },
			});

			const client = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<SimpleWsService>(),
				targetAddress: { host: "127.0.0.1", port: 16540 },
			});

			const scenario = new TestScenario({
				name: "WS send before connect error",
				components: [server, client],
			});

			const tc = testCase("sendMessage without connect should fail", (test) => {
				const ws = test.use(client);

				// No connect() — should fail
				ws.sendMessage("ping", { seq: 99 });
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error?.toLowerCase()).toContain("not connected");
		});
	});

	// ============================================================================
	// TCP Tests (ports 16600-16699)
	// ============================================================================

	describe("TCP", () => {
		it("TCP-1: explicit connection (autoConnect: false default)", async () => {
			const server = new AsyncServer("tcp-server", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				listenAddress: { host: "localhost", port: 16600 },
			});

			const client = new AsyncClient("tcp-client", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				targetAddress: { host: "localhost", port: 16600 },
			});

			const scenario = new TestScenario({
				name: "TCP explicit connect",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("explicit connect then send", (test) => {
				const tcp = test.use(client);
				const mock = test.use(server);

				tcp.connect();
				tcp.sendMessage("ping", { seq: 1 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 1;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("TCP-2: auto-connect opt-in (autoConnect: true)", async () => {
			const server = new AsyncServer("tcp-server", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				listenAddress: { host: "localhost", port: 16610 },
			});

			const client = new AsyncClient("tcp-client", {
				autoConnect: true,
				protocol: new TcpProtocol<SimpleTcpService>(),
				targetAddress: { host: "localhost", port: 16610 },
			});

			const scenario = new TestScenario({
				name: "TCP auto-connect",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("auto-connected, no explicit connect()", (test) => {
				const tcp = test.use(client);
				const mock = test.use(server);

				tcp.sendMessage("ping", { seq: 2 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 2;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("TCP-3: reconnection flow (connect → disconnect → connect)", async () => {
			const server = new AsyncServer("tcp-server", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				listenAddress: { host: "localhost", port: 16620 },
			});

			const client = new AsyncClient("tcp-client", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				targetAddress: { host: "localhost", port: 16620 },
			});

			const scenario = new TestScenario({
				name: "TCP reconnection",
				components: [server, client],
			});

			let firstMessageReceived = false;
			let secondMessageReceived = false;

			const tc = testCase("connect, disconnect, reconnect", (test) => {
				const tcp = test.use(client);
				const mock = test.use(server);

				tcp.connect();
				tcp.sendMessage("ping", { seq: 10 });

				mock.waitMessage("ping", { matcher: (p) => p.seq === 10 })
					.timeout(3000)
					.assert((payload) => {
						firstMessageReceived = true;
						return payload.seq === 10;
					});

				tcp.disconnect();

				tcp.connect();
				tcp.sendMessage("ping", { seq: 20 });

				mock.waitMessage("ping", { matcher: (p) => p.seq === 20 })
					.timeout(3000)
					.assert((payload) => {
						secondMessageReceived = true;
						return payload.seq === 20;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(firstMessageReceived).toBe(true);
			expect(secondMessageReceived).toBe(true);
		});

		it("TCP-4: connect with no params", async () => {
			const server = new AsyncServer("tcp-server", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				listenAddress: { host: "localhost", port: 16630 },
			});

			const client = new AsyncClient("tcp-client", {
				protocol: new TcpProtocol<SimpleTcpService>(),
				targetAddress: { host: "localhost", port: 16630 },
			});

			const scenario = new TestScenario({
				name: "TCP connect no params",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("connect without params", (test) => {
				const tcp = test.use(client);
				const mock = test.use(server);

				tcp.connect(); // No params — TCP has no protocol-specific params
				tcp.sendMessage("ping", { seq: 42 });

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.seq === 42;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});
	});

	// ============================================================================
	// gRPC Stream Tests (ports 16700-16799)
	// ============================================================================

	describe("gRPC Stream", () => {
		it("gRPC-1: explicit connection (autoConnect: false default)", async () => {
			const server = new AsyncServer("grpc-server", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({ protoPath: TEST_PROTO }),
				listenAddress: { host: "127.0.0.1", port: 16700 },
			});

			const client = new AsyncClient("grpc-client", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({
					protoPath: TEST_PROTO,
					serviceName: STREAM_SERVICE,
					methodName: STREAM_METHOD,
				}),
				targetAddress: { host: "127.0.0.1", port: 16700 },
			});

			const scenario = new TestScenario({
				name: "gRPC explicit connect",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("explicit connect then send", (test) => {
				const stream = test.use(client);
				const mock = test.use(server);

				stream.connect();
				stream.sendMessage("ping", {
					request_id: "REQ-001",
					ping: { timestamp: Date.now() },
				});

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.request_id === "REQ-001";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("gRPC-2: auto-connect opt-in (autoConnect: true)", async () => {
			const server = new AsyncServer("grpc-server", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({ protoPath: TEST_PROTO }),
				listenAddress: { host: "127.0.0.1", port: 16710 },
			});

			const client = new AsyncClient("grpc-client", {
				autoConnect: true,
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({
					protoPath: TEST_PROTO,
					serviceName: STREAM_SERVICE,
					methodName: STREAM_METHOD,
				}),
				targetAddress: { host: "127.0.0.1", port: 16710 },
			});

			const scenario = new TestScenario({
				name: "gRPC auto-connect",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("auto-connected, no explicit connect()", (test) => {
				const stream = test.use(client);
				const mock = test.use(server);

				stream.sendMessage("ping", {
					request_id: "REQ-002",
					ping: { timestamp: Date.now() },
				});

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.request_id === "REQ-002";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("gRPC-3: dynamic connect params with metadata", async () => {
			const server = new AsyncServer("grpc-server", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({ protoPath: TEST_PROTO }),
				listenAddress: { host: "127.0.0.1", port: 16720 },
			});

			const client = new AsyncClient("grpc-client", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({
					protoPath: TEST_PROTO,
					serviceName: STREAM_SERVICE,
					methodName: STREAM_METHOD,
				}),
				targetAddress: { host: "127.0.0.1", port: 16720 },
			});

			const scenario = new TestScenario({
				name: "gRPC dynamic connect params",
				components: [server, client],
			});

			let factoryCallCount = 0;
			let received = false;

			const tc = testCase("connect with factory-resolved metadata", (test) => {
				const stream = test.use(client);
				const mock = test.use(server);

				// Factory function — evaluated at execution time
				stream.connect(() => {
					factoryCallCount++;
					return {
						metadata: { authorization: "Bearer test-token" },
					};
				});

				stream.sendMessage("ping", {
					request_id: "REQ-003",
					ping: { timestamp: Date.now() },
				});

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.request_id === "REQ-003";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
			expect(factoryCallCount).toBe(1);
		});

		it("gRPC-5: auto-connect with object metadata", async () => {
			const server = new AsyncServer("grpc-server", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({ protoPath: TEST_PROTO }),
				listenAddress: { host: "127.0.0.1", port: 16740 },
			});

			const client = new AsyncClient("grpc-client", {
				autoConnect: {
					metadata: { authorization: "Bearer token" },
				},
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({
					protoPath: TEST_PROTO,
					serviceName: STREAM_SERVICE,
					methodName: STREAM_METHOD,
				}),
				targetAddress: { host: "127.0.0.1", port: 16740 },
			});

			const scenario = new TestScenario({
				name: "gRPC auto-connect with metadata",
				components: [server, client],
			});

			let received = false;

			const tc = testCase("auto-connect with metadata, no explicit connect()", (test) => {
				const stream = test.use(client);
				const mock = test.use(server);

				// No connect() needed — connected automatically with metadata
				stream.sendMessage("ping", {
					request_id: "REQ-005",
					ping: { timestamp: Date.now() },
				});

				mock.waitMessage("ping").timeout(3000).assert((payload) => {
					received = true;
					return payload.request_id === "REQ-005";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(received).toBe(true);
		});

		it("gRPC-4: reconnection flow (connect → disconnect → connect)", async () => {
			const server = new AsyncServer("grpc-server", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({ protoPath: TEST_PROTO }),
				listenAddress: { host: "127.0.0.1", port: 16730 },
			});

			const client = new AsyncClient("grpc-client", {
				protocol: new GrpcStreamProtocol<SimpleGrpcStreamService>({
					protoPath: TEST_PROTO,
					serviceName: STREAM_SERVICE,
					methodName: STREAM_METHOD,
				}),
				targetAddress: { host: "127.0.0.1", port: 16730 },
			});

			const scenario = new TestScenario({
				name: "gRPC reconnection",
				components: [server, client],
			});

			let firstMessageReceived = false;
			let secondMessageReceived = false;

			const tc = testCase("connect, disconnect, reconnect", (test) => {
				const stream = test.use(client);
				const mock = test.use(server);

				stream.connect();
				stream.sendMessage("ping", {
					request_id: "REQ-FIRST",
					ping: { timestamp: Date.now() },
				});

				mock.waitMessage("ping", { matcher: (p) => p.request_id === "REQ-FIRST" })
					.timeout(3000)
					.assert((payload) => {
						firstMessageReceived = true;
						return payload.request_id === "REQ-FIRST";
					});

				stream.disconnect();

				stream.connect();
				stream.sendMessage("ping", {
					request_id: "REQ-SECOND",
					ping: { timestamp: Date.now() },
				});

				mock.waitMessage("ping", { matcher: (p) => p.request_id === "REQ-SECOND" })
					.timeout(3000)
					.assert((payload) => {
						secondMessageReceived = true;
						return payload.request_id === "REQ-SECOND";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(firstMessageReceived).toBe(true);
			expect(secondMessageReceived).toBe(true);
		});
	});
});
