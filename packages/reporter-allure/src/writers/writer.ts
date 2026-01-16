/**
 * Allure Writer Interface
 *
 * Defines the contract for writing Allure result files.
 */

import type { TestResult, TestResultContainer } from "allure-js-commons";

/**
 * Interface for writing Allure result files
 */
export interface AllureWriter {
	/**
	 * Write test result JSON file
	 * @param result - Allure test result object
	 */
	writeTestResult(result: TestResult): void;

	/**
	 * Write container JSON file
	 * @param container - Allure test result container
	 */
	writeContainer(container: TestResultContainer): void;

	/**
	 * Write environment.properties file
	 * @param info - Key-value pairs for environment info
	 */
	writeEnvironment(info: Record<string, string>): void;

	/**
	 * Write attachment file and return filename
	 * @param name - Suggested attachment name
	 * @param content - Attachment content
	 * @param mimeType - MIME type of content
	 * @returns Generated filename for reference
	 */
	writeAttachment(name: string, content: Buffer, mimeType: string): string;
}
