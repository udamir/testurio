/**
 * Result Converter
 *
 * Pure functions to convert Testurio test results to Allure format.
 */

import { createHash, randomUUID } from "node:crypto";
import {
	type StepResult as AllureStepResult,
	type TestResult as AllureTestResult,
	type Attachment,
	ContentType,
	type Label,
	LabelName,
	type Link,
	LinkType,
	type Parameter,
	Stage,
	Status,
	type StatusDetails,
	type TestResultContainer,
} from "allure-js-commons";
import type { TestCaseMetadata, TestCaseResult, TestResult, TestStepResult } from "testurio";
import type { AllureReporterOptions } from "./types";
import type { AllureWriter } from "./writers/writer";

/**
 * Generate MD5 hash for historyId/testCaseId
 */
function md5(input: string): string {
	return createHash("md5").update(input).digest("hex");
}

/**
 * Convert test pass/fail status to Allure Status enum
 */
export function convertStatus(passed: boolean, error?: string): Status {
	if (passed) {
		return Status.PASSED;
	}
	// Check if it's an assertion error (contains "assert" or "expect" keywords)
	if (error && (error.toLowerCase().includes("assert") || error.toLowerCase().includes("expect"))) {
		return Status.FAILED;
	}
	// Otherwise treat as broken (unexpected error)
	return Status.BROKEN;
}

/**
 * Convert error information to StatusDetails
 */
export function convertStatusDetails(error?: string, stackTrace?: string): StatusDetails | undefined {
	if (!error && !stackTrace) {
		return undefined;
	}
	return {
		message: error,
		trace: stackTrace,
	};
}

/**
 * Convert TestCaseMetadata to Allure labels
 */
export function convertMetadataToLabels(
	metadata: TestCaseMetadata | undefined,
	options: AllureReporterOptions
): Label[] {
	const labels: Label[] = [];

	// Always include framework and language labels
	labels.push({ name: LabelName.FRAMEWORK, value: "testurio" });
	labels.push({ name: LabelName.LANGUAGE, value: "typescript" });

	// Add default labels from options
	if (options.labels) {
		labels.push(...options.labels);
	}

	// Map metadata to labels
	if (metadata) {
		if (metadata.id) {
			labels.push({ name: LabelName.ALLURE_ID, value: metadata.id });
		}

		if (metadata.epic) {
			labels.push({ name: LabelName.EPIC, value: metadata.epic });
		} else if (options.defaultEpic) {
			labels.push({ name: LabelName.EPIC, value: options.defaultEpic });
		}

		if (metadata.feature) {
			labels.push({ name: LabelName.FEATURE, value: metadata.feature });
		} else if (options.defaultFeature) {
			labels.push({ name: LabelName.FEATURE, value: options.defaultFeature });
		}

		if (metadata.story) {
			labels.push({ name: LabelName.STORY, value: metadata.story });
		}

		if (metadata.severity) {
			labels.push({ name: LabelName.SEVERITY, value: metadata.severity });
		}

		// Add tags as individual label entries
		if (metadata.tags) {
			for (const tag of metadata.tags) {
				labels.push({ name: LabelName.TAG, value: tag });
			}
		}

		// Add custom labels
		if (metadata.labels) {
			for (const [name, value] of Object.entries(metadata.labels)) {
				labels.push({ name, value });
			}
		}
	} else {
		// Apply defaults when no metadata
		if (options.defaultEpic) {
			labels.push({ name: LabelName.EPIC, value: options.defaultEpic });
		}
		if (options.defaultFeature) {
			labels.push({ name: LabelName.FEATURE, value: options.defaultFeature });
		}
	}

	return labels;
}

/**
 * Convert TestCaseMetadata to Allure links
 */
export function convertMetadataToLinks(metadata: TestCaseMetadata | undefined, options: AllureReporterOptions): Link[] {
	const links: Link[] = [];

	if (!metadata) {
		return links;
	}

	// Create TMS link from id
	if (metadata.id && options.tmsUrlPattern) {
		const url = options.tmsUrlPattern.replace("{id}", metadata.id);
		links.push({
			name: metadata.id,
			url,
			type: LinkType.TMS,
		});
	}

	// Create issue links
	if (metadata.issues && options.issueUrlPattern) {
		for (const issue of metadata.issues) {
			const url = options.issueUrlPattern.replace("{id}", issue);
			links.push({
				name: issue,
				url,
				type: LinkType.ISSUE,
			});
		}
	}

	return links;
}

/**
 * Extract payload(s) from step metadata.
 *
 * Returns an object containing **every** recognized payload key present on
 * `metadata` — components may stamp both `request` and `response` on the same
 * step (e.g. a Server hook step receives a request and produces a mock
 * response), and both should be surfaced. Recognized keys are looked up in a
 * stable order so the produced parameter / attachment list is deterministic.
 *
 * Returns `undefined` when none of the recognized keys are present.
 */
