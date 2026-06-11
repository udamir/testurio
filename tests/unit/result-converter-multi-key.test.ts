/**
 * Result converter — multi-key `extractPayload` + `convertStep`.
 *
 * Asserts that when `step.metadata` carries multiple recognized keys (e.g.
 * both `request` and `response` on a Server hook step), `convertStep` emits
 * one JSON attachment per key under any non-undefined `includePayloads`
 * value. After task 044 there are no payload `Parameter` rows — the Allure
 * 3.x JSON viewer renders attachments natively.
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
	startTime: 1000,
	endTime: 1050,
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

describe("convertStep — multi-key metadata (attachments mode)", () => {
	it("emits one JSON attachment per stamped key with key-named files", () => {
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

		// Payload keys never become Parameter rows — only the `component` row remains.
		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).not.toContain("request");
		expect(paramNames).not.toContain("response");
		expect(paramNames).toEqual(["component"]);
	});

	it("emits a single attachment when only request is stamped", () => {
		const step = makeStep({ metadata: { request: { method: "GET" } } });
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "attachments" }, writer);

		expect(result.attachments).toHaveLength(1);
		expect(result.attachments[0]?.name).toBe("request");
	});
});

describe("convertStep — multi-key metadata (both mode)", () => {
	it("emits attachments only (no payload Parameter rows)", () => {
		const step = makeStep({
			metadata: { request: { method: "GET" }, response: { code: 200 } },
		});
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "both" }, writer);

		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).not.toContain("request");
		expect(paramNames).not.toContain("response");
		expect(result.attachments).toHaveLength(2);
		expect(writer.captured).toHaveLength(2);
	});
});

describe("convertStep — multi-key metadata (parameters mode, deprecated alias)", () => {
	it("aliases to attachments — same attachment output as the canonical mode", () => {
		const step = makeStep({
			metadata: { request: { method: "GET" }, response: { code: 200 } },
		});
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "parameters" }, writer);

		expect(result.attachments).toHaveLength(2);
		expect(writer.captured).toHaveLength(2);
		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).not.toContain("request");
	});
});

describe("convertStep — string payload (e.g. DataSource request)", () => {
	it("writes the string verbatim into the JSON attachment", () => {
		const step = makeStep({
			metadata: { request: 'async (c) => c.query("SELECT * FROM users")', response: [{ id: 1 }] },
		});
		const writer = makeRecordingWriter();

		convertStep(step, 0, { ...baseOptions, includePayloads: "attachments" }, writer);

		const captured = Object.fromEntries(writer.captured.map((c) => [c.filename.split("-").slice(1).join("-"), c]));
		expect(captured["step-0-request.json"]?.content.toString("utf-8")).toBe(
			'async (c) => c.query("SELECT * FROM users")'
		);
		expect(captured["step-0-response.json"]?.content.toString("utf-8")).toContain('"id"');
	});
});

describe("convertStep — no recognized keys", () => {
	it("emits no payload attachments when metadata has only unknown keys", () => {
		const step = makeStep({ metadata: { custom: "anything" } });
		const writer = makeRecordingWriter();

		const result = convertStep(step, 0, { ...baseOptions, includePayloads: "attachments" }, writer);

		const paramNames = result.parameters.map((p: Parameter) => p.name);
		expect(paramNames).not.toContain("custom");
		expect(paramNames).not.toContain("request");
		expect(result.attachments).toHaveLength(0);
		expect(writer.captured).toHaveLength(0);
	});
});
