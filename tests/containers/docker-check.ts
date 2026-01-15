/**
 * Docker Availability Check
 *
 * Utility to check if Docker daemon is running.
 * Tests can use this to skip when Docker is unavailable.
 */

import { execSync } from "node:child_process";

let dockerAvailable: boolean | null = null;

/**
 * Check if Docker daemon is running and accessible.
 *
 * Result is cached for the lifetime of the process.
 *
 * @returns true if Docker is available, false otherwise
 *
 * @example
 * ```typescript
 * import { isDockerAvailable } from "../containers";
 *
 * describe.skipIf(!isDockerAvailable())("Redis Integration", () => {
 *   // These tests will be skipped if Docker is not running
 * });
 * ```
 */
export function isDockerAvailable(): boolean {
	if (dockerAvailable !== null) {
		return dockerAvailable;
	}

	try {
		execSync("docker info", { stdio: "ignore", timeout: 5000 });
		dockerAvailable = true;
	} catch {
		dockerAvailable = false;
	}

	return dockerAvailable;
}
