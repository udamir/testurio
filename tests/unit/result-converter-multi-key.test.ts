/**
 * Result converter — multi-key `extractPayload` + `convertStep` (FR-9 v2).
 *
 * Asserts that when `step.metadata` carries multiple recognized keys (e.g.
 * both `request` and `response` on a Server hook step), `convertStep` emits
 * one parameter row + one JSON attachment per key under the appropriate
 * `includePayloads` mode.
 */

import { convertStep, type FileSystemWriter } from "@testurio/reporter-allure";
import type { Attachment, Parameter } from "allure-js-commons";
import type { TestStepResult } from "testurio";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeStep = (overrides: Partial<TestStepResult> = {}): TestStepResult => ({
	stepNumber: 1,
	type: "request",
	description: "send request",
	componentName: "api",
	messageType: "getUsers",
	passed: true,
	duration: 50,
	...overrides,
});

type CapturedAttachment = { filename: string; content: Buffer; contentType: string };
const makeRecordingWriter = (): FileSystemWriter & { captured: CapturedAttachment[] } => {
	const captured: CapturedAttachment[] = [];
	let counter = 0;
	const writer = {
		captured,
		writeAttachment(name: string, content: Buffer, contentType: string): string {
			counter += 1;
			const filename = `${counter}-${name}`;
			captured.push({ filename, content, contentType });
			return filename;
		},
		writeTestResult() {
			/* unused */
		},
		writeContainer() {
			/* unused */
		},
		writeEnvironment() {
			/* unused */
		},
	};
	return writer as unknown as FileSystemWriter & { captured: CapturedAttachment[] };
};

const baseOptions = { resultsDir: "/tmp/unused", maxPayloadSize: 1000 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("convertStep — multi-key metadata (parameters mode)", () => {
	it("emits one parameter row per stamped key", () => {
		const step = makeStep({
			metadata: { request: { method: "GET" }, response: { code: 200, body: [] } },
		});
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "parameters" }, writer);

		const params: Record<string, string> = Object.fromEntries(
			result.parameters.map((p: Parameter) => [p.name, p.value])
		);
		expect(params.request).toContain('"method"');
		expect(params.response).toContain('"code"');
		expect(result.attachments).toHaveLength(0);
		expect(writer.captured).toHaveLength(0);
	});

	it("emits a single request parameter when only request is stamped", () => {
		const step = makeStep({ metadata: { request: { method: "GET" } } });
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "parameters" }, writer);

		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).toContain("request");
		expect(paramNames).not.toContain("response");
	});
});

describe("convertStep — multi-key metadata (attachments mode)", () => {
	it("emits one attachment per stamped key with key-named files", () => {
		const step = makeStep({
			metadata: { request: { method: "GET" }, response: { code: 200 } },
		});
		const writer = makeRecordingWriter();

		const result = convertStep(step, 3, { ...baseOptions, includePayloads: "attachments" }, writer);

		expect(result.attachments).toHaveLength(2);
		const names = result.attachments.map((a: Attachment) => a.name).sort();
		expect(names).toEqual(["request", "response"]);

		const filenames = writer.captured.map((c) => c.filename);
		expect(filenames.some((n) => n.endsWith("step-3-request.json"))).toBe(true);
		expect(filenames.some((n) => n.endsWith("step-3-response.json"))).toBe(true);

		// No payload parameters under attachments-only mode (component param may still appear)
		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).not.toContain("request");
		expect(paramNames).not.toContain("response");
	});
});

describe("convertStep — multi-key metadata (both mode)", () => {
	it("emits parameters AND attachments for each stamped key", () => {
		const step = makeStep({
			metadata: { request: { method: "GET" }, response: { code: 200 } },
		});
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "both" }, writer);

		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).toContain("request");
		expect(paramNames).toContain("response");
		expect(result.attachments).toHaveLength(2);
		expect(writer.captured).toHaveLength(2);
	});
});

describe("convertStep — string payload (e.g. DataSource request)", () => {
	it("emits string metadata verbatim as a parameter (not JSON-quoted)", () => {
		const step = makeStep({
			metadata: { request: 'async (c) => c.query("SELECT * FROM users")', response: [{ id: 1 }] },
		});
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "both" }, writer);

		const requestParam = result.parameters.find((p: Parameter) => p.name === "request");
		expect(requestParam?.value).toBe('async (c) => c.query("SELECT * FROM users")');
		// Response is an array → JSON.stringify
		const responseParam = result.parameters.find((p: Parameter) => p.name === "response");
		expect(responseParam?.value).toContain('"id"');
	});
});

describe("convertStep — no recognized keys", () => {
	it("emits no payload parameters or attachments when metadata has only unknown keys", () => {
		const step = makeStep({ metadata: { custom: "anything" } });
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "both" }, writer);

		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).not.toContain("custom");
		expect(paramNames).not.toContain("request");
		expect(result.attachments).toHaveLength(0);
		expect(writer.captured).toHaveLength(0);
	});
});
