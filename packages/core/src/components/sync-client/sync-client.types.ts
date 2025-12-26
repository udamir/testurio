/**
 * Sync Client Types
 *
 * Type extraction helpers for sync client step builders.
 */

/**
 * Extract client request payload type from service definition.
 * Works for both HTTP and gRPC service definitions:
 * - HTTP: Extracts `body` from `S[K]["request"]["body"]`
 * - gRPC: Extracts `S[K]["request"]` directly
 * - Fallback: `unknown` if no "request" property
 *
 * @template S - Service definition type
 * @template K - Operation/method key
 */
export type ExtractClientRequest<S, K extends keyof S> = S[K] extends {
	request: { body: infer B };
}
	? B
	: S[K] extends { request: infer R }
		? R
		: unknown;

/**
 * Extract client response type from service definition.
 * Works for both HTTP and gRPC service definitions:
 * - HTTP: Extracts `body` from `S[K]["responses"][status]["body"]`
 * - gRPC: Extracts `S[K]["response"]` directly
 * - Fallback: `S[K]` if no "response" or "responses" property
 *
 * @template S - Service definition type
 * @template K - Operation/method key
 */
export type ExtractClientResponse<S, K extends keyof S> = S[K] extends {
	responses: infer R;
}
	? R extends Record<number, { body?: infer B }>
		? B
		: R
	: S[K] extends { response: infer R }
		? R
		: S[K];
