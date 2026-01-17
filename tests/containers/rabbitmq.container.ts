/**
 * RabbitMQ Container Utility for Integration Tests
 *
 * Provides helper functions to start and stop RabbitMQ containers
 * using testcontainers for integration testing.
 */

import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";

export interface RabbitMQTestContext {
	container: StartedRabbitMQContainer;
	host: string;
	port: number;
	amqpUrl: string;
	managementUrl: string;
	username: string;
	password: string;
}

export interface RabbitMQContainerOptions {
	/** Docker image to use (default: "rabbitmq:3-management-alpine") */
	image?: string;
	/** Username for authentication (default: "guest") */
	username?: string;
	/** Password for authentication (default: "guest") */
	password?: string;
}

/**
 * Start a RabbitMQ container for testing.
 *
 * Testcontainers automatically allocates available ports on the host,
 * eliminating port conflicts between parallel test files.
 *
 * @param options - Optional configuration
 * @returns RabbitMQ test context with connection details
 *
 * @example
 * ```typescript
 * const rabbitmq = await startRabbitMQContainer();
 * // rabbitmq.amqpUrl = "amqp://guest:guest@localhost:55123"
 * // rabbitmq.host = "localhost"
 * // rabbitmq.port = 55123 (dynamically allocated)
 * ```
 */
export async function startRabbitMQContainer(options?: RabbitMQContainerOptions): Promise<RabbitMQTestContext> {
	const image = options?.image ?? "rabbitmq:3-management-alpine";
	const username = options?.username ?? "guest";
	const password = options?.password ?? "guest";

	// RabbitMQContainer constructor takes username and password as arguments
	const container = new RabbitMQContainer(image).withExposedPorts(5672, 15672);

	const started = await container.start();

	// TESTCONTAINERS_HOST_OVERRIDE is set in global-setup.ts to force IPv4
	const host = started.getHost();
	const port = started.getMappedPort(5672);
	const managementPort = started.getMappedPort(15672);

	return {
		container: started,
		host,
		port,
		amqpUrl: `amqp://${username}:${password}@${host}:${port}`,
		managementUrl: `http://${host}:${managementPort}`,
		username,
		password,
	};
}

/**
 * Stop a RabbitMQ container.
 *
 * @param ctx - RabbitMQ test context returned from startRabbitMQContainer
 */
export async function stopRabbitMQContainer(ctx: RabbitMQTestContext): Promise<void> {
	await ctx.container.stop();
}
