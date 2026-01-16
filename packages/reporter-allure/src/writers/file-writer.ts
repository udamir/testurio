/**
 * FileSystem Writer
 *
 * Writes Allure result files to the file system.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TestResult, TestResultContainer } from "allure-js-commons";
import type { AllureWriter } from "./writer";

/**
 * Map MIME types to file extensions
 */
const MIME_TO_EXTENSION: Record<string, string> = {
	"application/json": "json",
	"text/plain": "txt",
	"text/html": "html",
	"text/csv": "csv",
	"text/xml": "xml",
	"application/xml": "xml",
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/svg+xml": "svg",
	"video/webm": "webm",
	"video/mp4": "mp4",
};

/**
 * FileSystemWriter - writes Allure result files to disk
 */
export class FileSystemWriter implements AllureWriter {
	private resultsDir: string;

	constructor(resultsDir: string) {
		this.resultsDir = resultsDir;
		this.ensureDirectory();
	}

	/**
	 * Ensure the results directory exists
	 */
	private ensureDirectory(): void {
		if (!fs.existsSync(this.resultsDir)) {
			fs.mkdirSync(this.resultsDir, { recursive: true });
		}
	}

	/**
	 * Write test result JSON file
	 */
	writeTestResult(result: TestResult): void {
		const filename = `${result.uuid}-result.json`;
		const filePath = path.join(this.resultsDir, filename);
		fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
	}

	/**
	 * Write container JSON file
	 */
	writeContainer(container: TestResultContainer): void {
		const filename = `${container.uuid}-container.json`;
		const filePath = path.join(this.resultsDir, filename);
		fs.writeFileSync(filePath, JSON.stringify(container, null, 2));
	}

	/**
	 * Write environment.properties file
	 */
	writeEnvironment(info: Record<string, string>): void {
		const lines = Object.entries(info).map(([key, value]) => `${key}=${value}`);
		const content = lines.join("\n");
		const filePath = path.join(this.resultsDir, "environment.properties");
		fs.writeFileSync(filePath, content);
	}

	/**
	 * Write attachment file and return filename
	 */
	writeAttachment(_name: string, content: Buffer, mimeType: string): string {
		const extension = MIME_TO_EXTENSION[mimeType] || "bin";
		const uuid = randomUUID();
		const filename = `${uuid}-attachment.${extension}`;
		const filePath = path.join(this.resultsDir, filename);
		fs.writeFileSync(filePath, content);
		return filename;
	}

	/**
	 * Get the results directory path
	 */
	getResultsDir(): string {
		return this.resultsDir;
	}
}
