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
	type RedisContainerOptions,
	type RedisTestContext,
	startRedisContainer,
	stopRedisContainer,
} from "./redis.container";
