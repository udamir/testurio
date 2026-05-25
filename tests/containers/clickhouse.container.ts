/**
 * ClickHouse Container Utility for Integration Tests
 *
 * Provides helper functions to start and stop ClickHouse containers
 * using testcontainers for integration testing.
 */

import { ClickHouseContainer, type StartedClickHouseContainer } from "@testcontainers/clickhouse";

export interface ClickHouseTestContext {
	container: StartedClickHouseContainer;
	host: string;
	port: number;
	url: string;
	username: string;
	password: string;
	database: string;
}

export interface ClickHouseContainerOptions {
	/** Docker image to use (default: "clickhouse/clickhouse-server:25.6-alpine") */
	image?: string;
	/** Database name (default: "testdb") */
	database?: string;
	/** Username (default: "testuser") */
	username?: string;
	/** Password (default: "testpass") */
	password?: string;
}

/**
 * Start a ClickHouse container for testing.
 *
 * Testcontainers automatically allocates an available host port for the HTTP
 * interface (default container port 8123), eliminating port conflicts between
 * parallel test files.
 *
 * @param options - Optional configuration
 * @returns ClickHouse test context with connection details
 *
 * @example
 * ```typescript
 * const ch = await startClickHouseContainer();
 * // ch.url      = "http://localhost:32801"
 * // ch.host     = "localhost"
 * // ch.port     = 32801 (dynamically allocated)
 * // ch.database = "testdb"
 * ```
 */
export async function startClickHouseContainer(options?: ClickHouseContainerOptions): Promise<ClickHouseTestContext> {
	const image = options?.image ?? "clickhouse/clickhouse-server:25.6-alpine";
	const database = options?.database ?? "testdb";
	const username = options?.username ?? "testuser";
	const password = options?.password ?? "testpass";

	const container = new ClickHouseContainer(image).withDatabase(database).withUsername(username).withPassword(password);

	const started = await container.start();

	return {
		container: started,
		host: started.getHost(),
		port: started.getHttpPort(),
		url: started.getHttpUrl(),
		username: started.getUsername(),
		password: started.getPassword(),
		database: started.getDatabase(),
	};
}

/**
 * Stop a ClickHouse container.
 *
 * @param ctx - ClickHouse test context returned from startClickHouseContainer
 */
export async function stopClickHouseContainer(ctx: ClickHouseTestContext): Promise<void> {
	await ctx.container.stop();
}
