/**
 * Vitest Global Setup
 *
 * Starts all test containers (Redis, PostgreSQL, Kafka) ONCE before any tests run.
 * Connection info is passed to tests via environment variables.
 *
 * Returns a teardown function that stops all containers after tests complete.
 */

import { isDockerAvailable } from "./containers/docker-check";
import { type KafkaTestContext, startKafkaContainer, stopKafkaContainer } from "./containers/kafka.container";
import { type MongoDBTestContext, startMongoContainer, stopMongoContainer } from "./containers/mongodb.container";
import {
	type PostgresTestContext,
	startPostgresContainer,
	stopPostgresContainer,
} from "./containers/postgres.container";
import {
	type RabbitMQTestContext,
	startRabbitMQContainer,
	stopRabbitMQContainer,
} from "./containers/rabbitmq.container";
import { type RedisTestContext, startRedisContainer, stopRedisContainer } from "./containers/redis.container";

// Container contexts - stored at module level for teardown access
let redisContext: RedisTestContext | null = null;
let postgresContext: PostgresTestContext | null = null;
let kafkaContext: KafkaTestContext | null = null;
let rabbitmqContext: RabbitMQTestContext | null = null;
let mongodbContext: MongoDBTestContext | null = null;

export default async function globalSetup(): Promise<() => Promise<void>> {
	// Disable Ryuk (Reaper) to avoid "Failed to connect to Reaper" errors
	// We handle cleanup ourselves in the teardown function
	process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

	// Force testcontainers to use IPv4 to avoid port mapping issues on macOS
	// See: https://github.com/testcontainers/testcontainers-node/issues/750
	process.env.TESTCONTAINERS_HOST_OVERRIDE = "127.0.0.1";

	// Check Docker availability first
	const dockerAvailable = isDockerAvailable();
	process.env.TESTURIO_DOCKER_AVAILABLE = String(dockerAvailable);

	if (!dockerAvailable) {
		console.log("[Global Setup] Docker not available - skipping container startup");
		// Return empty teardown
		return async () => {};
	}

	console.log("[Global Setup] Starting test containers...");
	const startTime = Date.now();

	try {
		// Start all containers in parallel for faster startup
		const [redis, postgres, kafka, rabbitmq, mongodb] = await Promise.all([
			startRedisContainer().catch((err) => {
				console.error("[Global Setup] Failed to start Redis:", err.message);
				return null;
			}),
			startPostgresContainer().catch((err) => {
				console.error("[Global Setup] Failed to start PostgreSQL:", err.message);
				return null;
			}),
			startKafkaContainer({
				enableSchemaRegistry: true,
				enableRestProxy: true,
			}).catch((err) => {
				console.error("[Global Setup] Failed to start Kafka:", err.message);
				return null;
			}),
			startRabbitMQContainer().catch((err) => {
				console.error("[Global Setup] Failed to start RabbitMQ:", err.message);
				return null;
			}),
			startMongoContainer().catch((err) => {
				console.error("[Global Setup] Failed to start MongoDB:", err.message);
				return null;
			}),
		]);

		// Store contexts for teardown
		redisContext = redis;
		postgresContext = postgres;
		kafkaContext = kafka;
		rabbitmqContext = rabbitmq;
		mongodbContext = mongodb;

		// Set Redis environment variables
		if (redis) {
			process.env.TESTURIO_REDIS_HOST = redis.host;
			process.env.TESTURIO_REDIS_PORT = String(redis.port);
			process.env.TESTURIO_REDIS_URL = redis.connectionUrl;
			console.log(`[Global Setup] Redis started: ${redis.host}:${redis.port}`);
		}

		// Set PostgreSQL environment variables
		if (postgres) {
			process.env.TESTURIO_POSTGRES_HOST = postgres.host;
			process.env.TESTURIO_POSTGRES_PORT = String(postgres.port);
			process.env.TESTURIO_POSTGRES_DATABASE = postgres.database;
			process.env.TESTURIO_POSTGRES_USERNAME = postgres.username;
			process.env.TESTURIO_POSTGRES_PASSWORD = postgres.password;
			process.env.TESTURIO_POSTGRES_URL = postgres.connectionString;
			console.log(`[Global Setup] PostgreSQL started: ${postgres.host}:${postgres.port}`);
		}

		// Set Kafka environment variables
		if (kafka) {
			process.env.TESTURIO_KAFKA_HOST = kafka.host;
			process.env.TESTURIO_KAFKA_PORT = String(kafka.port);
			process.env.TESTURIO_KAFKA_BROKERS = kafka.brokers.join(",");
			if (kafka.schemaRegistryUrl) {
				process.env.TESTURIO_KAFKA_SCHEMA_REGISTRY_URL = kafka.schemaRegistryUrl;
			}
			if (kafka.restProxyUrl) {
				process.env.TESTURIO_KAFKA_REST_PROXY_URL = kafka.restProxyUrl;
			}
			console.log(`[Global Setup] Kafka started: ${kafka.brokers.join(",")}`);
		}

		// Set RabbitMQ environment variables
		if (rabbitmq) {
			process.env.TESTURIO_RABBITMQ_HOST = rabbitmq.host;
			process.env.TESTURIO_RABBITMQ_PORT = String(rabbitmq.port);
			process.env.TESTURIO_RABBITMQ_URL = rabbitmq.amqpUrl;
			process.env.TESTURIO_RABBITMQ_MANAGEMENT_URL = rabbitmq.managementUrl;
			process.env.TESTURIO_RABBITMQ_USERNAME = rabbitmq.username;
			process.env.TESTURIO_RABBITMQ_PASSWORD = rabbitmq.password;
			console.log(`[Global Setup] RabbitMQ started: ${rabbitmq.host}:${rabbitmq.port}`);
		}

		// Set MongoDB environment variables
		if (mongodb) {
			process.env.TESTURIO_MONGODB_HOST = mongodb.host;
			process.env.TESTURIO_MONGODB_PORT = String(mongodb.port);
			process.env.TESTURIO_MONGODB_URI = mongodb.uri;
			process.env.TESTURIO_MONGODB_DATABASE = mongodb.database;
			console.log(`[Global Setup] MongoDB started: ${mongodb.host}:${mongodb.port}`);
		}

		const elapsed = Date.now() - startTime;
		console.log(`[Global Setup] All containers started in ${elapsed}ms`);
	} catch (error) {
		console.error("[Global Setup] Error starting containers:", error);
		// Don't throw - let tests handle missing containers via skip
	}

	// Return teardown function
	return async () => {
		console.log("[Global Teardown] Stopping test containers...");
		const stopStart = Date.now();

		const stopPromises: Promise<void>[] = [];

		if (redisContext) {
			stopPromises.push(
				stopRedisContainer(redisContext).catch((err) => {
					console.error("[Global Teardown] Error stopping Redis:", err.message);
				})
			);
		}

		if (postgresContext) {
			stopPromises.push(
				stopPostgresContainer(postgresContext).catch((err) => {
					console.error("[Global Teardown] Error stopping PostgreSQL:", err.message);
				})
			);
		}

		if (kafkaContext) {
			stopPromises.push(
				stopKafkaContainer(kafkaContext).catch((err) => {
					console.error("[Global Teardown] Error stopping Kafka:", err.message);
				})
			);
		}

		if (rabbitmqContext) {
			stopPromises.push(
				stopRabbitMQContainer(rabbitmqContext).catch((err) => {
					console.error("[Global Teardown] Error stopping RabbitMQ:", err.message);
				})
			);
		}

		if (mongodbContext) {
			stopPromises.push(
				stopMongoContainer(mongodbContext).catch((err) => {
					console.error("[Global Teardown] Error stopping MongoDB:", err.message);
				})
			);
		}

		await Promise.all(stopPromises);

		const elapsed = Date.now() - stopStart;
		console.log(`[Global Teardown] All containers stopped in ${elapsed}ms`);
	};
}
