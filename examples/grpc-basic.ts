/**
 * Basic gRPC Example
 *
 * Demonstrates testing a gRPC-based API with testurio.
 *
 * Note: Requires a .proto file defining the service.
 */

import { GrpcUnaryProtocol } from "@testurio/protocol-grpc";
import { Client, Server, TestScenario, testCase } from "testurio";

// =============================================================================
// Type Definitions
// =============================================================================

// Service type definition matching the proto file
interface UserService {
	GetUser: {
		request: { user_id: number };
		response: { id: number; name: string; email: string };
	};
	CreateUser: {
		request: { name: string; email: string };
		response: { id: number; name: string; email: string };
	};
	DeleteUser: {
		request: { user_id: number };
		response: { success: boolean };
	};
}

// =============================================================================
// Proto Schema
// =============================================================================

// Path to the proto file (relative to project root)
const PROTO_PATH = "examples/proto/user-service.proto";
const SERVICE_NAME = "user.v1.UserService";

// =============================================================================
// Component Setup
// =============================================================================

// Create mock gRPC server
const grpcServer = new Server("grpc-backend", {
	protocol: new GrpcUnaryProtocol<UserService>({
		schema: PROTO_PATH,
		serviceName: SERVICE_NAME,
	}),
	listenAddress: { host: "localhost", port: 50051 },
});

// Create gRPC client
const grpcClient = new Client("grpc-client", {
	protocol: new GrpcUnaryProtocol<UserService>({
		schema: PROTO_PATH,
		serviceName: SERVICE_NAME,
	}),
	targetAddress: { host: "localhost", port: 50051 },
});

// Create the test scenario
const scenario = new TestScenario({
	name: "User gRPC Service Test",
	components: [grpcServer, grpcClient],
});

// Initialize server mock responses
scenario.init((test) => {
	const server = test.use(grpcServer);

	// Mock GetUser endpoint
	server.onRequest("GetUser", { user_id: 1 }).mockResponse(() => ({
		id: 1,
		name: "Alice",
		email: "alice@example.com",
	}));

	// Mock CreateUser endpoint
	server.onRequest("CreateUser").mockResponse((req) => ({
		id: 100,
		name: req.name ?? "Unknown",
		email: req.email ?? "unknown@example.com",
	}));

	// Mock DeleteUser endpoint
	server.onRequest("DeleteUser").mockResponse(() => ({
		success: true,
	}));
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: Get user by ID
const getUserTest = testCase("Get user by ID", (test) => {
	const client = test.use(grpcClient);

	// Client makes gRPC call
	client.request("GetUser", { user_id: 1 });

	// Verify response
	client.onResponse("GetUser").assert((response) => {
		return response.id === 1 && response.name === "Alice";
	});
});

// Test: Create new user
const createUserTest = testCase("Create new user", (test) => {
	const client = test.use(grpcClient);

	// Client makes gRPC call
	client.request("CreateUser", { name: "Bob", email: "bob@example.com" });

	// Verify response
	client.onResponse("CreateUser").assert((response) => {
		return response.name === "Bob" && response.email === "bob@example.com";
	});
});

// Test: Delete user
const deleteUserTest = testCase("Delete user", (test) => {
	const client = test.use(grpcClient);

	// Client makes gRPC call
	client.request("DeleteUser", { user_id: 1 });

	// Verify success
	client.onResponse("DeleteUser").assert((response) => {
		return response.success === true;
	});
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running gRPC tests...\n");

	try {
		const result1 = await scenario.run(getUserTest);
		console.log(`Get user: ${result1.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result2 = await scenario.run(createUserTest);
		console.log(`Create user: ${result2.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result3 = await scenario.run(deleteUserTest);
		console.log(`Delete user: ${result3.passed ? "✓ PASSED" : "✗ FAILED"}`);

		// Summary
		const allPassed = result1.passed && result2.passed && result3.passed;
		console.log(`\n${allPassed ? "All tests passed!" : "Some tests failed."}`);
		process.exit(allPassed ? 0 : 1);
	} catch (error) {
		console.error("Test execution failed:", error);
		process.exit(1);
	}
}

main();
