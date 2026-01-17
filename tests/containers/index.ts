/**
 * Testcontainers Utilities
 *
 * Provides container helpers for integration testing with real services.
 */

export { isDockerAvailable } from "./docker-check";

export {
	type KafkaContainerOptions,
	type KafkaTestContext,
	startKafkaContainer,
	stopKafkaContainer,
} from "./kafka.container";
export {
	type PostgresContainerOptions,
	type PostgresTestContext,
	startPostgresContainer,
	stopPostgresContainer,
} from "./postgres.container";
export {
	type RedisContainerOptions,
	type RedisTestContext,
	startRedisContainer,
	stopRedisContainer,
} from "./redis.container";

// Environment-based configuration helpers (for use with global setup)
export {
	type KafkaEnvConfig,
	type PostgresEnvConfig,
	type RedisEnvConfig,
	getKafkaConfig,
	getPostgresConfig,
	getRedisConfig,
	isContainerSetupAvailable,
	isKafkaAvailable,
	isPostgresAvailable,
	isRedisAvailable,
} from "./env-config";
