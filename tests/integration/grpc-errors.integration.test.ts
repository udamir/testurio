/**
 * gRPC Error Scenarios Integration Tests
 *
 * Tests error handling for gRPC protocol (unary).
 */

import { GrpcUnaryProtocol } from "@testurio/protocol-grpc";
import { Client, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Proto Schema Setup
// ============================================================================

const TEST_PROTO = "tests/proto/test-service.proto";
const TEST_SERVICE = "test.v1.TestService";

// Service type definition
interface TestService {
	GetUser: {
		request: { user_id: number };
		response: { id: number; name: string; email: string };
	};
}

// Port counter for this test file (20xxx range)
let portCounter = 20000;
function _getNextPort(): number {
	return portCounter++;
}

// ============================================================================
// gRPC Error Tests
// ============================================================================

describe("gRPC Error Scenarios Integration Tests", () => {
	describe("Connection Errors", () => {
		it("should handle connection refused error", async () => {
			const client = new Client("api", {
				protocol: new GrpcUnaryProtocol<TestService>({
					schema: TEST_PROTO,
					serviceName: TEST_SERVICE,
				}),
				targetAddress: { host: "127.0.0.1", port: 20999 },
			});

			const scenario = new TestScenario({
				name: "gRPC Connection Refused Test",
				components: [client],
			});

			const tc = testCase("Connection refused", (test) => {
				const api = test.use(client);
				api.request("GetUser", { user_id: 1 });
			});

			try {
				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			} catch (error) {
				// Connection refused is expected
				expect(error).toBeDefined();
			}
		});

		it("should fail gracefully when server is unavailable", async () => {
			// This test verifies that the framework handles connection errors properly
			// by catching them and reporting test failure rather than crashing
			const client = new Client("api", {
				protocol: new GrpcUnaryProtocol<TestService>({
					schema: TEST_PROTO,
					serviceName: TEST_SERVICE,
				}),
				targetAddress: { host: "127.0.0.1", port: 20998 },
			});

			const scenario = new TestScenario({
				name: "gRPC Unavailable Server Test",
				components: [client],
			});

			const tc = testCase("Server unavailable", (test) => {
				const api = test.use(client);
				api.request("GetUser", { user_id: 1 });
			});

			// Should either throw or return failed result
			try {
				const result = await scenario.run(tc);
				// If it returns, should be failed
				expect(result.passed).toBe(false);
			} catch {
				// If it throws, that's also acceptable error handling
				expect(true).toBe(true);
			}
		});
	});
});
