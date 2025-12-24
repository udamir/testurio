/**
 * Step Types
 *
 * Types for test steps and execution phases.
 */

/**
 * Test execution phase
 */
export type TestPhase = "init" | "before" | "test" | "after" | "stop";

/**
 * Test step - represents a single action in the test flow
 */
export interface TestStep {
	id?: string; // Step unique ID
	type: StepType; // Step type
	componentName?: string; // Component name this step operates on
	messageType?: string; // Message type (for message-related steps)
	phase: TestPhase; // Test phase this step belongs to
	timeout?: number; // Step timeout in milliseconds
	description?: string; // Step description
	action: () => Promise<void> | void; // Step action to execute
	metadata?: Record<string, unknown>; // Step metadata
}

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
 * Step execution context
 */
export interface StepExecutionContext {
	currentStep: TestStep; // Current step being executed
	totalSteps: number; // Total steps in the test
	stepIndex: number; // Step index (0-based)
	testContext: Record<string, unknown>; // Shared test context
	abortSignal?: AbortSignal; // Abort signal for cancellation
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
	step: TestStep; // Step that was executed
	passed: boolean; // Whether the step passed
	duration: number; // Step execution duration in milliseconds
	startTime: number; // Start timestamp
	endTime: number; // End timestamp
	error?: Error; // Error if step failed
	result?: unknown; // Step output/result
	metadata?: Record<string, unknown>; // Additional metadata
}
