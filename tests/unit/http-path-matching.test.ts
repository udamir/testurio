/**
 * HTTP Path Matching Tests
 *
 * Tests for the HTTP protocol path parameter matching functionality.
 */

import type { Hook, HttpRequest, IBaseProtocol, ITestCaseBuilder, Message, MessageMatcher } from "testurio";
import { BaseComponent, HttpProtocol } from "testurio";
import { describe, expect, it } from "vitest";

// Minimal test component for hook matching
class TestComponent extends BaseComponent<IBaseProtocol> {
	protected async doStart(): Promise<void> {}
	protected async doStop(): Promise<void> {}
	createStepBuilder(_builder: ITestCaseBuilder): unknown {
		return {};
	}
}

describe("HTTP Path Matching", () => {
	describe("createMessageTypeMatcher", () => {
		it("should return matcher function when method and path provided", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("deleteResource", {
				method: "DELETE",
				path: "/resource/{id}",
			});

			expect(typeof matcher).toBe("function");
		});

		it("should match DELETE request with path parameter", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("deleteResource", {
				method: "DELETE",
				path: "/resource/{id}",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const request: HttpRequest = {
				method: "DELETE",
				path: "/resource/789",
			};

			expect(matcherFn("deleteResource", request)).toBe(true);
		});

		it("should not match wrong method", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("deleteResource", {
				method: "DELETE",
				path: "/resource/{id}",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const request: HttpRequest = {
				method: "GET",
				path: "/resource/789",
			};

			expect(matcherFn("deleteResource", request)).toBe(false);
		});

		it("should not match wrong path", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("deleteResource", {
				method: "DELETE",
				path: "/resource/{id}",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const request: HttpRequest = {
				method: "DELETE",
				path: "/other/789",
			};

			expect(matcherFn("deleteResource", request)).toBe(false);
		});

		it("should match path with multiple parameters", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("getPostComment", {
				method: "GET",
				path: "/users/{userId}/posts/{postId}",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const request: HttpRequest = {
				method: "GET",
				path: "/users/123/posts/456",
			};

			expect(matcherFn("getPostComment", request)).toBe(true);
		});

		it("should match path without parameters", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("getHealth", {
				method: "GET",
				path: "/health",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const request: HttpRequest = {
				method: "GET",
				path: "/health",
			};

			expect(matcherFn("getHealth", request)).toBe(true);
		});

		it("should be case insensitive for HTTP methods", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("deleteResource", {
				method: "delete",
				path: "/resource/{id}",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const request: HttpRequest = {
				method: "DELETE",
				path: "/resource/789",
			};

			expect(matcherFn("deleteResource", request)).toBe(true);
		});
	});

	describe("hook matching with HTTP matcher", () => {
		it("should match hook with function matcher", () => {
			const protocol = new HttpProtocol();
			const matcher = protocol.createMessageTypeMatcher("deleteResource", {
				method: "DELETE",
				path: "/resource/{id}",
			});

			expect(typeof matcher).toBe("function");
			const matcherFn = matcher as MessageMatcher<HttpRequest>;

			const component = new TestComponent("test", {} as IBaseProtocol);

			const hook: Hook<HttpRequest> = {
				id: "test-hook",
				componentName: "test",
				phase: "test",
				messageType: matcherFn,
				handlers: [],
				persistent: false,
			};
			component.registerHook(hook);

			const message: Message<HttpRequest> = {
				type: "DELETE /resource/789",
				payload: { method: "DELETE", path: "/resource/789" },
			};

			expect(component.findMatchingHook(message)).not.toBeNull();
		});
	});
});
