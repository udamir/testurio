/**
 * gRPC Adapter Tests
 *
 * Tests for @grpc/grpc-js based gRPC adapter implementation.
 * Note: Full integration tests require loading .proto schemas.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GrpcUnaryAdapter, GrpcStreamAdapter } from "@testurio/adapter-grpc";

// Proto file path for test service
const TEST_PROTO = "tests/proto/test-service.proto";

describe("GrpcUnaryAdapter", () => {
	let adapter: GrpcUnaryAdapter;
	let port: number;

	beforeEach(() => {
		adapter = new GrpcUnaryAdapter();
		// Use random port to avoid conflicts
		port = 10000 + Math.floor(Math.random() * 50000);
	});

	afterEach(async () => {
		await adapter.dispose();
	});

	describe("characteristics", () => {
		it("should have correct type", () => {
			expect(adapter.type).toBe("grpc-unary");
		});

		it("should have correct characteristics", () => {
			expect(adapter.characteristics).toEqual({
				type: "grpc-unary",
				async: false,
				supportsProxy: true,
				supportsMock: true,
				streaming: false,
				requiresConnection: true,
				bidirectional: false,
			});
		});
	});

	describe("loadSchema", () => {
		it("should load schema and extract services", async () => {
			// Use a real proto file with a service definition
			// Include directories are automatically derived from proto file paths
			const schema = await adapter.loadSchema(TEST_PROTO);

			expect(schema.type).toBe("protobuf");
			expect(schema.validate).toBe(true);
			expect(schema.content).toHaveProperty("packageDefinition");
			expect(schema.content).toHaveProperty("grpcObject");
			expect(schema.content).toHaveProperty("services");
		});

		it("should load multiple schema paths", async () => {
			const schema = await adapter.loadSchema([TEST_PROTO]);

			expect(schema.type).toBe("protobuf");
			expect(schema.content).toHaveProperty("grpcObject");
			// Should have services extracted
			const services = (schema.content as { services: string[] }).services;
			expect(services.length).toBeGreaterThan(0);
		});
	});

	describe("getServiceClient", () => {
		it("should return undefined when no schema loaded", () => {
			const client = adapter.getServiceClient("SomeService");
			expect(client).toBeUndefined();
		});

		it("should return service client constructor after loading schema", async () => {
			await adapter.loadSchema(TEST_PROTO);

			// The service is defined as TransportService in cbridge.net.v1 package
			const client = adapter.getServiceClient("test.v1.TestService");
			expect(client).toBeDefined();
			expect(typeof client).toBe("function");
		});

		it("should return undefined for non-existent service", async () => {
			await adapter.loadSchema(TEST_PROTO);

			const client = adapter.getServiceClient("NonExistentService");
			expect(client).toBeUndefined();
		});
	});

	describe("startServer", () => {
		it("should start server with listen address", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(handle.id).toMatch(/^grpc-server-/);
			expect(handle.type).toBe("grpc-unary");
			expect(handle.address.host).toBe("127.0.0.1");
			expect(handle.isRunning).toBe(true);
		});

		it("should start proxy server with target address", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
				targetAddress: { host: "backend", port: 9090 },
			});

			expect(handle.isRunning).toBe(true);
			expect(handle._internal.isProxy).toBe(true);
			expect(handle._internal.targetAddress).toEqual({ host: "backend", port: 9090 });
		});

		it("should start server with loaded schema", async () => {
			await adapter.loadSchema(TEST_PROTO);

			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(handle.isRunning).toBe(true);
			expect(handle._internal.schema).toBeDefined();
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await adapter.stopServer(handle);

			expect(handle.isRunning).toBe(false);
		});

		it("should throw for unknown server", async () => {
			await expect(adapter.stopServer({
				id: "unknown",
				type: "grpc-unary",
				address: { host: "127.0.0.1", port },
				isRunning: true,
			})).rejects.toThrow("Server unknown not found");
		});
	});

	describe("createClient", () => {
		it("should throw when no schema loaded", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await expect(adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "SomeService" },
			})).rejects.toThrow("Service SomeService not found");
		});

		it("should create client with valid service", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			expect(handle.id).toMatch(/^grpc-client-/);
			expect(handle.type).toBe("grpc-unary");
			expect(handle.isConnected).toBe(true);
			expect(handle._internal.serviceName).toBe("test.v1.TestService");
		});
	});

	describe("closeClient", () => {
		it("should close client connection", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			await adapter.closeClient(handle);

			expect(handle.isConnected).toBe(false);
		});

		it("should throw for unknown client", async () => {
			await expect(adapter.closeClient({
				id: "unknown",
				type: "grpc-unary",
				address: { host: "127.0.0.1", port },
				isConnected: true,
			})).rejects.toThrow("Client unknown not found");
		});
	});

	describe("request", () => {
		it("should throw for unknown client", async () => {
			await expect(adapter.request(
				{ id: "unknown", type: "grpc-unary", address: { host: "127.0.0.1", port }, isConnected: true },
				"GetUser",
				{ payload: { id: 1 } },
			)).rejects.toThrow("Client unknown not found");
		});

		it("should throw for disconnected client", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});
			await adapter.closeClient(handle);

			await expect(adapter.request(handle, "DeliveryMessage", { payload: {} }))
				.rejects.toThrow("not found");
		});
	});
});

describe("GrpcStreamAdapter", () => {
	let adapter: GrpcStreamAdapter;
	let port: number;

	beforeEach(() => {
		adapter = new GrpcStreamAdapter();
		port = 10000 + Math.floor(Math.random() * 50000);
	});

	afterEach(async () => {
		await adapter.dispose();
	});

	describe("characteristics", () => {
		it("should have correct type", () => {
			expect(adapter.type).toBe("grpc-stream");
		});

		it("should have correct characteristics", () => {
			expect(adapter.characteristics).toEqual({
				type: "grpc-stream",
				async: true,
				supportsProxy: true,
				supportsMock: true,
				streaming: true,
				requiresConnection: true,
				bidirectional: true,
			});
		});
	});

	describe("loadSchema", () => {
		it("should load schema and extract services", async () => {
			const schema = await adapter.loadSchema(TEST_PROTO);

			expect(schema.type).toBe("protobuf");
			expect(schema.content).toHaveProperty("grpcObject");
			expect(schema.content).toHaveProperty("services");
		});
	});

	describe("getServiceClient", () => {
		it("should return undefined when no schema loaded", () => {
			const client = adapter.getServiceClient("SomeService");
			expect(client).toBeUndefined();
		});

		it("should return service client constructor after loading schema", async () => {
			await adapter.loadSchema(TEST_PROTO);

			const client = adapter.getServiceClient("test.v1.TestService");
			expect(client).toBeDefined();
		});
	});

	describe("startServer", () => {
		it("should start streaming server", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(handle.id).toMatch(/^grpc-stream-server-/);
			expect(handle.type).toBe("grpc-stream");
			expect(handle.isRunning).toBe(true);
			expect(handle._internal.isStreaming).toBe(true);
		});

		it("should start server with loaded schema", async () => {
			await adapter.loadSchema(TEST_PROTO);

			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(handle.isRunning).toBe(true);
			expect(handle._internal.schema).toBeDefined();
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await adapter.stopServer(handle);

			expect(handle.isRunning).toBe(false);
		});

		it("should throw for unknown server", async () => {
			await expect(adapter.stopServer({
				id: "unknown",
				type: "grpc-stream",
				address: { host: "127.0.0.1", port },
				isRunning: true,
			})).rejects.toThrow("Server unknown not found");
		});
	});

	describe("createClient", () => {
		it("should throw when no schema loaded", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await expect(adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "SomeService" },
			})).rejects.toThrow("Service SomeService not found");
		});

		it("should create streaming client with valid service", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			expect(handle.id).toMatch(/^grpc-stream-client-/);
			expect(handle.isConnected).toBe(true);
			expect(handle._internal.serviceName).toBe("test.v1.TestService");
		});
	});

	describe("closeClient", () => {
		it("should close streaming client", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			await adapter.closeClient(handle);

			expect(handle.isConnected).toBe(false);
		});

		it("should throw for unknown client", async () => {
			await expect(adapter.closeClient({
				id: "unknown",
				type: "grpc-stream",
				address: { host: "127.0.0.1", port },
				isConnected: true,
			})).rejects.toThrow("Client unknown not found");
		});

		it("should reject pending messages on close", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			// Add a pending message
			let rejectedError: Error | undefined;
			const timeoutHandle = setTimeout(() => {}, 10000);
			handle._internal.pendingMessages.set("pending-1", {
				resolve: () => {},
				reject: (err: Error) => { rejectedError = err; },
				messageType: "response",
				timeout: timeoutHandle,
			});

			await adapter.closeClient(handle);

			expect(rejectedError).toBeDefined();
			expect(rejectedError?.message).toBe("Client disconnected");
		});
	});

	describe("sendMessage", () => {
		it("should throw for unknown client", async () => {
			await expect(adapter.sendMessage(
				{ id: "unknown", type: "grpc-stream", address: { host: "127.0.0.1", port }, isConnected: true },
				"TestMessage",
				{ data: "test" },
			)).rejects.toThrow("Client unknown not found");
		});

		it("should throw for disconnected client", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});
			await adapter.closeClient(handle);

			await expect(adapter.sendMessage(handle, "TestMessage", {}))
				.rejects.toThrow("not found");
		});
	});

	describe("waitForMessage", () => {
		it("should throw for unknown client", async () => {
			await expect(adapter.waitForMessage(
				{ id: "unknown", type: "grpc-stream", address: { host: "127.0.0.1", port }, isConnected: true },
				"TestMessage",
			)).rejects.toThrow("Client unknown not found");
		});

		it("should throw for disconnected client", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});
			await adapter.closeClient(handle);

			await expect(adapter.waitForMessage(handle, "TestMessage"))
				.rejects.toThrow("not found");
		});

		it("should timeout when no message received", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			await expect(adapter.waitForMessage(client, "TestMessage", undefined, 50))
				.rejects.toThrow("Timeout waiting for message type: TestMessage");
		});

		it("should return queued message immediately", async () => {
			await adapter.loadSchema(TEST_PROTO);

			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
				options: { serviceName: "test.v1.TestService" },
			});

			// Pre-queue a message
			handle._internal.messageQueue.push({
				type: "TestResponse",
				payload: { data: "queued" },
			});

			const message = await adapter.waitForMessage(handle, "TestResponse");

			expect(message.type).toBe("TestResponse");
			expect(message.payload).toEqual({ data: "queued" });
		});
	});
});
