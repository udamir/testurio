/**
 * Basic TCP Example
 *
 * Demonstrates testing a TCP-based protocol with testurio.
 */

import { TcpProtocol, type TcpServiceDefinition } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";

// =============================================================================
// Type Definitions
// =============================================================================

interface CommandMessage {
	command: string;
	payload: string;
}

interface ResponseMessage {
	status: string;
	data: string;
}

interface ErrorMessage {
	code: number;
	message: string;
}

// Type-safe TCP service definition
interface CommandService extends TcpServiceDefinition {
	clientMessages: {
		Command: CommandMessage;
		Ping: { seq: number };
	};
	serverMessages: {
		Response: ResponseMessage;
		Pong: { seq: number };
		Error: ErrorMessage;
	};
}

// =============================================================================
// Component Setup
// =============================================================================

// Create mock TCP server
const tcpServer = new AsyncServer("tcp-backend", {
	protocol: new TcpProtocol<CommandService>(),
	listenAddress: { host: "localhost", port: 9000 },
});

// Create TCP client
const tcpClient = new AsyncClient("tcp-client", {
	protocol: new TcpProtocol<CommandService>(),
	targetAddress: { host: "localhost", port: 9000 },
});

// Create the test scenario
const scenario = new TestScenario({
	name: "TCP Command Protocol Test",
	components: [tcpServer, tcpClient],
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: Send command and receive response
const commandTest = testCase("Execute command", (test) => {
	const client = test.use(tcpClient);
	const server = test.use(tcpServer);

	// Server responds to commands
	server.onMessage("Command").mockEvent("Response", (payload) => ({
		status: "ok",
		data: `Executed: ${payload.command}`,
	}));

	// Client sends a command
	client.sendMessage("Command", { command: "status", payload: "all" });

	// Verify response
	client.waitEvent("Response", { timeout: 2000 }).assert((msg) => {
		return msg.status === "ok" && msg.data.includes("Executed");
	});
});

// Test: Ping-pong message exchange
const pingPongTest = testCase("Ping-pong exchange", (test) => {
	const client = test.use(tcpClient);
	const server = test.use(tcpServer);

	// Server echoes ping with pong
	server.onMessage("Ping").mockEvent("Pong", (payload) => ({
		seq: payload.seq,
	}));

	// Client sends ping
	client.sendMessage("Ping", { seq: 42 });

	// Verify pong received with same sequence
	client.waitEvent("Pong", { timeout: 2000 }).assert((msg) => {
		return msg.seq === 42;
	});
});

// Test: Handle server error response
const errorHandlingTest = testCase("Handle error response", (test) => {
	const client = test.use(tcpClient);
	const server = test.use(tcpServer);

	// Server returns error for invalid command
	server.onMessage("Command").mockEvent("Error", () => ({
		code: 400,
		message: "Invalid command",
	}));

	// Client sends invalid command
	client.sendMessage("Command", { command: "invalid", payload: "" });

	// Verify error response
	client.waitEvent("Error", { timeout: 2000 }).assert((msg) => {
		return msg.code === 400;
	});
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running TCP tests...\n");

	try {
		const result1 = await scenario.run(commandTest);
		console.log(`Execute command: ${result1.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result2 = await scenario.run(pingPongTest);
		console.log(`Ping-pong: ${result2.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result3 = await scenario.run(errorHandlingTest);
		console.log(`Error handling: ${result3.passed ? "✓ PASSED" : "✗ FAILED"}`);

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
