/**
 * Container Environment Configuration
 *
 * Helper functions to read container connection info from environment variables.
 * Used by integration tests after global setup has started containers.
 */

export interface RedisEnvConfig {
	host: string;
	port: number;
	url: string;
}

export interface PostgresEnvConfig {
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	connectionString: string;
}

export interface KafkaEnvConfig {
	host: string;
	port: number;
	brokers: string[];
	schemaRegistryUrl?: string;
	restProxyUrl?: string;
}

/**
 * Check if Docker containers were started by global setup.
 * This should be used with describe.skipIf() to skip tests when Docker is unavailable.
 */
export function isContainerSetupAvailable(): boolean {
	return process.env.TESTURIO_DOCKER_AVAILABLE === "true";
}

/**
 * Check if Redis container is available.
 */
export function isRedisAvailable(): boolean {
	return isContainerSetupAvailable() && !!process.env.TESTURIO_REDIS_HOST;
}

/**
 * Check if PostgreSQL container is available.
 */
export function isPostgresAvailable(): boolean {
	return isContainerSetupAvailable() && !!process.env.TESTURIO_POSTGRES_HOST;
}

/**
 * Check if Kafka container is available.
 */
export function isKafkaAvailable(): boolean {
	return isContainerSetupAvailable() && !!process.env.TESTURIO_KAFKA_HOST;
}

/**
 * Get Redis connection config from environment variables.
 * Throws if Redis is not available.
 */
export function getRedisConfig(): RedisEnvConfig {
	const host = process.env.TESTURIO_REDIS_HOST;
	const port = process.env.TESTURIO_REDIS_PORT;
	const url = process.env.TESTURIO_REDIS_URL;

	if (!host || !port || !url) {
		throw new Error(
			"Redis container config not found in environment. " + "Ensure global setup has run and Docker is available.",
		);
	}

	return {
		host,
		port: parseInt(port, 10),
		url,
	};
}

/**
 * Get PostgreSQL connection config from environment variables.
 * Throws if PostgreSQL is not available.
 */
export function getPostgresConfig(): PostgresEnvConfig {
	const host = process.env.TESTURIO_POSTGRES_HOST;
	const port = process.env.TESTURIO_POSTGRES_PORT;
	const database = process.env.TESTURIO_POSTGRES_DATABASE;
	const username = process.env.TESTURIO_POSTGRES_USERNAME;
	const password = process.env.TESTURIO_POSTGRES_PASSWORD;
	const connectionString = process.env.TESTURIO_POSTGRES_URL;

	if (!host || !port || !database || !username || !password || !connectionString) {
		throw new Error(
			"PostgreSQL container config not found in environment. " +
				"Ensure global setup has run and Docker is available.",
		);
	}

	return {
		host,
		port: parseInt(port, 10),
		database,
		username,
		password,
		connectionString,
	};
}

/**
 * Get Kafka connection config from environment variables.
 * Throws if Kafka is not available.
 */
export function getKafkaConfig(): KafkaEnvConfig {
	const host = process.env.TESTURIO_KAFKA_HOST;
	const port = process.env.TESTURIO_KAFKA_PORT;
	const brokersStr = process.env.TESTURIO_KAFKA_BROKERS;

	if (!host || !port || !brokersStr) {
		throw new Error(
			"Kafka container config not found in environment. " + "Ensure global setup has run and Docker is available.",
		);
	}

	return {
		host,
		port: parseInt(port, 10),
		brokers: brokersStr.split(","),
		schemaRegistryUrl: process.env.TESTURIO_KAFKA_SCHEMA_REGISTRY_URL,
		restProxyUrl: process.env.TESTURIO_KAFKA_REST_PROXY_URL,
	};
}
