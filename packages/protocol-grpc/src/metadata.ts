/**
 * gRPC Metadata Utilities
 *
 * Utilities for handling gRPC metadata extraction and creation.
 */

import * as grpc from "@grpc/grpc-js";

/**
 * Extract gRPC metadata from call metadata object to plain record
 */
export function extractGrpcMetadata(
	callMetadata: grpc.Metadata,
): Record<string, string> {
	const result: Record<string, string> = {};
	const metadataMap = callMetadata.getMap();
	for (const [key, value] of Object.entries(metadataMap)) {
		if (typeof value === "string") {
			result[key] = value;
		} else if (Buffer.isBuffer(value)) {
			result[key] = value.toString("utf-8");
		}
	}
	return result;
}

/**
 * Create gRPC Metadata object from plain record
 */
export function createGrpcMetadata(
	metadata?: Record<string, string>,
): grpc.Metadata {
	const grpcMetadata = new grpc.Metadata();
	if (metadata) {
		for (const [key, value] of Object.entries(metadata)) {
			grpcMetadata.add(key, value);
		}
	}
	return grpcMetadata;
}
