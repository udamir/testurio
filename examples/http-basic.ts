/**
 * Basic HTTP Example
 *
 * Demonstrates testing a simple HTTP API with testurio.
 */

import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";

// =============================================================================
// Type Definitions
// =============================================================================

interface User {
	id: number;
	name: string;
	email: string;
}

interface CreateUserPayload {
	name: string;
	email: string;
}

// Type-safe HTTP service definition
interface UserApiService {
	getUser: {
		request: { method: "GET"; path: "/users/{id}" };
		response: { code: 200; body: User };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body: CreateUserPayload };
		response: { code: 201; body: User };
	};
}

// =============================================================================
// Component Setup
// =============================================================================

// Create mock backend server
const backendServer = new Server("backend", {
	protocol: new HttpProtocol<UserApiService>(),
	listenAddress: { host: "localhost", port: 3000 },
});

// Create HTTP client
const apiClient = new Client("api", {
	protocol: new HttpProtocol<UserApiService>(),
	targetAddress: { host: "localhost", port: 3000 },
});

// Create the test scenario
const scenario = new TestScenario({
	name: "User API Test",
	components: [backendServer, apiClient],
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: GET user by ID
const getUserTest = testCase("Get user by ID", (test) => {
	const api = test.use(apiClient);
	const backend = test.use(backendServer);

	// Step 1: Client sends GET request
	api.request("getUser", { method: "GET", path: "/users/1" });

	// Step 2: Mock returns user data
	backend.onRequest("getUser", { method: "GET", path: "/users/1" }).mockResponse(() => ({
		code: 200,
		headers: { "Content-Type": "application/json" },
		body: { id: 1, name: "Alice", email: "alice@example.com" },
	}));

	// Step 3: Verify response
	api.onResponse("getUser").assert((response) => {
		return response.code === 200 && response.body.name === "Alice";
	});
});

// Test: POST create user
const createUserTest = testCase("Create new user", (test) => {
	const api = test.use(apiClient);
	const backend = test.use(backendServer);

	// Step 1: Client sends POST request
	api.request("createUser", {
		method: "POST",
		path: "/users",
		body: { name: "Bob", email: "bob@example.com" },
		headers: { "Content-Type": "application/json" },
	});

	// Step 2: Mock handles creation
	backend.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse((req) => ({
		code: 201,
		headers: { "Content-Type": "application/json" },
		body: {
			id: 2,
			name: (req.body as CreateUserPayload)?.name ?? "Unknown",
			email: (req.body as CreateUserPayload)?.email ?? "unknown@example.com",
		},
	}));

	// Step 3: Verify response
	api.onResponse("createUser").assert((response) => {
		return response.code === 201 && response.body.name === "Bob";
	});
});

// Test: Request with timeout configuration
const timeoutTest = testCase("Request with timeout", (test) => {
	const api = test.use(apiClient);
	const backend = test.use(backendServer);

	// Request with explicit timeout
	api.request("getUser", { method: "GET", path: "/users/1", timeout: 5000 });

	backend
		.onRequest("getUser", { method: "GET", path: "/users/1" })
		.delay(100) // Simulate 100ms delay
		.mockResponse(() => ({
			code: 200,
			body: { id: 1, name: "Charlie", email: "charlie@example.com" },
		}));

	api.onResponse("getUser").assert((response) => {
		return response.body.name === "Charlie";
	});
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running HTTP tests...\n");

	try {
		const result1 = await scenario.run(getUserTest);
		console.log(`Get user: ${result1.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result2 = await scenario.run(createUserTest);
		console.log(`Create user: ${result2.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result3 = await scenario.run(timeoutTest);
		console.log(`Request with timeout: ${result3.passed ? "✓ PASSED" : "✗ FAILED"}`);

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
