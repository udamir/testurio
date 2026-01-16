/**
 * Allure Reporter for Testurio
 *
 * Provides Allure TestOps integration for test reporting.
 * Converts Testurio test results to Allure-compatible format.
 *
 * @example
 * ```typescript
 * import { TestScenario } from 'testurio';
 * import { AllureReporter } from '@testurio/reporter-allure';
 *
 * const scenario = new TestScenario({
 *   name: 'API Test',
 *   components: [...],
 *   reporters: [
 *     new AllureReporter({
 *       resultsDir: 'allure-results',
 *       environmentInfo: { 'Node.js': process.version },
 *       includePayloads: 'both',
 *     }),
 *   ],
 * });
 *
 * // After running tests:
 * // $ allure generate allure-results -o allure-report
 * // $ allure open allure-report
 * ```
 */

export type { Attachment, Label, Link, Parameter } from "allure-js-commons";
// Re-export useful allure-js-commons types
export {
	ContentType,
	LabelName,
	LinkType,
	Severity,
	Stage,
	Status,
} from "allure-js-commons";
// Main reporter class
export { AllureReporter } from "./allure-reporter";
// Converter functions (for advanced usage)
export {
	convertMetadataToLabels,
	convertMetadataToLinks,
	convertStatus,
	convertStatusDetails,
	convertStep,
	convertTestCase,
	convertToContainer,
} from "./result-converter";
// Types
export type { AllureReporterOptions } from "./types";
export { FileSystemWriter } from "./writers/file-writer";
// Writer interface (for custom implementations)
export type { AllureWriter } from "./writers/writer";
