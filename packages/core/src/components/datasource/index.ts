/**
 * DataSource Component
 *
 * Provides direct SDK access to data stores (Redis, PostgreSQL, MongoDB, etc.)
 * via pluggable adapters.
 */

export { DataSource } from "./datasource.component";
export { DataSourceHookBuilder } from "./datasource.hook-builder";
export { DataSourceStepBuilder } from "./datasource.step-builder";
export type {
	ClientOf,
	ConfigOf,
	DataSourceAdapter,
	DataSourceAdapterEvents,
	DataSourceOptions,
	ExecOptions,
	Unsubscribe,
} from "./datasource.types";
