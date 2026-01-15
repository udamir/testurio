/**
 * Testcontainers Utilities
 *
 * Provides container helpers for integration testing with real services.
 */

export {
	startRedisContainer,
	stopRedisContainer,
	type RedisTestContext,
	type RedisContainerOptions,
} from "./redis.container";

export {
	startKafkaContainer,
	stopKafkaContainer,
	type KafkaTestContext,
	type KafkaContainerOptions,
} from "./kafka.container";

export { isDockerAvailable } from "./docker-check";
