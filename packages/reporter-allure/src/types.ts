/**
 * Allure Reporter Types
 */

import type { Label } from "allure-js-commons";

/**
 * Allure reporter options
 */
export interface AllureReporterOptions {
	/** Output directory (default: "allure-results") */
	resultsDir?: string;

	/** Environment info to include */
	environmentInfo?: Record<string, string>;

	/** Default labels for all tests */
	labels?: Label[];

	/** Categories definition file path */
	categories?: string;

	/** URL pattern for TMS links (use {id} placeholder) */
	tmsUrlPattern?: string;

	/** URL pattern for issue links (use {id} placeholder) */
	issueUrlPattern?: string;

	/** Default epic for all tests */
	defaultEpic?: string;

	/** Default feature for all tests */
	defaultFeature?: string;

	/**
	 * Include recorded payloads in Allure steps
	 * - undefined: Don't include payloads (default)
	 * - "parameters": Add payloads as step parameters (inline, truncated to maxPayloadSize)
	 * - "attachments": Add payloads as JSON file attachments (full content)
	 * - "both": Add as both parameters and attachments
	 */
	includePayloads?: "parameters" | "attachments" | "both";

	/**
	 * Maximum payload size for "parameters" mode (default: 1000 characters)
	 * Payloads exceeding this limit are truncated with "..." suffix
	 */
	maxPayloadSize?: number;
}
