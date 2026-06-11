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
	 * Include recorded payloads in Allure steps.
	 *
	 * Payloads always render as `application/json` attachments — the Allure
	 * 3.x JSON viewer prettifies, syntax-highlights, and folds them on click.
	 *
	 * - undefined: Don't include payloads (default)
	 * - "attachments": Add payloads as JSON file attachments (canonical value)
	 * - "both": Alias for "attachments" (kept for backward compatibility)
	 * - "parameters": @deprecated alias for "attachments" — previously rendered
	 *   payloads as flat parameter rows, which the Allure UI collapses to a
	 *   single-line string with no syntax highlighting. A one-time warning is
	 *   emitted at reporter construction when this value is used.
	 */
	includePayloads?: "parameters" | "attachments" | "both";

	/**
	 * @deprecated No longer applied to payloads. Attachments are written at
	 * full size; the Allure JSON viewer handles folding. Kept on the type so
	 * existing user configs continue to type-check; a one-time warning is
	 * emitted at reporter construction when this is set.
	 */
	maxPayloadSize?: number;
}
