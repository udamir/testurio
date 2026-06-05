/**
 * source-frame unit tests
 *
 * Tests for the zero-dep V8 stack frame parser used by the expect API.
 */

import { describe, expect, it } from "vitest";

import {
	captureSourceFrame,
	formatSourceFrame,
	type SourceFrame,
} from "../../packages/core/src/components/base/expect/source-frame";

describe("captureSourceFrame", () => {
	it("parses paren-form frames", () => {
		const stack = [
			"Error",
			"    at Object.foo (/home/user/proj/tests/x.test.ts:42:21)",
			"    at /home/user/proj/packages/core/src/components/base/expect/expect.ts:10:5",
		].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame).toEqual({
			function: "Object.foo",
			file: "/home/user/proj/tests/x.test.ts",
			line: 42,
			column: 21,
		});
	});

	it("parses plain-form frames", () => {
		const stack = ["Error", "    at /home/user/proj/tests/x.test.ts:42:21"].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame).toEqual({
			file: "/home/user/proj/tests/x.test.ts",
			line: 42,
			column: 21,
		});
	});

	it("skips testurio internal frames (packages/core/src)", () => {
		const stack = [
			"Error",
			"    at toBe (/abs/packages/core/src/components/base/expect/matchers/equality.ts:10:5)",
			"    at predicate (/home/user/proj/tests/foo.test.ts:55:10)",
		].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame?.file).toBe("/home/user/proj/tests/foo.test.ts");
		expect(frame?.line).toBe(55);
	});

	it("skips node:internal frames", () => {
		const stack = [
			"Error",
			"    at processTicksAndRejections (node:internal/process/task_queues:96:5)",
			"    at /home/user/proj/tests/foo.test.ts:55:10",
		].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame?.file).toBe("/home/user/proj/tests/foo.test.ts");
	});

	it("skips <anonymous> frames", () => {
		const stack = ["Error", "    at <anonymous>:1:1", "    at /home/user/proj/tests/foo.test.ts:55:10"].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame?.file).toBe("/home/user/proj/tests/foo.test.ts");
	});

	it("returns undefined when no parseable frame exists", () => {
		const stack = "Error\n    not a frame line\n    another non-frame line";
		expect(captureSourceFrame(undefined, stack)).toBeUndefined();
	});

	it("skips node_modules/testurio frames", () => {
		const stack = [
			"Error",
			"    at runner (/proj/node_modules/testurio/dist/runner.js:10:5)",
			"    at /home/user/proj/tests/foo.test.ts:55:10",
		].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame?.file).toBe("/home/user/proj/tests/foo.test.ts");
	});

	it("skips @testurio scoped frames", () => {
		const stack = [
			"Error",
			"    at reporter (/proj/node_modules/@testurio/reporter-allure/dist/x.js:10:5)",
			"    at /home/user/proj/tests/foo.test.ts:55:10",
		].join("\n");
		const frame = captureSourceFrame(undefined, stack);
		expect(frame?.file).toBe("/home/user/proj/tests/foo.test.ts");
	});
});

describe("formatSourceFrame", () => {
	it("formats relative paths when file is under cwd", () => {
		const cwd = process.cwd();
		const f: SourceFrame = { file: `${cwd}/tests/foo.test.ts`, line: 42, column: 21 };
		expect(formatSourceFrame(f)).toBe("tests/foo.test.ts:42:21");
	});

	it("preserves absolute paths when file is outside cwd", () => {
		const f: SourceFrame = { file: "/elsewhere/x.ts", line: 1, column: 2 };
		expect(formatSourceFrame(f)).toBe("/elsewhere/x.ts:1:2");
	});
});
