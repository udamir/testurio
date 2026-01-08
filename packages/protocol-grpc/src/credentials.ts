/**
 * gRPC Credentials Utilities
 *
 * Shared credential creation functions for gRPC server and client.
 * Eliminates duplication across adapters and base protocol.
 */

import * as grpc from "@grpc/grpc-js";

/**
 * TLS configuration for gRPC connections
 */
export interface TlsConfig {
	/** CA certificate (PEM format) */
	readonly ca?: string;
	/** Client/Server certificate (PEM format) */
	readonly cert?: string;
	/** Private key (PEM format) */
	readonly key?: string;
}

/**
 * Create server credentials from TLS config
 *
 * @param tls - TLS configuration (optional)
 * @returns gRPC server credentials
 *
 * @example
 * ```typescript
 * // Insecure (no TLS)
 * const creds = createServerCredentials();
 *
 * // With TLS
 * const creds = createServerCredentials({
 *   ca: fs.readFileSync('ca.pem', 'utf8'),
 *   cert: fs.readFileSync('server.pem', 'utf8'),
 *   key: fs.readFileSync('server-key.pem', 'utf8'),
 * });
 * ```
 */
export function createServerCredentials(tls?: TlsConfig): grpc.ServerCredentials {
	if (!tls) {
		return grpc.ServerCredentials.createInsecure();
	}

	return grpc.ServerCredentials.createSsl(
		tls.ca ? Buffer.from(tls.ca) : null,
		tls.cert && tls.key
			? [
					{
						cert_chain: Buffer.from(tls.cert),
						private_key: Buffer.from(tls.key),
					},
				]
			: []
	);
}

/**
 * Create client credentials from TLS config
 *
 * @param tls - TLS configuration (optional)
 * @returns gRPC channel credentials
 *
 * @example
 * ```typescript
 * // Insecure (no TLS)
 * const creds = createClientCredentials();
 *
 * // With TLS (server verification only)
 * const creds = createClientCredentials({
 *   ca: fs.readFileSync('ca.pem', 'utf8'),
 * });
 *
 * // With mutual TLS
 * const creds = createClientCredentials({
 *   ca: fs.readFileSync('ca.pem', 'utf8'),
 *   cert: fs.readFileSync('client.pem', 'utf8'),
 *   key: fs.readFileSync('client-key.pem', 'utf8'),
 * });
 * ```
 */
export function createClientCredentials(tls?: TlsConfig): grpc.ChannelCredentials {
	if (!tls) {
		return grpc.credentials.createInsecure();
	}

	return grpc.credentials.createSsl(
		tls.ca ? Buffer.from(tls.ca) : undefined,
		tls.key ? Buffer.from(tls.key) : undefined,
		tls.cert ? Buffer.from(tls.cert) : undefined
	);
}
