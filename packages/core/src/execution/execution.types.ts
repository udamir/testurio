/**
 * Execution Types
 *
 * Types for test execution: steps, results, metadata.
 */

import type { Interaction } from "../recording";

// =============================================================================
// Test Phase & Step Types
// =============================================================================

/**
 * Test execution phase
 */
export type TestPhase = "init" | "before" | "test" | "after" | "stop";

/**
 * Step types
 */
export type StepType =
	// Connection management
	| "connect"
	| "disconnect"
	// Async protocol operations
	| "sendMessage"
	| "waitForMessage"
	// Sync protocol operations
	| "request"
	| "onResponse"
	| "waitForResponse"
	// Utility operations
	| "wait"
	| "waitUntil"
	| "assert"
	// Hook registration (internal)
	| "registerHook"
	// Custom operations
	| "custom";

/**
 * Test step - represents a single action in the test flow
 */
export interface TestStep {
	id?: string;
	type: StepType;
	componentName?: string;
	messageType?: string;
	phase: TestPhase;
	timeout?: number;
	description?: string;
	action: () => Promise<void> | void;
	metadata?: Record<string, unknown>;
}

/**
 * Step execution context
 */
export interface StepExecutionContext {
	currentStep: TestStep;
	totalSteps: number;
	stepIndex: number;
	testContext: Record<string, unknown>;
	abortSignal?: AbortSignal;
}

/**
 * Step info for execution results.
 * Contains only the data needed for reporting, no action function.
 */
export interface StepInfo {
	type: string;
	componentName?: string;
	description?: string;
	messageType?: string;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
	step: StepInfo;
	passed: boolean;
	duration: number;
	startTime: number;
	endTime: number;
	error?: Error;
	result?: unknown;
	metadata?: Record<string, unknown>;
}

// =============================================================================
// Test Metadata
// =============================================================================

/**
 * Severity levels for test cases
 */
export type Severity = "blocker" | "critical" | "normal" | "minor" | "trivial";

/**
 * Test case metadata interface
 */
export interface TestCaseMetadata {
	id?: string;
	issues?: string[];
	epic?: string;
	feature?: string;
	story?: string;
	severity?: Severity;
	tags?: string[];
	labels?: Record<string, string>;
	description?: string;
}

// =============================================================================
// Test Results
// =============================================================================

/**
 * Test step result (simplified for reporting)
 */
export interface TestStepResult {
	stepNumber: number;
	type: string;
	description: string;
	componentName?: string;
	passed: boolean;
	duration: number;
	error?: string;
	stackTrace?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Assertion result
 */
export interface AssertionResult {
	passed: boolean;
	description?: string;
	expected?: unknown;
	actual?: unknown;
	error?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Test case result
 */
export interface TestCaseResult {
	name: string;
	passed: boolean;
	duration: number;
	startTime: number;
	endTime: number;
	steps: TestStepResult[];
	passedSteps: number;
	failedSteps: number;
	totalSteps: number;
	error?: string;
	stackTrace?: string;
	interactions?: Interaction[];
	assertions?: AssertionResult[];
	testCaseMetadata?: TestCaseMetadata;
	metadata?: Record<string, unknown>;
}

/**
 * Test summary statistics
 */
export interface TestSummary {
	totalTestCases: number;
	passedTestCases: number;
	failedTestCases: number;
	totalSteps: number;
	passedSteps: number;
	failedSteps: number;
	totalDuration: number;
	averageDuration: number;
	totalInteractions?: number;
	passRate: number;
}

/**
 * Test scenario result
 */
export interface TestResult {
	name?: string;
	passed: boolean;
	duration: number;
	startTime: number;
	endTime: number;
	testCases: TestCaseResult[];
	passedTests: number;
	failedTests: number;
	totalTests: number;
	interactions?: Interaction[];
	summary?: TestSummary;
	metadata?: Record<string, unknown>;
	/** Error that occurred during scenario initialization */
	error?: string;
	/** Stack trace for initialization error */
	stackTrace?: string;
}

/**
 * Test execution options
 */
export interface TestExecutionOptions {
	failFast?: boolean;
	timeout?: number;
	recording?: boolean;
	concurrency?: number;
	retry?: number;
	retryDelay?: number;
	[key: string]: unknown;
}

/**
 * Test execution status
 */
export type TestExecutionStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "timeout" | "cancelled";
