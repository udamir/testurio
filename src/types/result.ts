/**
 * Result Types
 *
 * Types for test execution results and reporting.
 */

import type { Interaction } from "./message";
import type { TestCaseMetadata } from "./metadata";

/**
 * Test step result (simplified for reporting)
 */
export interface TestStepResult {
	stepNumber: number;                    // Step number
	type: string;                          // Step type
	description: string;                   // Step description
	componentName?: string;                // Component name
	passed: boolean;                       // Whether the step passed
	duration: number;                      // Step duration in milliseconds
	error?: string;                        // Error message if failed
	stackTrace?: string;                   // Error stack trace
	metadata?: Record<string, unknown>;    // Additional metadata
}

/**
 * Test case result
 */
export interface TestCaseResult {
	name: string;                          // Test case name
	passed: boolean;                       // Whether the test case passed
	duration: number;                      // Total duration in milliseconds
	startTime: number;                     // Start timestamp
	endTime: number;                       // End timestamp
	steps: TestStepResult[];               // Individual step results
	passedSteps: number;                   // Number of passed steps
	failedSteps: number;                   // Number of failed steps
	totalSteps: number;                    // Total number of steps
	error?: string;                        // Error if test case failed
	stackTrace?: string;                   // Error stack trace
	interactions?: Interaction[];          // Recorded interactions during test
	assertions?: AssertionResult[];        // Assertion results
	testCaseMetadata?: TestCaseMetadata;   // Test case metadata for reporters
	metadata?: Record<string, unknown>;    // Additional step metadata
}

/**
 * Test scenario result
 */
export interface TestResult {
	name?: string;                         // Scenario name
	passed: boolean;                       // Whether all test cases passed
	duration: number;                      // Total duration in milliseconds
	startTime: number;                     // Start timestamp
	endTime: number;                       // End timestamp
	testCases: TestCaseResult[];           // Individual test case results
	passedTests: number;                   // Number of passed test cases
	failedTests: number;                   // Number of failed test cases
	totalTests: number;                    // Total number of test cases
	interactions?: Interaction[];          // All recorded interactions
	summary?: TestSummary;                 // Summary statistics
	metadata?: Record<string, unknown>;    // Additional metadata
}

/**
 * Test summary statistics
 */
export interface TestSummary {
	totalTestCases: number;                // Total test cases
	passedTestCases: number;               // Passed test cases
	failedTestCases: number;               // Failed test cases
	totalSteps: number;                    // Total steps across all tests
	passedSteps: number;                   // Passed steps
	failedSteps: number;                   // Failed steps
	totalDuration: number;                 // Total duration
	averageDuration: number;               // Average test case duration
	totalInteractions?: number;            // Total interactions recorded
	passRate: number;                      // Pass rate (0-1)
}

/**
 * Assertion result
 */
export interface AssertionResult {
	passed: boolean;                       // Whether assertion passed
	description?: string;                  // Assertion description
	expected?: unknown;                    // Expected value
	actual?: unknown;                      // Actual value
	error?: string;                        // Error message if failed
	metadata?: Record<string, unknown>;    // Additional metadata
}

/**
 * Test execution options
 */
export interface TestExecutionOptions {
	failFast?: boolean;                    // Stop on first failure
	timeout?: number;                      // Global timeout for all tests (milliseconds)
	recording?: boolean;                   // Enable interaction recording
	concurrency?: number;                  // Concurrency level for parallel tests
	retry?: number;                        // Retry failed tests
	retryDelay?: number;                   // Retry delay (milliseconds)
	[key: string]: unknown;                // Additional options
}

/**
 * Test execution status
 */
export type TestExecutionStatus =
	| "pending"
	| "running"
	| "passed"
	| "failed"
	| "skipped"
	| "timeout"
	| "cancelled";
