/**
 * ClickHouse DataSource Integration Tests
 *
 * Tests the ClickHouseAdapter (DataSource) against a real ClickHouse container
 * using the global container setup pattern.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import { ClickHouseAdapter, type ClickHouseClient, createClickHouseAdapter } from "@testurio/adapter-clickhouse";
import { DataSource, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getClickHouseConfig, isClickHouseAvailable } from "../containers";

describe.skipIf(!isClickHouseAvailable())("ClickHouse DataSource Integration", () => {
	describe("Connection Lifecycle", () => {
		it("should connect via url and dispose via TestScenario lifecycle", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Connection via URL",
				components: [db],
			});

			let wasConnected = false;

			const tc = testCase("verify connection", (test) => {
				test.use(db).exec("ping", async (wrapper) => {
					wasConnected = await wrapper.ping();
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(wasConnected).toBe(true);
			expect(db.isStopped()).toBe(true);
		});

		it("should connect via host and port", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				host: ch.host,
				port: ch.port,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Connection via host/port",
				components: [db],
			});

			const tc = testCase("connect via host/port", (test) => {
				test
					.use(db)
					.exec(async (wrapper) => wrapper.ping())
					.assert("should be connected", (ok) => ok === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(db.isStopped()).toBe(true);
		});
	});

	describe("DDL and Insert", () => {
		it("should create table, insert rows, and drop on cleanup", async () => {
			const ch = getClickHouseConfig();
			const tableName = `test_ddl_${Date.now()}`;
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "DDL + Insert",
				components: [db],
			});

			const tc = testCase("ddl and insert", (test) => {
				const store = test.use(db);

				store.exec("create table", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${tableName} (id UInt32, name String) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store.exec("insert rows", async (wrapper) => {
					await wrapper.insert<{ id: number; name: string }>({
						table: tableName,
						values: [
							{ id: 1, name: "alice" },
							{ id: 2, name: "bob" },
						],
					});
				});

				store
					.exec("count rows", async (wrapper) => {
						const rows = await wrapper.query<{ c: string }>({
							query: `SELECT count() AS c FROM ${tableName}`,
						});
						return Number(rows[0].c);
					})
					.assert("should have 2 rows", (n) => n === 2);

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${tableName}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Query", () => {
		it("should run SELECT and parameterized queries", async () => {
			const ch = getClickHouseConfig();
			const tableName = `test_query_${Date.now()}`;
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Query",
				components: [db],
			});

			const tc = testCase("query and parameterized query", (test) => {
				const store = test.use(db);

				store.exec("create table", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${tableName} (id UInt32, label String) ENGINE = MergeTree() ORDER BY id`,
					});
					await wrapper.insert<{ id: number; label: string }>({
						table: tableName,
						values: [
							{ id: 1, label: "one" },
							{ id: 2, label: "two" },
							{ id: 3, label: "three" },
						],
					});
				});

				store
					.exec("select count", async (wrapper) => {
						const rows = await wrapper.query<{ c: string }>({
							query: `SELECT count() AS c FROM ${tableName}`,
						});
						return Number(rows[0].c);
					})
					.assert("should be 3", (n) => n === 3);

				store
					.exec("parameterized select", async (wrapper) => {
						const rows = await wrapper.query<{ id: number; label: string }>({
							query: `SELECT id, label FROM ${tableName} WHERE id = {id:UInt32}`,
							query_params: { id: 2 },
						});
						return rows;
					})
					.assert("should return one row", (rows) => rows.length === 1)
					.assert("row should match", (rows) => rows[0]?.label === "two");

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${tableName}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Data Types", () => {
		it("should roundtrip common ClickHouse data types", async () => {
			const ch = getClickHouseConfig();
			const tableName = `test_types_${Date.now()}`;
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Data Types",
				components: [db],
			});

			interface TypeRow {
				id: number;
				s: string;
				n: number;
				f: number;
				b: boolean;
				dt: string;
				arr: string[];
				nul: string | null;
			}

			const tc = testCase("roundtrip data types", (test) => {
				const store = test.use(db);

				store.exec("create table", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${tableName} (
							id UInt32,
							s String,
							n UInt32,
							f Float64,
							b Bool,
							dt DateTime,
							arr Array(String),
							nul Nullable(String)
						) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store.exec("insert row", async (wrapper) => {
					await wrapper.insert<TypeRow>({
						table: tableName,
						values: [
							{
								id: 1,
								s: "hello",
								n: 42,
								f: 3.14,
								b: true,
								dt: "2025-01-15 12:34:56",
								arr: ["a", "b", "c"],
								nul: null,
							},
						],
					});
				});

				store
					.exec("read row", async (wrapper) => {
						const rows = await wrapper.query<TypeRow>({
							query: `SELECT id, s, n, f, b, toString(dt) AS dt, arr, nul FROM ${tableName} WHERE id = 1`,
						});
						return rows[0];
					})
					.assert("string preserved", (row) => row?.s === "hello")
					.assert("uint preserved", (row) => Number(row?.n) === 42)
					.assert("float preserved", (row) => Math.abs(Number(row?.f) - 3.14) < 0.001)
					.assert("bool preserved", (row) => row?.b === true)
					.assert("datetime preserved", (row) => row?.dt === "2025-01-15 12:34:56")
					.assert("array preserved", (row) => Array.isArray(row?.arr) && row.arr.length === 3 && row.arr[1] === "b")
					.assert("nullable preserved", (row) => row?.nul === null);

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${tableName}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Aggregations", () => {
		it("should perform GROUP BY aggregation", async () => {
			const ch = getClickHouseConfig();
			const tableName = `test_agg_${Date.now()}`;
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Aggregation",
				components: [db],
			});

			interface AggRow {
				category: string;
				total: string;
			}

			const tc = testCase("group by sum", (test) => {
				const store = test.use(db);

				store.exec("create table", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${tableName} (category String, price Float64) ENGINE = MergeTree() ORDER BY category`,
					});
					await wrapper.insert<{ category: string; price: number }>({
						table: tableName,
						values: [
							{ category: "electronics", price: 100 },
							{ category: "electronics", price: 200 },
							{ category: "electronics", price: 150 },
							{ category: "clothing", price: 50 },
							{ category: "clothing", price: 75 },
						],
					});
				});

				store
					.exec("aggregate by category", async (wrapper) => {
						const rows = await wrapper.query<AggRow>({
							query: `SELECT category, sum(price) AS total FROM ${tableName} GROUP BY category ORDER BY category`,
						});
						return rows;
					})
					.assert("two groups", (rows) => rows.length === 2)
					.assert("clothing total = 125", (rows) => {
						const clothing = rows.find((r) => r.category === "clothing");
						return Number(clothing?.total) === 125;
					})
					.assert("electronics total = 450", (rows) => {
						const electronics = rows.find((r) => r.category === "electronics");
						return Number(electronics?.total) === 450;
					});

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${tableName}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Error Handling", () => {
		it("should fail the scenario on a bad SQL statement", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Bad SQL",
				components: [db],
			});

			const tc = testCase("bad SQL", (test) => {
				test.use(db).exec("invalid", async (wrapper) => {
					await wrapper.command({ query: "SELECT_BAD_KEYWORD_FROM_NOWHERE" });
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeTruthy();
		});
	});

	describe("Wrapper", () => {
		it("raw() should return the underlying @clickhouse/client instance with expected methods", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Raw access",
				components: [db],
			});

			const tc = testCase("raw method access", (test) => {
				test
					.use(db)
					.exec(async (wrapper) => {
						const raw = wrapper.raw();
						return (
							typeof raw.ping === "function" &&
							typeof raw.query === "function" &&
							typeof raw.command === "function" &&
							typeof raw.insert === "function"
						);
					})
					.assert("raw exposes client methods", (ok) => ok === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("getClickHouseClient() should return the same raw client after init", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});

			await adapter.init();
			try {
				const direct = adapter.getClickHouseClient();
				const viaWrapper: ClickHouseClient = adapter.getClient().raw();
				expect(direct).toBe(viaWrapper);
				expect(adapter.isConnected()).toBe(true);
			} finally {
				await adapter.dispose();
			}
			expect(adapter.isConnected()).toBe(false);
		});
	});

	describe("Adapter Lifecycle and Events", () => {
		it("should fail init and emit error on bad connection", async () => {
			const adapter = new ClickHouseAdapter({
				host: "127.0.0.1",
				port: 1, // intentionally invalid
				username: "default",
				password: "",
				requestTimeout: 500,
			});

			const errors: Error[] = [];
			const unsubscribe = adapter.on("error", (err) => {
				errors.push(err);
			});

			await expect(adapter.init()).rejects.toBeDefined();
			expect(errors.length).toBeGreaterThan(0);
			expect(adapter.isConnected()).toBe(false);
			expect(() => adapter.getClient()).toThrow(/not connected/);
			expect(() => adapter.getClickHouseClient()).toThrow(/not connected/);

			// Unsubscribe should not throw.
			unsubscribe();

			// dispose() on a never-connected adapter is a no-op.
			await adapter.dispose();
		});

		it("should reject double init and expose factory function", async () => {
			const ch = getClickHouseConfig();
			const adapter = createClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});

			await adapter.init();
			try {
				await expect(adapter.init()).rejects.toThrow(/already initialized/);
			} finally {
				await adapter.dispose();
			}
		});

		it("should fire connected and disconnected events", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});

			let connectedFired = 0;
			let disconnectedFired = 0;
			const unsubConnected = adapter.on("connected", () => {
				connectedFired += 1;
			});
			const unsubDisconnected = adapter.on("disconnected", () => {
				disconnectedFired += 1;
			});

			await adapter.init();
			expect(adapter.isConnected()).toBe(true);

			await adapter.dispose();
			expect(adapter.isConnected()).toBe(false);

			// Calling dispose twice is a no-op (second call should not re-emit).
			await adapter.dispose();

			expect(connectedFired).toBe(1);
			expect(disconnectedFired).toBe(1);

			// Unsubscribing after the events fired should still work without errors.
			unsubConnected();
			unsubDisconnected();
		});
	});

	describe("Assertions", () => {
		it("should fail the scenario when an assertion fails", async () => {
			const ch = getClickHouseConfig();
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Failing assertion",
				components: [db],
			});

			const tc = testCase("failing assertion", (test) => {
				test
					.use(db)
					.exec(async (wrapper) => wrapper.ping())
					.assert("ping should be false (deliberate)", (ok) => ok === false);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed");
		});

		it("should support multiple chained assertions on a single exec", async () => {
			const ch = getClickHouseConfig();
			const tableName = `test_chain_${Date.now()}`;
			const adapter = new ClickHouseAdapter({
				url: ch.url,
				username: ch.username,
				password: ch.password,
				database: ch.database,
			});
			const db = new DataSource("clickhouse", { adapter });

			const scenario = new TestScenario({
				name: "Chained assertions",
				components: [db],
			});

			interface ChainRow {
				id: number;
				label: string;
				count: string;
			}

			const tc = testCase("chained assertions", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${tableName} (id UInt32, label String, count UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
					await wrapper.insert<{ id: number; label: string; count: number }>({
						table: tableName,
						values: [{ id: 1, label: "row", count: 42 }],
					});
				});

				store
					.exec(async (wrapper) => {
						const rows = await wrapper.query<ChainRow>({
							query: `SELECT id, label, count FROM ${tableName} WHERE id = 1`,
						});
						return rows[0];
					})
					.assert("should have a row", (row) => row !== undefined)
					.assert("label should match", (row) => row?.label === "row")
					.assert("count should be 42", (row) => Number(row?.count) === 42);

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${tableName}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
