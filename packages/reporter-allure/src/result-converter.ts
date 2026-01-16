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
 * Truncate string to max length with ellipsis
 */
function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) {
		return str;
	}
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Extract payload from step metadata
 */
function extractPayload(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!metadata) {
		return undefined;
	}
	// Look for common payload keys
	const payloadKeys = ["request", "response", "message", "payload", "data", "body"];
	for (const key of payloadKeys) {
		if (metadata[key] !== undefined) {
			return { [key]: metadata[key] };
		}
	}
	return undefined;
}

/**
 * Convert TestStepResult to Allure StepResult
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

	// Handle payload inclusion
	const payload = extractPayload(step.metadata);
	if (payload && options.includePayloads) {
		const payloadJson = JSON.stringify(payload, null, 2);
		const maxSize = options.maxPayloadSize ?? 1000;

		if (options.includePayloads === "parameters" || options.includePayloads === "both") {
			// Add as parameter (truncated)
			for (const [key, value] of Object.entries(payload)) {
				const valueStr = typeof value === "string" ? value : JSON.stringify(value, null, 2);
				parameters.push({
					name: key,
					value: truncate(valueStr, maxSize),
				});
			}
		}

		if ((options.includePayloads === "attachments" || options.includePayloads === "both") && writer) {
			// Add as attachment (full content)
			const content = Buffer.from(payloadJson, "utf-8");
			const filename = writer.writeAttachment(`step-${stepIndex}-payload.json`, content, ContentType.JSON);
			attachments.push({
				name: "Payload",
				source: filename,
				type: ContentType.JSON,
			});
		}
	}

	// Calculate timing - step result doesn't have start/end, derive from duration and index
	const stepResult: AllureStepResult = {
		name: `Step ${step.stepNumber}: ${step.type} - ${step.description}`,
		status: convertStatus(step.passed, step.error),
		statusDetails: convertStatusDetails(step.error, step.stackTrace) ?? { message: undefined },
		stage: Stage.FINISHED,
		steps: [],
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
