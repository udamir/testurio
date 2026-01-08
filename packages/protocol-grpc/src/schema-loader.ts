/**
 * gRPC Schema Loader
 *
 * Utilities for loading and managing Protobuf schemas.
 */

import * as path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { SchemaDefinition } from "testurio";
import { isGrpcNamespace, isServiceClient } from "./types";

/**
 * Loaded gRPC package definition
 */
export interface LoadedSchema {
	packageDefinition: protoLoader.PackageDefinition;
	grpcObject: grpc.GrpcObject;
	services: Map<string, grpc.ServiceDefinition>;
	/** Service client constructors mapped by name */
	serviceClients: Map<string, grpc.ServiceClientConstructor>;
}

/**
 * Load Protobuf schema from .proto files using @grpc/proto-loader
 */
export async function loadGrpcSchema(schemaPath: string | string[]): Promise<LoadedSchema> {
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
	const serviceClients = new Map<string, grpc.ServiceClientConstructor>();
	extractServices(grpcObject, services, serviceClients);

	return { packageDefinition, grpcObject, services, serviceClients };
}

/**
 * Extract services from gRPC object recursively
 *
 * @param obj - gRPC object to extract from
 * @param services - Map to populate with service definitions
 * @param serviceClients - Map to populate with service client constructors
 * @param prefix - Current namespace prefix
 */
export function extractServices(
	obj: grpc.GrpcObject,
	services: Map<string, grpc.ServiceDefinition>,
	serviceClients: Map<string, grpc.ServiceClientConstructor>,
	prefix = ""
): void {
	for (const [key, value] of Object.entries(obj)) {
		const fullName = prefix ? `${prefix}.${key}` : key;

		if (isServiceClient(value)) {
			// Register by both short name and full package path
			services.set(fullName, value.service);
			services.set(key, value.service);
			serviceClients.set(fullName, value);
			serviceClients.set(key, value);
		} else if (isGrpcNamespace(value)) {
			// Recurse into namespace
			extractServices(value, services, serviceClients, fullName);
		}
	}
}

/**
 * Get service client constructor by name from loaded schema
 *
 * First checks the serviceClients map for direct lookup,
 * then falls back to navigating the gRPC object tree.
 *
 * @param schema - Loaded schema
 * @param serviceName - Service name (can be simple or dot-separated path)
 * @returns Service client constructor or undefined if not found
 */
export function getServiceClient(schema: LoadedSchema, serviceName: string): grpc.ServiceClientConstructor | undefined {
	// First try direct lookup from serviceClients map
	const cached = schema.serviceClients.get(serviceName);
	if (cached) {
		return cached;
	}

	// Fall back to navigating the gRPC object tree
	const parts = serviceName.split(".");
	let current: unknown = schema.grpcObject;

	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}

	if (isServiceClient(current)) {
		return current;
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
