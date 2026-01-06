/**
 * Interaction Recorder Tests
 */

import { InteractionRecorder, resetInteractionIdCounter } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

describe("InteractionRecorder", () => {
	let recorder: InteractionRecorder;

	beforeEach(() => {
		resetInteractionIdCounter();
		recorder = new InteractionRecorder();
	});

	describe("enable/disable", () => {
		it("should be enabled by default", () => {
			expect(recorder.isEnabled()).toBe(true);
		});

		it("should disable recording", () => {
			recorder.disable();
			expect(recorder.isEnabled()).toBe(false);
		});

		it("should enable recording", () => {
			recorder.disable();
			recorder.enable();
			expect(recorder.isEnabled()).toBe(true);
		});

		it("should not record when disabled", () => {
			recorder.disable();
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			expect(id).toBe("");
			expect(recorder.count).toBe(0);
		});
	});

	describe("startInteraction", () => {
		it("should start an interaction", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			expect(id).toBe("interaction-1");
			expect(recorder.count).toBe(1);
		});

		it("should record request payload", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "POST /users",
				requestPayload: { name: "John" },
			});

			const interaction = recorder.getInteraction(id);
			expect(interaction?.requestPayload).toEqual({ name: "John" });
		});

		it("should record trace ID", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
				traceId: "trace-123",
			});

			const interaction = recorder.getInteraction(id);
			expect(interaction?.traceId).toBe("trace-123");
		});

		it("should set status to pending", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			const interaction = recorder.getInteraction(id);
			expect(interaction?.status).toBe("pending");
		});
	});

	describe("completeInteraction", () => {
		it("should complete an interaction", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			recorder.completeInteraction(id, {
				responsePayload: [{ id: 1, name: "John" }],
			});

			const interaction = recorder.getInteraction(id);
			expect(interaction?.status).toBe("completed");
			expect(interaction?.responsePayload).toEqual([{ id: 1, name: "John" }]);
			expect(interaction?.duration).toBeGreaterThanOrEqual(0);
		});

		it("should handle unknown interaction ID", () => {
			// Should not throw
			recorder.completeInteraction("unknown-id", {});
		});
	});

	describe("failInteraction", () => {
		it("should mark interaction as failed", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			recorder.failInteraction(id, "Connection refused");

			const interaction = recorder.getInteraction(id);
			expect(interaction?.status).toBe("failed");
			expect(interaction?.error).toBe("Connection refused");
		});
	});

	describe("timeoutInteraction", () => {
		it("should mark interaction as timed out", () => {
			const id = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			recorder.timeoutInteraction(id);

			const interaction = recorder.getInteraction(id);
			expect(interaction?.status).toBe("timeout");
			expect(interaction?.error).toBe("Request timed out");
		});
	});

	describe("getFilteredInteractions", () => {
		beforeEach(() => {
			recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});
			recorder.startInteraction({
				serviceName: "api",
				direction: "upstream",
				protocol: "http",
				messageType: "POST /orders",
			});
			recorder.startInteraction({
				serviceName: "backend",
				direction: "downstream",
				protocol: "grpc",
				messageType: "GetUser",
			});
		});

		it("should filter by message type", () => {
			const filtered = recorder.getFilteredInteractions({
				messageType: "GET /users",
			});
			expect(filtered).toHaveLength(1);
			expect(filtered[0].messageType).toBe("GET /users");
		});

		it("should filter by direction", () => {
			const filtered = recorder.getFilteredInteractions({
				direction: "downstream",
			});
			expect(filtered).toHaveLength(2);
		});

		it("should filter by status", () => {
			const id = recorder.getInteractions()[0].id;
			recorder.completeInteraction(id, {});

			const filtered = recorder.getFilteredInteractions({
				status: "completed",
			});
			expect(filtered).toHaveLength(1);
		});
	});

	describe("getInteractionsByService", () => {
		it("should get interactions by service name", () => {
			recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});
			recorder.startInteraction({
				serviceName: "backend",
				direction: "downstream",
				protocol: "grpc",
				messageType: "GetUser",
			});

			const apiInteractions = recorder.getInteractionsByService("api");
			expect(apiInteractions).toHaveLength(1);
			expect(apiInteractions[0].serviceName).toBe("api");
		});
	});

	describe("getInteractionsByTraceId", () => {
		it("should get interactions by trace ID", () => {
			recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
				traceId: "trace-123",
			});
			recorder.startInteraction({
				serviceName: "backend",
				direction: "downstream",
				protocol: "grpc",
				messageType: "GetUser",
				traceId: "trace-456",
			});

			const traced = recorder.getInteractionsByTraceId("trace-123");
			expect(traced).toHaveLength(1);
			expect(traced[0].traceId).toBe("trace-123");
		});
	});

	describe("getSummary", () => {
		it("should return summary statistics", () => {
			const id1 = recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});
			const id2 = recorder.startInteraction({
				serviceName: "backend",
				direction: "upstream",
				protocol: "grpc",
				messageType: "GetUser",
			});

			recorder.completeInteraction(id1, {});
			recorder.failInteraction(id2, "Error");

			const summary = recorder.getSummary();

			expect(summary.total).toBe(2);
			expect(summary.byService).toEqual({ api: 1, backend: 1 });
			expect(summary.byStatus).toEqual({ completed: 1, failed: 1 });
			expect(summary.byDirection).toEqual({ downstream: 1, upstream: 1 });
		});
	});

	describe("clear", () => {
		it("should clear all interactions", () => {
			recorder.startInteraction({
				serviceName: "api",
				direction: "downstream",
				protocol: "http",
				messageType: "GET /users",
			});

			recorder.clear();

			expect(recorder.count).toBe(0);
			expect(recorder.getInteractions()).toHaveLength(0);
		});
	});
});
