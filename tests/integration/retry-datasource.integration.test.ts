/**
 * Retry — DataSource (ClickHouse) Integration Tests
 *
 * Covers cases D-1..D-9 from design §4e + Round 3 addition (task 024).
 *
 * Uses real ClickHouse via testcontainers. Skipped automatically when Docker
 * is not available — see `containers/env-config.ts`.
 *
 * Each test creates a unique table via `Date.now() + Math.random()` to isolate
 * cases. The "insert-after-delay" pattern uses `setTimeout` *inside* an exec
 * callback (which is imperative SDK access by definition) rather than inside
 * the testCase body, preserving the "declarative-only" rule for testCase code.
 *
 * D-9 was previously two cases (per-attempt timeout × overall retry budget;
 * per-attempt timeout fires once then succeeds). Round 3 of task 024 redefines
 * `.timeout(ms)` as a step-level deadline, so the previous D-9 and D-10 are
 * deleted and replaced with a single new D-9 that verifies step-level
 * termination of the retry loop.
 */

import { ClickHouseAdapter } from "@testurio/adapter-clickhouse";
import { DataSource, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getClickHouseConfig, isClickHouseAvailable } from "../containers";

function uniqueTable(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function newDataSource(): DataSource<ClickHouseAdapter> {
	const ch = getClickHouseConfig();
	const adapter = new ClickHouseAdapter({
		url: ch.url,
		username: ch.username,
		password: ch.password,
		database: ch.database,
	});
	return new DataSource("clickhouse", { adapter });
}

interface CountRow {
	c: string;
}

describe.skipIf(!isClickHouseAvailable())("Retry — DataSource (ClickHouse)", () => {
	// ==========================================================================
	// Defaults
	// ==========================================================================

	describe("Defaults", () => {
		it("D-1: uses defaults when `.retry(pred)` is called with no second arg", async () => {
			const table = uniqueTable("retry_d1");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-1", components: [db] });

			const tc = testCase("D-1", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${table} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				// Schedule an async insert that runs ~1500ms after this step starts.
				store.exec("schedule insert", async (wrapper) => {
					setTimeout(() => {
						void wrapper.insert<{ id: number }>({ table, values: [{ id: 1 }] }).catch(() => {});
					}, 1500);
				});

				store
					.exec("poll for row", async (wrapper) => {
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${table}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0);

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${table}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		}, 15_000);

		it("D-2: fails after ~5000 ms when row never appears", async () => {
			const table = uniqueTable("retry_d2");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-2", components: [db] });

			const tc = testCase("D-2", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${table} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store
					.exec("poll forever", async (wrapper) => {
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${table}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0);

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${table}` });
				});
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(false);
			expect(elapsed).toBeGreaterThanOrEqual(5000);
			const errMsg = result.testCases[0].steps.find((s) => !s.passed)?.error;
			expect(errMsg).toContain("Retry exhausted");
		}, 15_000);
	});

	// ==========================================================================
	// Call forms
	// ==========================================================================

	describe("Call forms", () => {
		it("D-3: short form `.retry(pred, timeoutMs)`", async () => {
			const table = uniqueTable("retry_d3");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-3", components: [db] });

			const tc = testCase("D-3", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${table} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store.exec("schedule insert", async (wrapper) => {
					setTimeout(() => {
						void wrapper.insert<{ id: number }>({ table, values: [{ id: 1 }] }).catch(() => {});
					}, 500);
				});

				store
					.exec("poll for row", async (wrapper) => {
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${table}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0, 3000);

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${table}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		}, 10_000);

		it("D-4: options form `.retry(pred, { timeout, interval })`", async () => {
			const table = uniqueTable("retry_d4");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-4", components: [db] });

			const tc = testCase("D-4", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${table} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store.exec("schedule insert", async (wrapper) => {
					setTimeout(() => {
						void wrapper.insert<{ id: number }>({ table, values: [{ id: 1 }] }).catch(() => {});
					}, 800);
				});

				store
					.exec("poll for row", async (wrapper) => {
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${table}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0, { timeout: 3000, interval: 250 });

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${table}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		}, 10_000);
	});

	// ==========================================================================
	// Convergence
	// ==========================================================================

	describe("Convergence", () => {
		it("D-5: exec callback re-runs every attempt", async () => {
			const table = uniqueTable("retry_d5");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-5", components: [db] });
			let execCalls = 0;

			const tc = testCase("D-5", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${table} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store.exec("schedule insert", async (wrapper) => {
					setTimeout(() => {
						void wrapper.insert<{ id: number }>({ table, values: [{ id: 1 }] }).catch(() => {});
					}, 600);
				});

				store
					.exec("poll", async (wrapper) => {
						execCalls += 1;
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${table}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0, { timeout: 3000, interval: 100 });

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${table}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(execCalls).toBeGreaterThan(1);
		}, 10_000);
	});

	// ==========================================================================
	// Terminal-result handler
	// ==========================================================================

	describe("Terminal result", () => {
		it("D-6: `.assert()` runs once on terminal result", async () => {
			const table = uniqueTable("retry_d6");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-6", components: [db] });
			let assertCalls = 0;

			const tc = testCase("D-6", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${table} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store.exec("schedule insert", async (wrapper) => {
					setTimeout(() => {
						void wrapper.insert<{ id: number }>({ table, values: [{ id: 1 }] }).catch(() => {});
					}, 400);
				});

				store
					.exec("poll", async (wrapper) => {
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${table}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0, { timeout: 5000, interval: 100 })
					.assert("row exists", (n) => {
						assertCalls += 1;
						return n > 0;
					});

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE ${table}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(assertCalls).toBe(1);
		}, 10_000);
	});

	// ==========================================================================
	// Error policy
	// ==========================================================================

	describe("Error policy", () => {
		it("D-7: swallows query errors and retries", async () => {
			const lateTable = uniqueTable("retry_d7_late");
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-7", components: [db] });

			const tc = testCase("D-7", (test) => {
				const store = test.use(db);

				// Schedule the table creation ~800ms after polling starts —
				// until then, `SELECT count() FROM <non-existent>` throws.
				store.exec("schedule create", async (wrapper) => {
					setTimeout(() => {
						void wrapper
							.command({
								query: `CREATE TABLE ${lateTable} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
							})
							.then(() => wrapper.insert<{ id: number }>({ table: lateTable, values: [{ id: 1 }] }))
							.catch(() => {});
					}, 800);
				});

				store
					.exec("poll missing table", async (wrapper) => {
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${lateTable}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0, { timeout: 5000, interval: 200 });

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE IF EXISTS ${lateTable}` });
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		}, 15_000);

		it("D-8: fails fast with retryOnError: false", async () => {
			const ghost = `retry_d8_ghost_${Date.now()}`;
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-8", components: [db] });
			let execCalls = 0;

			const tc = testCase("D-8", (test) => {
				const store = test.use(db);

				store
					.exec("poll missing table", async (wrapper) => {
						execCalls += 1;
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${ghost}` });
						return Number(rows[0].c);
					})
					.retry((n) => n === 0, { timeout: 5000, retryOnError: false });
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			const errMsg = result.testCases[0].steps.find((s) => !s.passed)?.error;
			// Not a RetryTimeoutError — the underlying ClickHouse error is rethrown.
			expect(errMsg).not.toContain("Retry exhausted");
			expect(execCalls).toBe(1);
		}, 10_000);
	});

	// ==========================================================================
	// Step-level timeout
	// ==========================================================================

	describe("Step-level timeout", () => {
		it("D-9: `.timeout(ms)` is a step-level deadline that terminates the retry loop", async () => {
			const ghost = `retry_d9_ghost_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
			const db = newDataSource();
			const scenario = new TestScenario({ name: "D-9", components: [db] });
			let execCalls = 0;

			const tc = testCase("D-9", (test) => {
				const store = test.use(db);

				store.exec("setup", async (wrapper) => {
					await wrapper.command({
						query: `CREATE TABLE ${ghost} (id UInt32) ENGINE = MergeTree() ORDER BY id`,
					});
				});

				store
					.exec("poll empty", async (wrapper) => {
						execCalls += 1;
						const rows = await wrapper.query<CountRow>({ query: `SELECT count() AS c FROM ${ghost}` });
						return Number(rows[0].c);
					})
					.timeout(1500)
					.retry((n) => n === 0, { interval: 200 });

				store.exec("cleanup", async (wrapper) => {
					await wrapper.command({ query: `DROP TABLE IF EXISTS ${ghost}` });
				});
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(false);
			// Step-level deadline fired — TimeoutError, not RetryTimeoutError.
			const errMsg = result.testCases[0].steps.find((s) => !s.passed)?.error;
			expect(errMsg).toContain("timeout after 1500ms");
			expect(errMsg).not.toContain("Retry exhausted");
			// The loop was running before the deadline killed it.
			expect(execCalls).toBeGreaterThanOrEqual(5);
			// Timeout fires close to 1500ms, not at the retry-default 5000ms.
			expect(elapsed).toBeLessThan(3000);
		}, 10_000);
	});
});
