/**
 * Connection Wrapper Tests
 * 
 * Tests for ClientConnectionImpl and ServerConnectionImpl
 * Updated for v2 single-handler design
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientConnectionImpl, type ClientConnectionDelegate } from "../../packages/core/src/protocols/base/client-connection";
import { ServerConnectionImpl, type ServerConnectionDelegate } from "../../packages/core/src/protocols/base/server-connection";
import { generateConnectionId } from "../../packages/core/src/protocols/base/connection.utils";
import type { Message } from "../../packages/core/src/protocols/base/base.types";

// =============================================================================
// Test Helpers
// =============================================================================

function createMockClientDelegate(): ClientConnectionDelegate & { 
	sendMessageMock: ReturnType<typeof vi.fn>;
	closeMock: ReturnType<typeof vi.fn>;
	connected: boolean;
} {
	const sendMessageMock = vi.fn().mockResolvedValue(undefined);
	const closeMock = vi.fn().mockResolvedValue(undefined);
	return {
		sendMessageMock,
		closeMock,
		connected: true,
		sendMessage: sendMessageMock,
		close: closeMock,
		isConnected: function() { return this.connected; },
	};
}

function createMockServerDelegate(): ServerConnectionDelegate & {
	sendEventMock: ReturnType<typeof vi.fn>;
	closeMock: ReturnType<typeof vi.fn>;
	connected: boolean;
} {
	const sendEventMock = vi.fn().mockResolvedValue(undefined);
	const closeMock = vi.fn().mockResolvedValue(undefined);
	return {
		sendEventMock,
		closeMock,
		connected: true,
		sendEvent: sendEventMock,
		close: closeMock,
		isConnected: function() { return this.connected; },
	};
}

// =============================================================================
// Utility Tests
// =============================================================================

describe("Connection Utils", () => {
	describe("generateConnectionId", () => {
		it("should generate unique IDs", () => {
			const id1 = generateConnectionId("test");
			const id2 = generateConnectionId("test");

			expect(id1).not.toBe(id2);
		});

		it("should use provided prefix", () => {
			const id = generateConnectionId("custom");

			expect(id.startsWith("custom-")).toBe(true);
		});

		it("should use default prefix", () => {
			const id = generateConnectionId();

			expect(id).toMatch(/^conn-/);
		});
	});
});

// =============================================================================
// ClientConnectionImpl Tests
// =============================================================================

describe("ClientConnectionImpl", () => {
	let delegate: ReturnType<typeof createMockClientDelegate>;
	let connection: ClientConnectionImpl;

	beforeEach(() => {
		delegate = createMockClientDelegate();
		connection = new ClientConnectionImpl(delegate);
	});

	describe("constructor", () => {
		it("should generate unique id", () => {
			const conn1 = new ClientConnectionImpl(delegate);
			const conn2 = new ClientConnectionImpl(delegate);

			expect(conn1.id).not.toBe(conn2.id);
		});

		it("should use provided id", () => {
			const conn = new ClientConnectionImpl(delegate, "custom-id");

			expect(conn.id).toBe("custom-id");
		});
	});

	describe("isConnected", () => {
		it("should return true when connected", () => {
			expect(connection.isConnected).toBe(true);
		});

		it("should return false when delegate reports disconnected", () => {
			delegate.connected = false;

			expect(connection.isConnected).toBe(false);
		});

		it("should return false after close", async () => {
			await connection.close();

			expect(connection.isConnected).toBe(false);
		});
	});

	describe("sendMessage", () => {
		it("should delegate to sendMessage", async () => {
			await connection.sendMessage("Login", { user: "test" }, "trace-1");

			expect(delegate.sendMessageMock).toHaveBeenCalledWith("Login", { user: "test" }, "trace-1");
		});

		it("should throw when connection is closed", async () => {
			await connection.close();

			await expect(connection.sendMessage("Login", {})).rejects.toThrow("Connection is closed");
		});
	});

	describe("onEvent", () => {
		it("should register single event handler", () => {
			const handler = vi.fn();
			connection.onEvent(handler);

			connection._dispatchEvent({ type: "LoginResponse", payload: { token: "abc" } });

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler).toHaveBeenCalledWith({ type: "LoginResponse", payload: { token: "abc" } });
					resolve();
				}, 10);
			});
		});

		it("should receive full Message object with type, payload, and traceId", () => {
			const handler = vi.fn();
			connection.onEvent(handler);

			const message: Message = { type: "Test", payload: { data: 1 }, traceId: "trace-123" };
			connection._dispatchEvent(message);

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler).toHaveBeenCalledWith(message);
					resolve();
				}, 10);
			});
		});

		it("should replace previous handler when called multiple times", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			connection.onEvent(handler1);
			connection.onEvent(handler2);

			connection._dispatchEvent({ type: "Test", payload: {} });

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler1).not.toHaveBeenCalled();
					expect(handler2).toHaveBeenCalled();
					resolve();
				}, 10);
			});
		});
	});

	describe("_dispatchEvent", () => {
		it("should dispatch event to handler", () => {
			const handler = vi.fn();
			connection.onEvent(handler);

			connection._dispatchEvent({ type: "Test", payload: { data: 1 } });

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler).toHaveBeenCalledWith({ type: "Test", payload: { data: 1 } });
					resolve();
				}, 10);
			});
		});

		it("should not throw when no handler registered", () => {
			// Should not throw
			connection._dispatchEvent({ type: "Test", payload: {} });
		});
	});

	describe("close", () => {
		it("should delegate to close", async () => {
			await connection.close();

			expect(delegate.closeMock).toHaveBeenCalled();
		});

		it("should not call close twice", async () => {
			await connection.close();
			await connection.close();

			expect(delegate.closeMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("onClose", () => {
		it("should call close handlers on _notifyClose", () => {
			const handler = vi.fn();
			connection.onClose(handler);

			connection._notifyClose();

			expect(handler).toHaveBeenCalled();
		});

		it("should call multiple close handlers", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			connection.onClose(handler1);
			connection.onClose(handler2);

			connection._notifyClose();

			expect(handler1).toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});
	});

	describe("onError", () => {
		it("should call error handlers on _notifyError", () => {
			const handler = vi.fn();
			connection.onError(handler);

			const error = new Error("Test error");
			connection._notifyError(error);

			expect(handler).toHaveBeenCalledWith(error);
		});
	});
});

// =============================================================================
// ServerConnectionImpl Tests
// =============================================================================

describe("ServerConnectionImpl", () => {
	let delegate: ReturnType<typeof createMockServerDelegate>;
	let connection: ServerConnectionImpl;

	beforeEach(() => {
		delegate = createMockServerDelegate();
		connection = new ServerConnectionImpl(delegate);
	});

	describe("constructor", () => {
		it("should generate unique id", () => {
			const conn1 = new ServerConnectionImpl(delegate);
			const conn2 = new ServerConnectionImpl(delegate);

			expect(conn1.id).not.toBe(conn2.id);
		});

		it("should use provided id", () => {
			const conn = new ServerConnectionImpl(delegate, "custom-id");

			expect(conn.id).toBe("custom-id");
		});
	});

	describe("isConnected", () => {
		it("should return true when connected", () => {
			expect(connection.isConnected).toBe(true);
		});

		it("should return false when delegate reports disconnected", () => {
			delegate.connected = false;

			expect(connection.isConnected).toBe(false);
		});

		it("should return false after close", async () => {
			await connection.close();

			expect(connection.isConnected).toBe(false);
		});
	});

	describe("onMessage", () => {
		it("should register single message handler", () => {
			const handler = vi.fn();
			connection.onMessage(handler);

			connection._dispatchMessage({ type: "Login", payload: { user: "test" } });

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler).toHaveBeenCalledWith({ type: "Login", payload: { user: "test" } });
					resolve();
				}, 10);
			});
		});

		it("should receive full Message object with type, payload, and traceId", () => {
			const handler = vi.fn();
			connection.onMessage(handler);

			const message: Message = { type: "Test", payload: { data: 1 }, traceId: "trace-123" };
			connection._dispatchMessage(message);

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler).toHaveBeenCalledWith(message);
					resolve();
				}, 10);
			});
		});

		it("should replace previous handler when called multiple times", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			connection.onMessage(handler1);
			connection.onMessage(handler2);

			connection._dispatchMessage({ type: "Test", payload: {} });

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler1).not.toHaveBeenCalled();
					expect(handler2).toHaveBeenCalled();
					resolve();
				}, 10);
			});
		});
	});

	describe("sendEvent", () => {
		it("should delegate to sendEvent", async () => {
			await connection.sendEvent("LoginResponse", { token: "abc" }, "trace-1");

			expect(delegate.sendEventMock).toHaveBeenCalledWith("LoginResponse", { token: "abc" }, "trace-1");
		});

		it("should throw when connection is closed", async () => {
			await connection.close();

			await expect(connection.sendEvent("Test", {})).rejects.toThrow("Connection is closed");
		});
	});

	describe("_dispatchMessage", () => {
		it("should dispatch message to handler", () => {
			const handler = vi.fn();
			connection.onMessage(handler);

			connection._dispatchMessage({ type: "Test", payload: { data: 1 } });

			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(handler).toHaveBeenCalledWith({ type: "Test", payload: { data: 1 } });
					resolve();
				}, 10);
			});
		});

		it("should not throw when no handler registered", () => {
			// Should not throw
			connection._dispatchMessage({ type: "Test", payload: {} });
		});
	});

	describe("close", () => {
		it("should delegate to close", async () => {
			await connection.close();

			expect(delegate.closeMock).toHaveBeenCalled();
		});

		it("should not call close twice", async () => {
			await connection.close();
			await connection.close();

			expect(delegate.closeMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("onClose", () => {
		it("should call close handlers on _notifyClose", () => {
			const handler = vi.fn();
			connection.onClose(handler);

			connection._notifyClose();

			expect(handler).toHaveBeenCalled();
		});
	});

	describe("onError", () => {
		it("should call error handlers on _notifyError", () => {
			const handler = vi.fn();
			connection.onError(handler);

			const error = new Error("Test error");
			connection._notifyError(error);

			expect(handler).toHaveBeenCalledWith(error);
		});
	});
});
