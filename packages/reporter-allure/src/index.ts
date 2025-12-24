/**
 * Allure Reporter for Testurio
 *
 * Provides Allure TestOps integration for test reporting.
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
 *       includePayloads: 'both',
 *     }),
 *   ],
 * });
 * ```
 */

// TODO: Implement AllureReporter (Phase 3 of ALLURE-REPORTER-DESIGN.md)
export { AllureReporter } from "./allure-reporter";
export type { AllureReporterOptions } from "./types";
