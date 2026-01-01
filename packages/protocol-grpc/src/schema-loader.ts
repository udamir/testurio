/**
 * gRPC Schema Loader
 *
 * Utilities for loading and managing Protobuf schemas.
 */

import * as path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { SchemaDefinition } from "testurio";

/**
 * Loaded gRPC package definition
 */
export interface LoadedSchema {
	packageDefinition: protoLoader.PackageDefinition;
	grpcObject: grpc.GrpcObject;
	services: Map<string, grpc.ServiceDefinition>;
}

/**
 * Load Protobuf schema from .proto files using @grpc/proto-loader
 */
export async function loadGrpcSchema(
	schemaPath: string | string[],
): Promise<LoadedSchema> {
	const inputPaths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
	const paths = inputPaths.map((p) => path.resolve(p));

	// Automatically derive include directories from proto file paths
	const derivedIncludeDirs = new Set<string>();

	for (const protoPath of paths) {
		const protoDir = path.dirname(protoPath);
		derivedIncludeDirs.add(protoDir);

		const parentDir = path.dirname(protoDir);
		if (parentDir && parentDir !== ".") {
			derivedIncludeDirs.add(parentDir);
		}
	}

	const packageDefinition = await protoLoader.load(paths, {
		keepCase: true,
		longs: String,
		enums: String,
		defaults: true,
		oneofs: true,
		includeDirs: Array.from(derivedIncludeDirs),
	});

	const grpcObject = grpc.loadPackageDefinition(packageDefinition);

	const services = new Map<string, grpc.ServiceDefinition>();
	extractServices(grpcObject, services);

	return { packageDefinition, grpcObject, services };
}

/**
 * Extract services from gRPC object recursively
 */
export function extractServices(
	obj: grpc.GrpcObject,
	services: Map<string, grpc.ServiceDefinition>,
	prefix = "",
): void {
	for (const [key, value] of Object.entries(obj)) {
		const fullName = prefix ? `${prefix}.${key}` : key;

		if (typeof value === "function" && "service" in value) {
			const serviceConstructor = value as grpc.ServiceClientConstructor;
			services.set(fullName, serviceConstructor.service);
			services.set(key, serviceConstructor.service);
		} else if (typeof value === "object" && value !== null) {
			extractServices(value as grpc.GrpcObject, services, fullName);
		}
	}
}

/**
 * Get service client constructor by name from loaded schema
 */
export function getServiceClient(
	schema: LoadedSchema,
	serviceName: string,
): grpc.ServiceClientConstructor | undefined {
	const parts = serviceName.split(".");
	let current: unknown = schema.grpcObject;

	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}

	if (typeof current === "function" && "service" in current) {
		return current as grpc.ServiceClientConstructor;
	}

	return undefined;
}

/**
 * Convert LoadedSchema to SchemaDefinition for protocol interface
 */
export function toSchemaDefinition(schema: LoadedSchema): SchemaDefinition {
	return {
		type: "protobuf",
		content: {
			packageDefinition: schema.packageDefinition,
			grpcObject: schema.grpcObject,
			services: Array.from(schema.services.keys()),
		},
		validate: true,
	};
}
