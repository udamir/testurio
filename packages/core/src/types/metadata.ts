/**
 * Test Case Metadata
 *
 * Metadata for test cases that maps to Allure labels, links, and custom fields.
 */

/**
 * Severity levels for test cases
 */
export type Severity = "blocker" | "critical" | "normal" | "minor" | "trivial";

/**
 * Test case metadata interface
 */
export interface TestCaseMetadata {
	/** Test case ID (maps to Allure TestOps ID and TMS ID) */
	id?: string;

	/** Issue/bug tracker IDs (e.g., Jira ticket IDs) */
	issues?: string[];

	/** Epic for BDD hierarchy */
	epic?: string;

	/** Feature for BDD hierarchy */
	feature?: string;

	/** Story for BDD hierarchy */
	story?: string;

	/** Severity level */
	severity?: Severity;

	/** Tags for filtering and categorization */
	tags?: string[];

	/** Custom labels (key-value pairs) */
	labels?: Record<string, string>;

	/** Description in markdown format */
	description?: string;
}
