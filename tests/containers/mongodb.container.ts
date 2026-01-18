/**
 * MongoDB Container Utility for Integration Tests
 *
 * Provides helper functions to start and stop MongoDB containers
 * using testcontainers for integration testing.
 */

import { MongoDBContainer, type StartedMongoDBContainer } from "@testcontainers/mongodb";

export interface MongoDBTestContext {
	container: StartedMongoDBContainer;
	host: string;
	port: number;
	uri: string;
	database: string;
}

export interface MongoDBContainerOptions {
	/** Docker image to use (default: "mongo:7") */
	image?: string;
	/** Database name (default: "testdb") */
	database?: string;
}

/**
 * Start a MongoDB container for testing.
 *
 * Testcontainers automatically allocates available ports on the host,
 * eliminating port conflicts between parallel test files.
 *
 * @param options - Optional configuration
 * @returns MongoDB test context with connection details
 *
 * @example
 * ```typescript
 * const mongo = await startMongoContainer();
 * // mongo.uri = "mongodb://localhost:55123"
 * // mongo.host = "localhost"
 * // mongo.port = 55123 (dynamically allocated)
 * ```
 */
export async function startMongoContainer(options?: MongoDBContainerOptions): Promise<MongoDBTestContext> {
	const image = options?.image ?? "mongo:7";
	const database = options?.database ?? "testdb";

	const container = new MongoDBContainer(image);

	const started = await container.start();

	// Get base connection string and append directConnection=true
	// This is required for standalone MongoDB instances to avoid
	// replica set discovery which causes connection timeouts
	const baseUri = started.getConnectionString();
	const uri = baseUri.includes("?")
		? `${baseUri}&directConnection=true`
		: `${baseUri}?directConnection=true`;

	return {
		container: started,
		host: started.getHost(),
		port: started.getMappedPort(27017),
		uri,
		database,
	};
}

/**
 * Stop a MongoDB container.
 *
 * @param ctx - MongoDB test context returned from startMongoContainer
 */
export async function stopMongoContainer(ctx: MongoDBTestContext): Promise<void> {
	await ctx.container.stop();
}
