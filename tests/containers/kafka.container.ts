/**
 * Kafka Container Utility for Integration Tests
 *
 * Provides helper functions to start and stop Redpanda containers
 * (Kafka-compatible) using testcontainers for integration testing.
 */

import { RedpandaContainer, type StartedRedpandaContainer } from "@testcontainers/redpanda";

export interface KafkaTestContext {
	container: StartedRedpandaContainer;
	brokers: string[];
	host: string;
	port: number;
	schemaRegistryUrl?: string;
	restProxyUrl?: string;
}

export interface KafkaContainerOptions {
	/** Docker image to use (default: uses Redpanda v24.2.4) */
	image?: string;
	/** Enable Schema Registry (default: false) */
	enableSchemaRegistry?: boolean;
	/** Enable REST Proxy (default: false) */
	enableRestProxy?: boolean;
}

/** Default Redpanda image - v24.2.4 is stable and well-tested */
const DEFAULT_REDPANDA_IMAGE = "docker.redpanda.com/redpandadata/redpanda:v24.2.4";

/**
 * Start a Redpanda (Kafka-compatible) container for testing.
 *
 * Testcontainers automatically allocates available ports on the host,
 * eliminating port conflicts between parallel test files.
 *
 * Note: RedpandaContainer already exposes all required ports (9092, 8081, 8082, 9644)
 * internally. Do NOT call withExposedPorts() as it will overwrite the internal configuration.
 *
 * @param options - Optional configuration
 * @returns Kafka test context with connection details
 *
 * @example
 * ```typescript
 * const kafka = await startKafkaContainer();
 * // kafka.brokers = ["localhost:55123"]
 * // kafka.host = "localhost"
 * // kafka.port = 55123 (dynamically allocated)
 * ```
 */
export async function startKafkaContainer(options?: KafkaContainerOptions): Promise<KafkaTestContext> {
	// RedpandaContainer requires explicit image parameter in v11.x+
	// Do NOT call withExposedPorts() - RedpandaContainer already configures all ports internally
	const image = options?.image ?? DEFAULT_REDPANDA_IMAGE;
	const container = new RedpandaContainer(image);

	const started = await container.start();

	// TESTCONTAINERS_HOST_OVERRIDE is set in global-setup.ts to force IPv4
	const host = started.getHost();
	const port = started.getMappedPort(9092);

	const context: KafkaTestContext = {
		container: started,
		brokers: [`${host}:${port}`],
		host,
		port,
	};

	// Schema Registry and REST Proxy are always available (exposed by default)
	if (options?.enableSchemaRegistry) {
		const schemaPort = started.getMappedPort(8081);
		context.schemaRegistryUrl = `http://${host}:${schemaPort}`;
	}

	if (options?.enableRestProxy) {
		const restPort = started.getMappedPort(8082);
		context.restProxyUrl = `http://${host}:${restPort}`;
	}

	return context;
}

/**
 * Stop a Kafka/Redpanda container.
 *
 * @param ctx - Kafka test context returned from startKafkaContainer
 */
export async function stopKafkaContainer(ctx: KafkaTestContext): Promise<void> {
	await ctx.container.stop();
}
