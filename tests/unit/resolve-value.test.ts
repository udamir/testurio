import { resolveValue } from "testurio";
import { describe, expect, it } from "vitest";

describe("resolveValue", () => {
	describe("static values", () => {
		it("should return a static object as-is", () => {
			const data = { method: "GET", path: "/users" };
			expect(resolveValue(data)).toBe(data);
		});

		it("should return a static string as-is", () => {
			expect(resolveValue("hello")).toBe("hello");
		});

		it("should return a static number as-is", () => {
			expect(resolveValue(42)).toBe(42);
		});

		it("should return null as-is", () => {
			expect(resolveValue(null)).toBe(null);
		});

		it("should return undefined as-is", () => {
			expect(resolveValue(undefined)).toBe(undefined);
		});

		it("should return an array as-is", () => {
			const arr = [1, 2, 3];
			expect(resolveValue(arr)).toBe(arr);
		});
	});

	describe("factory functions", () => {
		it("should call a factory function and return its result", () => {
			const factory = () => ({ method: "GET", path: "/users" });
			const result = resolveValue(factory);
			expect(result).toEqual({ method: "GET", path: "/users" });
		});

		it("should call a factory that reads closure variables", () => {
			let userId = "initial";
			const factory = () => ({ method: "GET", path: `/users/${userId}` });

			// Simulate setting userId at "execution time"
			userId = "abc-123";
			const result = resolveValue(factory);
			expect(result).toEqual({ method: "GET", path: "/users/abc-123" });
		});

		it("should call a factory that returns an array", () => {
			const factory = () => [{ topic: "orders", payload: { id: 1 } }];
			const result = resolveValue(factory);
			expect(result).toEqual([{ topic: "orders", payload: { id: 1 } }]);
		});

		it("should call a factory that returns a primitive", () => {
			const factory = () => 42;
			expect(resolveValue(factory)).toBe(42);
		});
	});
});
