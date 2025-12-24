/**
 * Component Configuration Classes
 *
 * Type-safe component configuration helpers for test scenarios.
 */

import type { Address, TlsConfig, AuthConfig } from "../types";
import type { ProtocolConfig } from "./protocols";
import type { BaseComponentConfig } from "../components/component";
import type { MockComponentConfig } from "../components/mock";
import type { ClientComponentConfig } from "../components/client";
import type { ProxyComponentConfig } from "../components/proxy";

/**
 * Base component configuration class
 */
abstract class ComponentConfigBase<T extends BaseComponentConfig> {
	abstract readonly type: "mock" | "client" | "proxy";

	constructor(protected readonly options: T) {}

	/**
	 * Get component name
	 */
	get name(): string {
		return this.options.name;
	}

	/**
	 * Get protocol configuration
	 */
	get protocol(): ProtocolConfig {
		return (this.options as unknown as { protocol: ProtocolConfig }).protocol;
	}

	/**
	 * Get TLS configuration
	 */
	get tls(): TlsConfig | undefined {
		return this.options.tls;
	}

	/**
	 * Get authentication configuration
	 */
	get auth(): AuthConfig | undefined {
		return this.options.auth;
	}

	/**
	 * Get auto-start setting
	 */
	get autoStart(): boolean | undefined {
		return this.options.autoStart;
	}

	/**
	 * Get auto-stop setting
	 */
	get autoStop(): boolean | undefined {
		return this.options.autoStop;
	}

	/**
	 * Get metadata
	 */
	get metadata(): Record<string, unknown> | undefined {
		return this.options.metadata;
	}
}

/**
 * Mock component configuration
 *
 * @example
 * ```typescript
 * new MockConfig({
 *   name: "backend",
 *   listenAddress: { host: "127.0.0.1", port: 5000 },
 *   protocol: new GrpcStream({ schema: "./proto/service.proto" }),
 * })
 * ```
 */
export class MockConfig extends ComponentConfigBase<MockComponentConfig> {
	readonly type = "mock" as const;

	get listenAddress(): Address {
		return this.options.listenAddress;
	}

	get defaultBehavior(): "error" | "handler" | undefined {
		return this.options.defaultBehavior;
	}

	get defaultHandler(): ((request: unknown) => unknown | Promise<unknown>) | undefined {
		return this.options.defaultHandler;
	}
}

/**
 * Client component configuration
 *
 * @example
 * ```typescript
 * new ClientConfig({
 *   name: "api",
 *   targetAddress: { host: "127.0.0.1", port: 5000 },
 *   protocol: new GrpcStream({
 *     schema: "./proto/service.proto",
 *     serviceName: "test.v1.TestService",
 *     methodName: "Stream",
 *   }),
 * })
 * ```
 */
export class ClientConfig extends ComponentConfigBase<ClientComponentConfig> {
	readonly type = "client" as const;

	get targetAddress(): Address {
		return this.options.targetAddress;
	}
}

/**
 * Proxy component configuration
 *
 * @example
 * ```typescript
 * new ProxyConfig({
 *   name: "gateway",
 *   listenAddress: { host: "127.0.0.1", port: 5001 },
 *   targetAddress: { host: "127.0.0.1", port: 5000 },
 *   protocol: new GrpcUnary({ schema: "./proto/service.proto" }),
 * })
 * ```
 */
export class ProxyConfig extends ComponentConfigBase<ProxyComponentConfig> {
	readonly type = "proxy" as const;

	get listenAddress(): Address {
		return this.options.listenAddress;
	}

	get targetAddress(): Address {
		return this.options.targetAddress;
	}
}

/**
 * Component configuration type union
 */
export type ComponentConfig = MockConfig | ClientConfig | ProxyConfig;
