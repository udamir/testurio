/**
 * Internal utilities for the Kafka adapter.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a random lowercase alphanumeric suffix of length `n`.
 *
 * Used by `KafkaAdapter.createSubscriber` to mint per-TC consumer-group IDs
 * (`testurio-${randomSuffix(8)}`) when the user does not supply one explicitly.
 * Strength is intentionally modest — this names a transient consumer group for
 * a single test case, not a cryptographic identifier.
 */
export function randomSuffix(n: number): string {
	let out = "";
	for (let i = 0; i < n; i++) {
		out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
	}
	return out;
}
