/**
 * Basic WebSocket Example
 *
 * Demonstrates testing a WebSocket-based API with testurio.
 */

import { WebSocketProtocol } from "@testurio/protocol-ws";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";

// =============================================================================
// Type Definitions
// =============================================================================

interface ChatMessage {
	userId: string;
	text: string;
	timestamp: number;
}

interface JoinRoom {
	roomId: string;
	userId: string;
}

interface JoinedNotification {
	roomId: string;
	userId: string;
	success: boolean;
}

// Type-safe WebSocket service definition
interface ChatService {
	clientMessages: {
		join: JoinRoom;
		message: ChatMessage;
		leave: { userId: string };
	};
	serverMessages: {
		joined: JoinedNotification;
		message: ChatMessage;
		userLeft: { userId: string };
		error: { code: number; message: string };
	};
}

// =============================================================================
// Component Setup
// =============================================================================

// Create mock WebSocket server
const chatServer = new AsyncServer("chat-backend", {
	protocol: new WebSocketProtocol<ChatService>(),
	listenAddress: { host: "localhost", port: 8080 },
});

// Create WebSocket client
const chatClient = new AsyncClient("chat-client", {
	protocol: new WebSocketProtocol<ChatService>(),
	targetAddress: { host: "localhost", port: 8080 },
});

// Create the test scenario
const scenario = new TestScenario({
	name: "Chat WebSocket API Test",
	components: [chatServer, chatClient],
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: Join a chat room
const joinRoomTest = testCase("Join chat room", (test) => {
	const client = test.use(chatClient);
	const server = test.use(chatServer);

	// Server responds to join requests
	server.onMessage("join").mockEvent("joined", (payload) => ({
		roomId: payload.roomId,
		userId: payload.userId,
		success: true,
	}));

	// Client joins a room
	client.sendMessage("join", { roomId: "general", userId: "alice" });

	// Verify join confirmation
	client.waitEvent("joined", { timeout: 2000 }).assert((msg) => {
		return msg.roomId === "general" && msg.success === true;
	});
});

// Test: Send and receive messages
const messageExchangeTest = testCase("Send and receive messages", (test) => {
	const client = test.use(chatClient);
	const server = test.use(chatServer);

	// Server echoes messages back
	server.onMessage("message").mockEvent("message", (payload) => ({
		userId: payload.userId,
		text: `Echo: ${payload.text}`,
		timestamp: Date.now(),
	}));

	// Client sends a message
	client.sendMessage("message", {
		userId: "alice",
		text: "Hello, world!",
		timestamp: Date.now(),
	});

	// Verify echo response
	client.waitEvent("message", { timeout: 2000 }).assert((msg) => {
		return msg.text.includes("Echo:") && msg.text.includes("Hello");
	});
});

// Test: Handle errors
const errorHandlingTest = testCase("Handle server errors", (test) => {
	const client = test.use(chatClient);
	const server = test.use(chatServer);

	// Server returns error for invalid room
	server.onMessage("join").mockEvent("error", () => ({
		code: 404,
		message: "Room not found",
	}));

	// Client tries to join invalid room
	client.sendMessage("join", { roomId: "invalid-room", userId: "bob" });

	// Verify error response
	client.waitEvent("error", { timeout: 2000 }).assert((msg) => {
		return msg.code === 404;
	});
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running WebSocket tests...\n");

	try {
		const result1 = await scenario.run(joinRoomTest);
		console.log(`Join room: ${result1.passed ? "✓ PASSED" : "✗ FAILED"}`);

		const result2 = await scenario.run(messageExchangeTest);
		console.log(`Message exchange: ${result2.passed ? "✓ PASSED" : "✗ FAILED"}`);

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
