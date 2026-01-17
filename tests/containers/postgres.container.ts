/**
 * PostgreSQL Container Utility for Integration Tests
 *
 * Provides helper functions to start and stop PostgreSQL containers
 * using testcontainers for integration testing.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

export interface PostgresTestContext {
	container: StartedPostgreSqlContainer;
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	connectionString: string;
}

export interface PostgresContainerOptions {
	/** Docker image to use (default: "postgres:16-alpine") */
	image?: string;
	/** Database name (default: "testdb") */
	database?: string;
	/** Username (default: "testuser") */
	username?: string;
	/** Password (default: "testpass") */
	password?: string;
}

/**
 * Start a PostgreSQL container for testing.
 *
 * Testcontainers automatically allocates available ports on the host,
 * eliminating port conflicts between parallel test files.
 *
 * @param options - Optional configuration
 * @returns PostgreSQL test context with connection details
 *
 * @example
 * ```typescript
 * const pg = await startPostgresContainer();
 * // pg.connectionString = "postgresql://testuser:testpass@localhost:55123/testdb"
 * // pg.host = "localhost"
 * // pg.port = 55123 (dynamically allocated)
 * ```
 */
export async function startPostgresContainer(options?: PostgresContainerOptions): Promise<PostgresTestContext> {
	const image = options?.image ?? "postgres:16-alpine";
	const database = options?.database ?? "testdb";
	const username = options?.username ?? "testuser";
	const password = options?.password ?? "testpass";

	const container = new PostgreSqlContainer(image).withDatabase(database).withUsername(username).withPassword(password);

	const started = await container.start();

	// TESTCONTAINERS_HOST_OVERRIDE is set in global-setup.ts to force IPv4
	const host = started.getHost();
	const port = started.getMappedPort(5432);

	return {
		container: started,
		host,
		port,
		database,
		username,
		password,
		connectionString: `postgresql://${username}:${password}@${host}:${port}/${database}`,
	};
}

/**
 * Stop a PostgreSQL container.
 *
 * @param ctx - PostgreSQL test context returned from startPostgresContainer
 */
export async function stopPostgresContainer(ctx: PostgresTestContext): Promise<void> {
	await ctx.container.stop();
}
