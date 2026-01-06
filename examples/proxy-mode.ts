/**
 * Proxy Mode Example
 *
 * Demonstrates using testurio in proxy mode to intercept and
 * modify messages between a client and server.
 *
 * In proxy mode, AsyncServer acts as a man-in-the-middle:
 * - Listens for client connections on listenAddress
 * - Forwards messages to the real backend at targetAddress
 * - Allows inspection and transformation of messages via hooks
 */

import { TcpProtocol, type TcpServiceDefinition } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";

// =============================================================================
// Type Definitions
// =============================================================================

interface RequestMessage {
	id: string;
	action: string;
	data: string;
}

interface ResponseMessage {
	id: string;
	result: string;
	timestamp: number;
}

// Type-safe TCP service definition
interface ProxyTestService extends TcpServiceDefinition {
	clientMessages: {
		Request: RequestMessage;
	};
	serverMessages: {
		Response: ResponseMessage;
	};
}

// =============================================================================
// Component Setup
// =============================================================================

// Real backend server (the actual service being tested)
const backendServer = new AsyncServer("backend", {
	protocol: new TcpProtocol<ProxyTestService>(),
	listenAddress: { host: "localhost", port: 9100 },
});

// Proxy server (intercepts traffic between client and backend)
// Note: Both listenAddress AND targetAddress are specified
const proxyServer = new AsyncServer("proxy", {
	protocol: new TcpProtocol<ProxyTestService>(),
	listenAddress: { host: "localhost", port: 9101 },
	targetAddress: { host: "localhost", port: 9100 }, // Forwards to backend
});

// Client connects to the proxy (not directly to backend)
const client = new AsyncClient("client", {
	protocol: new TcpProtocol<ProxyTestService>(),
	targetAddress: { host: "localhost", port: 9101 }, // Connects to proxy
});

// Create the test scenario with all components
const scenario = new TestScenario({
	name: "Proxy Mode Test",
	components: [backendServer, proxyServer, client],
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: Message passes through proxy to backend
const passthroughTest = testCase("Passthrough mode", (test) => {
	const api = test.use(client);
	const backend = test.use(backendServer);

	// Backend handles incoming requests
	backend.onMessage("Request").mockEvent("Response", (payload) => ({
		id: payload.id,
		result: `Processed: ${payload.action}`,
		timestamp: Date.now(),
	}));

	// Client sends request (goes through proxy to backend)
	api.sendMessage("Request", { id: "req-1", action: "get", data: "item-123" });

	// Client receives response (comes back through proxy)
	api.waitEvent("Response", { timeout: 2000 }).assert((msg) => {
		return msg.id === "req-1" && msg.result.includes("Processed");
	});
});

// Test: Inspect messages at proxy
const inspectionTest = testCase("Message inspection", (test) => {
	const api = test.use(client);
	const proxy = test.use(proxyServer);
	const backend = test.use(backendServer);

	// Backend handles requests normally
	backend.onMessage("Request").mockEvent("Response", (payload) => ({
		id: payload.id,
		result: "success",
		timestamp: Date.now(),
	}));

	// Proxy can observe messages passing through
	// This verifies the message was seen by the proxy
	proxy.waitMessage("Request", { timeout: 2000 }).assert((msg) => {
		return msg.action === "inspect-me";
	});

	// Client sends message
	api.sendMessage("Request", {
		id: "req-2",
		action: "inspect-me",
		data: "sensitive-data",
	});

	// Client still receives the response
	api.waitEvent("Response", { timeout: 2000 }).assert((msg) => {
		return msg.id === "req-2";
	});
});

// Test: Transform messages at proxy using hooks
const transformTest = testCase("Message transformation", (test) => {
	const api = test.use(client);
	const proxy = test.use(proxyServer);
	const backend = test.use(backendServer);

	// Proxy transforms outgoing requests by adding metadata
	proxy.onMessage("Request").transform((msg) => ({
		...msg,
		data: `[TRANSFORMED] ${msg.data}`,
	}));

	// Backend receives transformed message
	backend.onMessage("Request").mockEvent("Response", (payload) => ({
		id: payload.id,
		result: payload.data, // Echo back the transformed data
		timestamp: Date.now(),
	}));

	// Client sends original message
	api.sendMessage("Request", { id: "req-3", action: "transform", data: "original" });

	// Client receives response with transformed data
	api.waitEvent("Response", { timeout: 2000 }).assert((msg) => {
		return msg.result.includes("[TRANSFORMED]");
	});
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running Proxy Mode tests...\n");

	try {
		const result1 = await scenario.run(passthroughTest);
		console.log(`Passthrough: ${result1.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result2 = await scenario.run(inspectionTest);
		console.log(`Inspection: ${result2.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result3 = await scenario.run(transformTest);
		console.log(`Transform: ${result3.passed ? "✓ PASSED" : "✗ FAILED"}`);

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
