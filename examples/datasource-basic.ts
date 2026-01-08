/**
 * Basic DataSource Example
 *
 * Demonstrates testing with DataSource component for database/cache operations.
 * This example shows how to integrate DataSource with network components.
 *
 * Note: This example uses FakeAdapter for demonstration.
 * In real tests, use @testurio/adapter-redis, @testurio/adapter-pg, or @testurio/adapter-mongo.
 */

import {
	Client,
	createFakeAdapter,
	createInMemoryClient,
	DataSource,
	HttpProtocol,
	Server,
	TestScenario,
	testCase,
} from "testurio";

// =============================================================================
// Type Definitions
// =============================================================================

interface User {
	id: number;
	name: string;
	email: string;
}

// Type-safe HTTP service definition
interface UserApiService {
	getUser: {
		request: { method: "GET"; path: "/users/1" };
		response: { code: 200; body: User };
	};
}

// =============================================================================
// Component Setup
// =============================================================================

// Create in-memory client for testing
const cacheClient = createInMemoryClient();

// Create cache DataSource with fake adapter
const cache = new DataSource("cache", {
	adapter: createFakeAdapter(cacheClient),
});

// Create mock backend server
const backendServer = new Server("backend", {
	protocol: new HttpProtocol<UserApiService>(),
	listenAddress: { host: "localhost", port: 4000 },
});

// Create HTTP client
const apiClient = new Client("api", {
	protocol: new HttpProtocol<UserApiService>(),
	targetAddress: { host: "localhost", port: 4000 },
});

// Create the test scenario with all components
const scenario = new TestScenario({
	name: "Cache Integration Test",
	components: [cache, backendServer, apiClient],
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: Setup cache before API request
const cacheSetupTest = testCase("Setup cache before API test", (test) => {
	const redis = test.use(cache);
	const api = test.use(apiClient);
	const backend = test.use(backendServer);

	// Step 1: Populate cache with test data
	redis.exec("setup user in cache", async (client) => {
		client.set("user:1", { id: 1, name: "Alice", email: "alice@example.com" });
	});

	// Step 2: Make API request
	api.request("getUser", { method: "GET", path: "/users/1" });

	// Step 3: Mock returns data (simulating cache hit)
	backend.onRequest("getUser", { method: "GET", path: "/users/1" }).mockResponse(() => ({
		code: 200,
		body: { id: 1, name: "Alice", email: "alice@example.com" },
	}));

	// Step 4: Verify response
	api.onResponse("getUser").assert((res) => res.body.name === "Alice");

	// Step 5: Verify cache still has data
	redis
		.exec("verify cache", async (client) => client.get("user:1"))
		.assert("user should be in cache", (result) => result !== null);
});

// Test: Verify cache after API response
const cacheVerifyTest = testCase("Verify cache populated after API", (test) => {
	const redis = test.use(cache);
	const api = test.use(apiClient);
	const backend = test.use(backendServer);

	// Step 1: Ensure cache is empty
	redis.exec("clear cache", async (client) => {
		client.del("user:2");
	});

	// Step 2: Make API request
	api.request("getUser", { method: "GET", path: "/users/1" });

	// Step 3: Mock returns data and simulates caching
	backend.onRequest("getUser", { method: "GET", path: "/users/1" }).mockResponse(() => {
		// Simulate backend caching the response
		cacheClient.set("user:2", { id: 2, name: "Bob", email: "bob@example.com" });
		return {
			code: 200,
			body: { id: 2, name: "Bob", email: "bob@example.com" },
		};
	});

	// Step 4: Verify response
	api.onResponse("getUser").assert((res) => res.body.name === "Bob");

	// Step 5: Verify cache was populated
	redis
		.exec("check cache populated", async (client) => client.get("user:2"))
		.assert("user should be cached", (result) => {
			const user = result as User | null;
			return user !== null && user.name === "Bob";
		});
});

// Test: DataSource operations with assertions
const assertionTest = testCase("DataSource with chained assertions", (test) => {
	const redis = test.use(cache);

	// Setup test data
	redis.exec(async (client) => {
		client.set("counter", 0);
		client.set("user:test", { id: 99, name: "Test User", email: "test@example.com" });
	});

	// Verify counter
	redis
		.exec("get counter", async (client) => client.get("counter"))
		.assert("counter should be zero", (result) => result === 0);

	// Verify user with multiple assertions
	redis
		.exec("get user", async (client) => client.get("user:test"))
		.assert("user should exist", (result) => result !== null)
		.assert("user should have correct id", (result) => {
			const user = result as User;
			return user.id === 99;
		})
		.assert("user should have correct name", (result) => {
			const user = result as User;
			return user.name === "Test User";
		});
});

// Test: DataSource with timeout
const timeoutTest = testCase("DataSource with timeout", (test) => {
	const redis = test.use(cache);

	// Execute with timeout option
	redis.exec(
		"fast operation",
		async (client) => {
			client.set("fast-key", "fast-value");
			return client.get("fast-key");
		},
		{ timeout: 1000 }
	);
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running DataSource tests...\n");

	try {
		const result1 = await scenario.run(cacheSetupTest);
		console.log(`Cache setup: ${result1.passed ? "PASSED" : "FAILED"}`);

		const result2 = await scenario.run(cacheVerifyTest);
		console.log(`Cache verify: ${result2.passed ? "PASSED" : "FAILED"}`);

		const result3 = await scenario.run(assertionTest);
		console.log(`Assertions: ${result3.passed ? "PASSED" : "FAILED"}`);

		const result4 = await scenario.run(timeoutTest);
		console.log(`Timeout: ${result4.passed ? "PASSED" : "FAILED"}`);

		// Summary
		const allPassed = result1.passed && result2.passed && result3.passed && result4.passed;
		console.log(`\n${allPassed ? "All tests passed!" : "Some tests failed."}`);
		process.exit(allPassed ? 0 : 1);
	} catch (error) {
		console.error("Test execution failed:", error);
		process.exit(1);
	}
}

main();
