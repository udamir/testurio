/**
 * HTTP Path Matching Tests
 *
 * Tests for the HTTP protocol path parameter matching functionality.
 */

import type { Handler, HttpRequest, ITestCaseContext, MessageMatcher, Step } from "testurio";
import { BaseComponent, HttpProtocol } from "testurio";
import { describe, expect, it } from "vitest";

// Minimal test component for hook matching
class TestComponent extends BaseComponent {
	private _matcherFn: ((msg: { type: string; payload: HttpRequest }) => boolean) | null = null;

	protected async doStart(): Promise<void> {}
	protected async doStop(): Promise<void> {}

	createStepBuilder(_context: ITestCaseContext): unknown {
		return {};
	}

	async executeStep(_step: Step): Promise<void> {
		// No-op
	}

	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		const params = step.params as {
			matcherFn?: (msg: { type: string; payload: HttpRequest }) => boolean;
		};

		if (params.matcherFn) {
			return (message: unknown) => {
				const msg = message as { type: string; payload: HttpRequest };
				return params.matcherFn!(msg);
			};
		}
		return () => false;
	}

	protected async executeHandler<TContext = unknown>(
		_handler: Handler,
		payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		return payload;
	}

	// Expose protected method for testing
	public testFindMatchingHook<T>(message: T) {
		return this.findMatchingHook(message);
	}

	setMatcher(fn: (msg: { type: string; payload: HttpRequest }) => boolean): void {
		this._matcherFn = fn;
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

			const component = new TestComponent("test");

			// Create a step with the matcher function in params
			const step: Step = {
				id: "test-step",
				type: "onRequest",
				component,
				description: "Test step",
				params: {
					matcherFn: (msg: { type: string; payload: HttpRequest }) => matcherFn(msg.type, msg.payload),
				},
				handlers: [],
				mode: "hook",
				testCaseId: "tc_1",
			};

			component.registerHook(step);

			const message = {
				type: "DELETE /resource/789",
				payload: { method: "DELETE", path: "/resource/789" } as HttpRequest,
			};

			expect(component.testFindMatchingHook(message)).not.toBeNull();
		});
	});
});
