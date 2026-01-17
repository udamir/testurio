/**
 * Redis Container Utility for Integration Tests
 *
 * Provides helper functions to start and stop Redis containers
 * using testcontainers for integration testing.
 */

import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

export interface RedisTestContext {
	container: StartedRedisContainer;
	host: string;
	port: number;
	connectionUrl: string;
}

export interface RedisContainerOptions {
	/** Docker image to use (default: "redis:7-alpine") */
	image?: string;
	/** Password for Redis authentication */
	password?: string;
}

/**
 * Start a Redis container for testing.
 *
 * Testcontainers automatically allocates an available port on the host,
 * eliminating port conflicts between parallel test files.
 *
 * @param options - Optional configuration
 * @returns Redis test context with connection details
 *
 * @example
 * ```typescript
 * const redis = await startRedisContainer();
 * // redis.host = "localhost"
 * // redis.port = 55123 (dynamically allocated)
 * ```
 */
export async function startRedisContainer(options?: RedisContainerOptions): Promise<RedisTestContext> {
	let container = new RedisContainer(options?.image ?? "redis:7-alpine");

	if (options?.password) {
		container = container.withPassword(options.password);
	}

	const started = await container.start();

	// TESTCONTAINERS_HOST_OVERRIDE is set in global-setup.ts to force IPv4
	const host = started.getHost();
	const port = started.getMappedPort(6379);

	return {
		container: started,
		host,
		port,
		connectionUrl: `redis://${host}:${port}`,
	};
}

/**
 * Stop a Redis container.
 *
 * @param ctx - Redis test context returned from startRedisContainer
 */
export async function stopRedisContainer(ctx: RedisTestContext): Promise<void> {
	await ctx.container.stop();
}
