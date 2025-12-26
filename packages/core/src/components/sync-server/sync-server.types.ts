/**
 * Sync Server Types
 *
 * Type extraction helpers for sync server step builders.
 */

/**
 * Extract server request type from service definition.
 * For servers, we want the full request object (not just body):
 * - HTTP: Full request with body, query, params, headers
 * - gRPC: Request payload directly
 *
 * @template S - Service definition type
 * @template K - Operation/method key
 */
export type ExtractServerRequest<S, K extends keyof S> = S[K] extends {
	request: infer R;
}
	? R
	: S[K];

/**
 * Extract server response type from service definition.
 * For servers generating responses:
 * - HTTP: Returns `{ status, body }` structure for full control
 * - gRPC: Returns response payload directly
 *
 * @template S - Service definition type
 * @template K - Operation/method key
 */
export type ExtractServerResponse<S, K extends keyof S> = S[K] extends {
	responses: infer R;
}
	? R extends Record<number, { body?: infer B }>
		? { status: keyof R & number; body: B }
		: R
	: S[K] extends { response: infer R }
		? R
		: S[K];
