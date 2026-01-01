/**
 * gRPC Protocol Tests
 *
 * Tests for @grpc/grpc-js based gRPC protocol implementation.
 * Note: Full integration tests require loading .proto schemas.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GrpcUnaryProtocol, GrpcStreamProtocol } from "@testurio/protocol-grpc";

// Proto file path for test service
const TEST_PROTO = "tests/proto/test-service.proto";

describe("GrpcUnaryProtocol", () => {
	let protocol: GrpcUnaryProtocol;
	let port: number;

	beforeEach(() => {
		protocol = new GrpcUnaryProtocol();
		// Use random port to avoid conflicts
		port = 10000 + Math.floor(Math.random() * 50000);
	});

	afterEach(async () => {
		await protocol.dispose();
	});

	describe("type", () => {
		it("should have correct type", () => {
			expect(protocol.type).toBe("grpc-unary");
		});
	});

	describe("loadSchema", () => {
		it("should load schema and extract services", async () => {
			const schema = await protocol.loadSchema(TEST_PROTO);

			expect(schema.type).toBe("protobuf");
			expect(schema.validate).toBe(true);
			expect(schema.content).toHaveProperty("packageDefinition");
			expect(schema.content).toHaveProperty("grpcObject");
			expect(schema.content).toHaveProperty("services");
		});

		it("should load multiple schema paths", async () => {
			const schema = await protocol.loadSchema([TEST_PROTO]);

			expect(schema.type).toBe("protobuf");
			expect(schema.content).toHaveProperty("grpcObject");
			const services = (schema.content as { services: string[] }).services;
			expect(services.length).toBeGreaterThan(0);
		});
	});

	describe("getServiceClient", () => {
		it("should return undefined when no schema loaded", () => {
			const client = protocol.getServiceClient("SomeService");
			expect(client).toBeUndefined();
		});

		it("should return service client constructor after loading schema", async () => {
			await protocol.loadSchema(TEST_PROTO);

			const client = protocol.getServiceClient("test.v1.TestService");
			expect(client).toBeDefined();
			expect(typeof client).toBe("function");
		});

		it("should return undefined for non-existent service", async () => {
			await protocol.loadSchema(TEST_PROTO);

			const client = protocol.getServiceClient("NonExistentService");
			expect(client).toBeUndefined();
		});
	});

	describe("startServer", () => {
		it("should start server with listen address", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(protocol.server.isRunning).toBe(true);
		});

		it("should start server with loaded schema", async () => {
			await protocol.loadSchema(TEST_PROTO);

			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(protocol.server.isRunning).toBe(true);
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.stopServer();

			expect(protocol.server.isRunning).toBe(false);
		});

		it("should handle stopServer when no server running", async () => {
			// Should not throw
			await protocol.stopServer();
			expect(protocol.server.isRunning).toBe(false);
		});
	});

	describe("createClient", () => {
		it("should throw when no schema loaded", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await expect(protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			})).rejects.toThrow("not found");
		});

		it("should create client with valid service", async () => {
			// Create protocol with serviceName option
			const protocolWithService = new GrpcUnaryProtocol({
				schema: TEST_PROTO,
				serviceName: "test.v1.TestService",
			});

			await protocolWithService.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocolWithService.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			expect(protocolWithService.client.isConnected).toBe(true);
			await protocolWithService.dispose();
		});
	});

	describe("closeClient", () => {
		it("should close client connection", async () => {
			const protocolWithService = new GrpcUnaryProtocol({
				schema: TEST_PROTO,
				serviceName: "test.v1.TestService",
			});

			await protocolWithService.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocolWithService.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await protocolWithService.closeClient();

			expect(protocolWithService.client.isConnected).toBe(false);
			await protocolWithService.dispose();
		});

		it("should handle closeClient when no client exists", async () => {
			// Should not throw
			await protocol.closeClient();
			expect(protocol.client.isConnected).toBe(false);
		});
	});

	describe("request", () => {
		it("should throw when client not connected", async () => {
			await expect(protocol.request("GetUser", { payload: { id: 1 } }))
				.rejects.toThrow("Client is not connected");
		});
	});
});

describe("GrpcStreamProtocol", () => {
	let protocol: GrpcStreamProtocol;
	let port: number;

	beforeEach(() => {
		protocol = new GrpcStreamProtocol();
		port = 10000 + Math.floor(Math.random() * 50000);
	});

	afterEach(async () => {
		await protocol.dispose();
	});

	describe("type", () => {
		it("should have correct type", () => {
			expect(protocol.type).toBe("grpc-stream");
		});
	});

	describe("loadSchema", () => {
		it("should load schema and extract services", async () => {
			const schema = await protocol.loadSchema(TEST_PROTO);

			expect(schema.type).toBe("protobuf");
			expect(schema.content).toHaveProperty("grpcObject");
			expect(schema.content).toHaveProperty("services");
		});
	});

	describe("getServiceClient", () => {
		it("should return undefined when no schema loaded", () => {
			const client = protocol.getServiceClient("SomeService");
			expect(client).toBeUndefined();
		});

		it("should return service client constructor after loading schema", async () => {
			await protocol.loadSchema(TEST_PROTO);

			const client = protocol.getServiceClient("test.v1.TestService");
			expect(client).toBeDefined();
		});
	});

	describe("startServer", () => {
		it("should start streaming server", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(protocol.server.isRunning).toBe(true);
		});

		it("should start server with loaded schema", async () => {
			await protocol.loadSchema(TEST_PROTO);

			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(protocol.server.isRunning).toBe(true);
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.stopServer();

			expect(protocol.server.isRunning).toBe(false);
		});

		it("should handle stopServer when no server running", async () => {
			await protocol.stopServer();
			expect(protocol.server.isRunning).toBe(false);
		});
	});

	describe("createClient", () => {
		it("should throw when no schema loaded", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await expect(protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			})).rejects.toThrow("not found");
		});

		it("should create streaming client with valid service", async () => {
			const protocolWithService = new GrpcStreamProtocol({
				schema: TEST_PROTO,
				serviceName: "test.v1.TestService",
			});

			await protocolWithService.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocolWithService.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			expect(protocolWithService.client.isConnected).toBe(true);
			await protocolWithService.dispose();
		});
	});

	describe("closeClient", () => {
		it("should close streaming client", async () => {
			const protocolWithService = new GrpcStreamProtocol({
				schema: TEST_PROTO,
				serviceName: "test.v1.TestService",
			});

			await protocolWithService.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocolWithService.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await protocolWithService.closeClient();

			expect(protocolWithService.client.isConnected).toBe(false);
			await protocolWithService.dispose();
		});

		it("should handle closeClient when no client exists", async () => {
			await protocol.closeClient();
			expect(protocol.client.isConnected).toBe(false);
		});
	});

	describe("sendMessage", () => {
		it("should throw when client not connected", async () => {
			await expect(protocol.sendMessage("TestMessage", { data: "test" }))
				.rejects.toThrow("Client is not connected");
		});
	});

	describe("waitForMessage", () => {
		it("should throw when client not connected", async () => {
			await expect(protocol.waitForMessage("TestMessage"))
				.rejects.toThrow("Client is not connected");
		});
	});
});
