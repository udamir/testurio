/**
 * Allure Reporter
 *
 * Converts testurio test results to Allure format.
 */

import type { AllureReporterOptions } from "./types";

/**
 * Allure Reporter - placeholder implementation
 * TODO: Implement full reporter (Phase 3 of ALLURE-REPORTER-DESIGN.md)
 */
export class AllureReporter {
	private options: AllureReporterOptions;

	constructor(options?: AllureReporterOptions) {
		this.options = {
			resultsDir: "allure-results",
			...options,
		};
	}

	/**
	 * Get reporter options
	 */
	getOptions(): AllureReporterOptions {
		return this.options;
	}

	/**
	 * Called when scenario starts
	 */
	onStart(_info: { name: string; startTime: number }): void {
		// TODO: Initialize container for the scenario
	}

	/**
	 * Called when scenario completes
	 */
	onComplete(_result: unknown): void {
		// TODO: Write container and environment info
	}
}
