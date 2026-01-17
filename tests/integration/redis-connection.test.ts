/**
 * Redis Connection Test
 *
 * Debug test to verify Redis container connectivity.
 */

import Redis from "ioredis";
import { describe, expect, it } from "vitest";
import { getRedisConfig, isRedisAvailable } from "../containers";

describe.skipIf(!isRedisAvailable())("Redis Connection Debug", () => {
	it("should connect to Redis directly with ioredis", async () => {
		const redis = getRedisConfig();
		console.log(`Connecting to Redis at ${redis.host}:${redis.port}...`);

		const client = new Redis({
			host: redis.host,
			port: redis.port,
			lazyConnect: true,
		});

		await client.connect();
		console.log("Connected successfully!");

		// Test basic operations
		await client.set("test-key", "test-value");
		const value = await client.get("test-key");
		console.log(`Got value: ${value}`);

		expect(value).toBe("test-value");

		await client.quit();
	});

	it("should work with pub/sub", async () => {
		const redis = getRedisConfig();

		const publisher = new Redis({
			host: redis.host,
			port: redis.port,
		});

		const subscriber = new Redis({
			host: redis.host,
			port: redis.port,
		});

		const receivedMessages: string[] = [];

		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Timeout waiting for message"));
			}, 5000);

			subscriber.on("message", (channel, message) => {
				console.log(`Received on ${channel}: ${message}`);
				receivedMessages.push(message);
				clearTimeout(timeout);
				resolve();
			});

			subscriber.subscribe("test-channel", (err) => {
				if (err) {
					clearTimeout(timeout);
					reject(err);
					return;
				}
				console.log("Subscribed to test-channel");

				// Publish after subscription is confirmed
				setTimeout(() => {
					console.log("Publishing message...");
					publisher.publish("test-channel", "hello");
				}, 100);
			});
		});

		expect(receivedMessages).toContain("hello");

		await publisher.quit();
		await subscriber.quit();
	});
});
