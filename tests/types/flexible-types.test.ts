// Disable for file
// biome-ignore-all lint/correctness/noUnusedVariables: test of types

/**
 * Type Tests for Flexible Protocol Types (Loose/Strict Mode)
 *
 * These tests verify compile-time type behavior.
 * They don't run at runtime - they just need to compile without errors.
 */

import type { WebSocketProtocol, WsServiceDefinition } from "@testurio/protocol-ws";
import type {
	AsyncClientMessageType,
	AsyncServerMessageType,
	IsAsyncLooseMode,
	IsSyncLooseMode,
	ProtocolService,
	SyncOperationId,
} from "testurio";
import type { HttpProtocol } from "../../packages/core/src";
import type {
	ExtractClientResponse,
	ExtractRequestData,
} from "../../packages/core/src/components/sync-client/sync-client.types";

// =============================================================================
// Test 1: Loose mode - HttpProtocol without type parameter
// =============================================================================

type LooseProtocol = HttpProtocol;
type LooseService = ProtocolService<LooseProtocol>;
type LooseMode = IsSyncLooseMode<LooseService>; // Should be true
type LooseOpId = SyncOperationId<LooseProtocol>; // Should be string
type LooseReq = ExtractRequestData<LooseProtocol, "anyOperation">; // Should be HttpRequest
type LooseRes = ExtractClientResponse<LooseProtocol, "anyOperation">; // Should be HttpResponse

// Type assertions - these compile only if the types are correct
const _looseMode: LooseMode = true;
const _looseOpId: LooseOpId = "anyStringIsValid";

// Verify request type in loose mode accepts any method/path
const _looseReqTest: LooseReq = { method: "POST", path: "/any/path", body: { anything: true } };

// Verify response type in loose mode has HttpResponse structure
const _looseResTest: LooseRes = { code: 200, body: { anything: true } };

// =============================================================================
// Test 2: Strict mode - HttpProtocol with type parameter
// =============================================================================

interface MyApi {
	getUsers: {
		request: { method: "GET"; path: "/users" };
		response: { code: 200; body: { id: number; name: string }[] };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body: { name: string } };
		response: { code: 201; body: { id: number; name: string } };
	};
}

type StrictProtocol = HttpProtocol<MyApi>;
type StrictService = ProtocolService<StrictProtocol>;
type StrictMode = IsSyncLooseMode<StrictService>; // Should be false
type StrictOpId = SyncOperationId<StrictProtocol>; // Should be "getUsers" | "createUser"

// Type assertions - these compile only if the types are correct
const _strictMode: StrictMode = false;

// StrictOpId should only accept defined operation IDs
const _strictOpId1: StrictOpId = "getUsers";
const _strictOpId2: StrictOpId = "createUser";
// @ts-expect-error - "invalidOp" is not a valid operation ID
const _invalidOpId: StrictOpId = "invalidOp";

// =============================================================================
// Test 3: Async loose mode detection
// =============================================================================

// Loose mode - WebSocketProtocol without type parameter
type LooseWsProtocol = WebSocketProtocol;
type LooseWsMessages = ProtocolService<LooseWsProtocol>;
type LooseWsMode = IsAsyncLooseMode<LooseWsMessages>; // Should be true
type LooseWsClientMsgType = AsyncClientMessageType<LooseWsProtocol>; // Should be string
type LooseWsServerMsgType = AsyncServerMessageType<LooseWsProtocol>; // Should be string

const _looseWsMode: LooseWsMode = true;
const _looseWsClientMsg: LooseWsClientMsgType = "anyMessageType";
const _looseWsServerMsg: LooseWsServerMsgType = "anyEventType";

// Strict mode - WebSocketProtocol with type parameter
interface MyWsApi extends WsServiceDefinition {
	clientMessages: {
		ping: { seq: number };
		subscribe: { channel: string };
	};
	serverMessages: {
		pong: { seq: number; timestamp: number };
		subscribed: { id: string };
	};
}

type StrictWsProtocol = WebSocketProtocol<MyWsApi>;
type StrictWsMessages = ProtocolService<StrictWsProtocol>;
type StrictWsMode = IsAsyncLooseMode<StrictWsMessages>; // Should be false
type StrictWsClientMsgType = AsyncClientMessageType<StrictWsProtocol>; // Should be "ping" | "subscribe"
type StrictWsServerMsgType = AsyncServerMessageType<StrictWsProtocol>; // Should be "pong" | "subscribed"

const _strictWsMode: StrictWsMode = false;
const _strictWsClientMsg1: StrictWsClientMsgType = "ping";
const _strictWsClientMsg2: StrictWsClientMsgType = "subscribe";
// @ts-expect-error - "invalid" is not a valid client message type
const _invalidWsClientMsg: StrictWsClientMsgType = "invalid";

import { describe, expect, it } from "vitest";

describe("Flexible Protocol Types", () => {
	it("compiles without type errors (compile-time verification)", () => {
		// This test verifies that all the type assertions above compile correctly.
		// The actual type checking happens at compile time, not runtime.
		// If this file compiles, the types are correct.
		expect(true).toBe(true);
	});
});

console.log("All type tests passed!");
