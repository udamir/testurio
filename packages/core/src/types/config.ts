/**
 * Configuration Types
 *
 * Configuration interfaces for test scenarios and components.
 */

import type { Address } from "./protocol";

/**
 * Options for dynamic component creation
 */
export interface CreateComponentOptions {
	/**
	 * Component scope determines when the component is stopped:
	 * - "scenario": Component persists for entire scenario (default)
	 * - "testCase": Component is stopped after test case completes
	 */
	scope?: "scenario" | "testCase";
}

/**
 * Schema definition
 */
export interface SchemaDefinition {
	type: "openapi" | "protobuf" | "json-schema" | "custom"; // Schema type
	content: string | Record<string, unknown>; // Schema content or path
	validate?: boolean; // Enable validation
	validationOptions?: ValidationOptions; // Validation options
}

/**
 * Validation options
 */
export interface ValidationOptions {
	validateRequests?: boolean; // Validate requests
	validateResponses?: boolean; // Validate responses
	strict?: boolean; // Strict validation
	[key: string]: unknown; // Additional options
}

/**
 * Server handle for managing server lifecycle
 */
export interface ServerHandle {
	stop: () => Promise<void>; // Stop the server
	address?: Address; // Server address
	[key: string]: unknown; // Additional server information
}

/**
 * Client handle for managing client lifecycle
 */
export interface ClientHandle {
	disconnect: () => Promise<void>; // Disconnect the client
	isConnected: () => boolean; // Check if connected
	[key: string]: unknown; // Additional client information
}
