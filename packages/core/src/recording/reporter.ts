/**
 * Test Reporter
 *
 * Interface and implementations for reporting test results.
 */

import type { TestCaseResult, TestResult, TestStepResult } from "../execution/execution.types";
import type { Interaction } from "./recording.types";

/**
 * Test Reporter Interface
 */
export interface TestReporter {
	/** Reporter name */
	readonly name: string;

	/** Called when test execution starts */
	onStart?(result: { name?: string; startTime: number }): void;

	/** Called when a test case starts */
	onTestCaseStart?(testCase: { name: string }): void;

	/** Called when a test step completes */
	onStepComplete?(step: TestStepResult): void;

	/** Called when a test case completes */
	onTestCaseComplete?(result: TestCaseResult): void;

	/** Called when test execution completes */
	onComplete(result: TestResult): void;

	/** Called when an error occurs */
	onError?(error: Error): void;
}

/**
 * Console Reporter
 *
 * Outputs test results to console with formatting.
 */
export class ConsoleReporter implements TestReporter {
	readonly name = "console";
	private verbose: boolean;

	constructor(options?: { verbose?: boolean }) {
		this.verbose = options?.verbose ?? false;
	}

	onStart(result: { name?: string; startTime: number }): void {
		console.log(`\n${"=".repeat(60)}`);
		console.log(`🧪 Test Scenario: ${result.name || "Unnamed"}`);
		console.log(`${"=".repeat(60)}\n`);
	}

	onTestCaseStart(testCase: { name: string }): void {
		if (this.verbose) {
			console.log(`  📋 ${testCase.name}`);
		}
	}

	onStepComplete(step: TestStepResult): void {
		if (this.verbose) {
			const icon = step.passed ? "✓" : "✗";
			const color = step.passed ? "\x1b[32m" : "\x1b[31m";
			const reset = "\x1b[0m";
			console.log(`    ${color}${icon}${reset} ${step.description} (${step.duration}ms)`);
		}
	}

	onTestCaseComplete(result: TestCaseResult): void {
		const icon = result.passed ? "✅" : "❌";
		const status = result.passed ? "PASSED" : "FAILED";
		console.log(`${icon} ${result.name} - ${status} (${result.duration}ms)`);

		if (!result.passed && result.error) {
			console.log(`   Error: ${result.error}`);
		}
	}

	onComplete(result: TestResult): void {
		console.log(`\n${"-".repeat(60)}`);
		console.log("📊 Summary");
		console.log("-".repeat(60));

		console.log(`Total:    ${result.totalTests} test(s)`);
		console.log(`Passed:   ${result.passedTests}`);
		console.log(`Failed:   ${result.failedTests}`);
		console.log(`Duration: ${result.duration}ms`);

		if (result.summary) {
			console.log(`Steps:    ${result.summary.totalSteps}`);
			console.log(`Pass Rate: ${(result.summary.passRate * 100).toFixed(1)}%`);
		}

		console.log("-".repeat(60));

		if (result.passed) {
			console.log("\n✅ All tests passed!\n");
		} else {
			console.log("\n❌ Some tests failed.\n");
		}
	}

	onError(error: Error): void {
		console.error(`\n❌ Error: ${error.message}\n`);
	}
}

/**
 * JSON Reporter
 *
 * Outputs test results as JSON.
 */
export class JsonReporter implements TestReporter {
	readonly name = "json";
	private output: string[] = [];
	private prettyPrint: boolean;

	constructor(options?: { prettyPrint?: boolean }) {
		this.prettyPrint = options?.prettyPrint ?? true;
	}

	onComplete(result: TestResult): void {
		const json = this.prettyPrint ? JSON.stringify(result, null, 2) : JSON.stringify(result);
		this.output.push(json);
		console.log(json);
	}

	/**
	 * Get the JSON output
	 */
	getOutput(): string {
		return this.output.join("\n");
	}
}

/**
 * Silent Reporter
 *
 * Does not output anything (useful for testing).
 */
export class SilentReporter implements TestReporter {
	readonly name = "silent";
	private results: TestResult[] = [];

	onComplete(result: TestResult): void {
		this.results.push(result);
	}

	/**
	 * Get collected results
	 */
	getResults(): TestResult[] {
		return this.results;
	}

	/**
	 * Get last result
	 */
	getLastResult(): TestResult | undefined {
		return this.results[this.results.length - 1];
	}
}

/**
 * Composite Reporter
 *
 * Combines multiple reporters.
 */
export class CompositeReporter implements TestReporter {
	readonly name = "composite";
	private reporters: TestReporter[];

	constructor(reporters: TestReporter[]) {
		this.reporters = reporters;
	}

	onStart(result: { name?: string; startTime: number }): void {
		for (const reporter of this.reporters) {
			reporter.onStart?.(result);
		}
	}

	onTestCaseStart(testCase: { name: string }): void {
		for (const reporter of this.reporters) {
			reporter.onTestCaseStart?.(testCase);
		}
	}

	onStepComplete(step: TestStepResult): void {
		for (const reporter of this.reporters) {
			reporter.onStepComplete?.(step);
		}
	}

	onTestCaseComplete(result: TestCaseResult): void {
		for (const reporter of this.reporters) {
			reporter.onTestCaseComplete?.(result);
		}
	}

	onComplete(result: TestResult): void {
		for (const reporter of this.reporters) {
			reporter.onComplete(result);
		}
	}

	onError(error: Error): void {
		for (const reporter of this.reporters) {
			reporter.onError?.(error);
		}
	}

	/**
	 * Add a reporter
	 */
	addReporter(reporter: TestReporter): void {
		this.reporters.push(reporter);
	}

	/**
	 * Remove a reporter by name
	 */
	removeReporter(name: string): void {
		this.reporters = this.reporters.filter((r) => r.name !== name);
	}
}

/**
 * Interaction Summary Reporter
 *
 * Reports interaction statistics.
 */
export class InteractionReporter implements TestReporter {
	readonly name = "interaction";

	onComplete(result: TestResult): void {
		if (!result.interactions || result.interactions.length === 0) {
			console.log("\n📡 No interactions recorded.\n");
			return;
		}

		console.log(`\n${"-".repeat(60)}`);
		console.log("📡 Interaction Summary");
		console.log("-".repeat(60));

		// Group by service
		const byService: Record<string, Interaction[]> = {};
		for (const interaction of result.interactions) {
			const service = interaction.serviceName;
			if (!byService[service]) {
				byService[service] = [];
			}
			byService[service].push(interaction);
		}

		// Print by service
		for (const [service, interactions] of Object.entries(byService)) {
			console.log(`\n  ${service}:`);
			const completed = interactions.filter((i) => i.status === "completed").length;
			const failed = interactions.filter((i) => i.status === "failed").length;
			const pending = interactions.filter((i) => i.status === "pending").length;

			console.log(`    Total: ${interactions.length}`);
			console.log(`    Completed: ${completed}`);
			if (failed > 0) console.log(`    Failed: ${failed}`);
			if (pending > 0) console.log(`    Pending: ${pending}`);

			// Average duration
			const durations = interactions.filter((i) => i.duration !== undefined).map((i) => i.duration as number);
			if (durations.length > 0) {
				const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
				console.log(`    Avg Duration: ${avg.toFixed(2)}ms`);
			}
		}

		console.log(`\n${"-".repeat(60)}`);
	}
}