function extractPayload(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!metadata) {
		return undefined;
	}
	// Look for common payload keys
	const payloadKeys = ["request", "response", "message", "payload", "data", "body"];
	const result: Record<string, unknown> = {};
	for (const key of payloadKeys) {
		if (metadata[key] !== undefined) {
			result[key] = metadata[key];
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Convert TestStepResult to Allure StepResult.
 *
 * Three reporter-side behaviors are wired here:
 *
 * - **start / stop** — propagated from `step.startTime`/`step.endTime` so the
 *   Allure UI renders a per-step duration badge and a timeline.
 * - **JSON payloads as attachments** — every stamped payload key (request,
 *   response, message, …) is written as an `application/json` attachment. The
 *   Allure 3.x JSON viewer prettifies, syntax-highlights, and folds it on
 *   click. There is **no** per-key `Parameter` row for payloads (the Allure
 *   parameter table collapses whitespace and offers no syntax highlight, so
 *   the previous `parameters`/`both` modes produced an unreadable single-line
 *   string). Any non-undefined `includePayloads` value (`attachments`,
 *   `both`, or the deprecated `parameters` alias) writes the same JSON
 *   attachment.
 * - **Nested sub-steps per assertion** — each entry in `step.assertions` is
 *   emitted as a nested `AllureStepResult` with its own pass/fail status, so
 *   a chain of `.assert()` calls renders as a check-mark tree under the
 *   parent step.
 */
export function convertStep(
	step: TestStepResult,
	stepIndex: number,
	options: AllureReporterOptions,
	writer?: AllureWriter
): AllureStepResult {
	const parameters: Parameter[] = [];
	const attachments: Attachment[] = [];

	// Add component as parameter if present
	if (step.componentName) {
		parameters.push({
			name: "component",
			value: step.componentName,
		});
	}

	// Always-attach JSON payload rendering (Allure 3.x idiom).
	// `extractPayload` may return multiple keys (e.g. { request, response } on
	// a Server hook step) — emit one JSON attachment per key.
	const payload = extractPayload(step.metadata);
	if (payload && options.includePayloads && writer) {
		for (const [key, value] of Object.entries(payload)) {
			const valueStr = typeof value === "string" ? value : JSON.stringify(value, null, 2);
			const content = Buffer.from(valueStr, "utf-8");
			const filename = writer.writeAttachment(`step-${stepIndex}-${key}.json`, content, ContentType.JSON);
			attachments.push({
				name: key,
				source: filename,
				type: ContentType.JSON,
			});
		}
	}

	// Build one nested sub-step per recorded assertion.
	const nestedAssertionSteps: AllureStepResult[] = (step.assertions ?? []).map((a, i) => ({
		name: a.description ?? `Assertion ${i + 1}`,
		status: a.passed ? Status.PASSED : Status.FAILED,
		statusDetails: a.passed ? { message: undefined } : { message: a.error, trace: undefined },
		stage: Stage.FINISHED,
		steps: [],
		attachments: [],
		parameters: [],
	}));

	const stepResult: AllureStepResult = {
		name: `Step ${step.stepNumber}: ${step.type} - ${step.description}`,
		status: convertStatus(step.passed, step.error),
		statusDetails: convertStatusDetails(step.error, step.stackTrace) ?? { message: undefined },
		stage: Stage.FINISHED,
		start: step.startTime,
		stop: step.endTime,
		steps: nestedAssertionSteps,
		attachments,
		parameters,
	};

	return stepResult;
}

/**
 * Convert TestCaseResult to Allure TestResult
 */
export function convertTestCase(
	testCase: TestCaseResult,
	options: AllureReporterOptions,
	writer?: AllureWriter
): AllureTestResult {
	const uuid = randomUUID();
	const historyId = md5(testCase.name);
	const testCaseId = md5(testCase.name);

	// Convert all steps
	const steps: AllureStepResult[] = testCase.steps.map((step, index) => convertStep(step, index, options, writer));

	// Get metadata
	const metadata = testCase.testCaseMetadata;

	// Build result
	const result: AllureTestResult = {
		uuid,
		historyId,
		testCaseId,
		name: testCase.name,
		fullName: testCase.name,
		description: metadata?.description,
		status: convertStatus(testCase.passed, testCase.error),
		statusDetails: convertStatusDetails(testCase.error, testCase.stackTrace) ?? { message: undefined },
		stage: Stage.FINISHED,
		start: testCase.startTime,
		stop: testCase.endTime,
		steps,
		labels: convertMetadataToLabels(metadata, options),
		links: convertMetadataToLinks(metadata, options),
		attachments: [],
		parameters: [],
	};

	return result;
}

/**
 * Convert TestResult to Allure TestResultContainer
 */
export function convertToContainer(testResult: TestResult, testCaseUuids: string[]): TestResultContainer {
	const uuid = randomUUID();

	return {
		uuid,
		name: testResult.name,
		children: testCaseUuids,
		befores: [],
		afters: [],
	};
}
