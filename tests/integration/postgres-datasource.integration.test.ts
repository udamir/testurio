/**
 * PostgreSQL DataSource Integration Tests
 *
 * Tests the PostgresAdapter (DataSource) against a real PostgreSQL container
 * using testcontainers.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import { PostgresAdapter } from "@testurio/adapter-pg";
import { DataSource, TestScenario, testCase } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";
import { getPostgresConfig, isPostgresAvailable } from "../containers";

describe.skipIf(!isPostgresAvailable())("PostgreSQL DataSource Integration", () => {
	describe("Connection Lifecycle", () => {
		it("should connect and disconnect via TestScenario lifecycle", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Connection lifecycle test",
				components: [db],
			});

			let wasConnected = false;

			const tc = testCase("verify connection", (test) => {
				test.use(db).exec("check connection", async (pool) => {
					wasConnected = true;
					const result = await pool.query("SELECT 1 as value");
					expect(result.rows[0].value).toBe(1);
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(wasConnected).toBe(true);
			expect(db.isStopped()).toBe(true);
		});

		it("should connect using connection string", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				connectionString: postgres.connectionString,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Connection string test",
				components: [db],
			});

			const tc = testCase("connect via URI", (test) => {
				test
					.use(db)
					.exec(async (pool) => {
						const result = await pool.query("SELECT current_database() as db");
						return result.rows[0].db;
					})
					.assert("should be test database", (result) => result === postgres.database);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Schema Setup", () => {
		it("should create and drop tables", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Schema operations",
				components: [db],
			});

			const tc = testCase("create and drop table", (test) => {
				const store = test.use(db);

				store.exec("create table", async (pool) => {
					await pool.query(`
						CREATE TABLE IF NOT EXISTS test_users (
							id SERIAL PRIMARY KEY,
							name VARCHAR(100) NOT NULL,
							email VARCHAR(255) UNIQUE NOT NULL,
							created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
						)
					`);
				});

				store
					.exec("verify table exists", async (pool) => {
						const result = await pool.query(`
						SELECT EXISTS (
							SELECT FROM information_schema.tables
							WHERE table_name = 'test_users'
						)
					`);
						return result.rows[0].exists;
					})
					.assert("table should exist", (exists) => exists === true);

				store.exec("drop table", async (pool) => {
					await pool.query("DROP TABLE test_users");
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("CRUD Operations", () => {
		beforeEach(async () => {
			// Setup: Create test table before each test
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			await adapter.init();
			const pool = adapter.getClient();
			await pool.query(`
				DROP TABLE IF EXISTS users;
				CREATE TABLE users (
					id SERIAL PRIMARY KEY,
					name VARCHAR(100) NOT NULL,
					email VARCHAR(255) UNIQUE NOT NULL,
					age INTEGER,
					active BOOLEAN DEFAULT true,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				)
			`);
			await adapter.dispose();
		});

		it("should insert and select rows", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Insert and select",
				components: [db],
			});

			const tc = testCase("insert and retrieve user", (test) => {
				const store = test.use(db);

				store
					.exec("insert user", async (pool) => {
						const result = await pool.query("INSERT INTO users (name, email, age) VALUES ($1, $2, $3) RETURNING id", [
							"John Doe",
							"john@example.com",
							30,
						]);
						return result.rows[0].id;
					})
					.assert("should return id", (id) => typeof id === "number" && id > 0);

				store
					.exec("select user", async (pool) => {
						const result = await pool.query("SELECT * FROM users WHERE email = $1", ["john@example.com"]);
						return result.rows[0];
					})
					.assert("user should match", (user) => {
						return user.name === "John Doe" && user.age === 30;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should update rows", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Update operations",
				components: [db],
			});

			const tc = testCase("update user", (test) => {
				const store = test.use(db);

				store.exec("insert user", async (pool) => {
					await pool.query("INSERT INTO users (name, email, age) VALUES ($1, $2, $3)", [
						"Jane Doe",
						"jane@example.com",
						25,
					]);
				});

				store
					.exec("update age", async (pool) => {
						const result = await pool.query("UPDATE users SET age = $1 WHERE email = $2 RETURNING age", [
							26,
							"jane@example.com",
						]);
						return result.rows[0].age;
					})
					.assert("age should be updated", (age) => age === 26);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should delete rows", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Delete operations",
				components: [db],
			});

			const tc = testCase("delete user", (test) => {
				const store = test.use(db);

				store.exec("insert user", async (pool) => {
					await pool.query("INSERT INTO users (name, email) VALUES ($1, $2)", ["Delete Me", "delete@example.com"]);
				});

				store
					.exec("verify exists", async (pool) => {
						const result = await pool.query("SELECT COUNT(*) FROM users");
						return parseInt(result.rows[0].count);
					})
					.assert("should have 1 user", (count) => count === 1);

				store
					.exec("delete user", async (pool) => {
						const result = await pool.query("DELETE FROM users WHERE email = $1 RETURNING id", ["delete@example.com"]);
						return result.rowCount;
					})
					.assert("should delete 1 row", (count) => count === 1);

				store
					.exec("verify deleted", async (pool) => {
						const result = await pool.query("SELECT COUNT(*) FROM users");
						return parseInt(result.rows[0].count);
					})
					.assert("should have 0 users", (count) => count === 0);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle parameterized queries", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Parameterized queries",
				components: [db],
			});

			const tc = testCase("safe parameterized query", (test) => {
				const store = test.use(db);

				store.exec("insert multiple users", async (pool) => {
					await pool.query("INSERT INTO users (name, email, age) VALUES ($1, $2, $3), ($4, $5, $6)", [
						"User1",
						"user1@test.com",
						20,
						"User2",
						"user2@test.com",
						30,
					]);
				});

				store
					.exec("query with parameters", async (pool) => {
						const result = await pool.query("SELECT * FROM users WHERE age >= $1 AND active = $2 ORDER BY age", [
							25,
							true,
						]);
						return result.rows;
					})
					.assert("should return filtered users", (rows) => {
						return rows.length === 1 && rows[0].name === "User2";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Transactions", () => {
		beforeEach(async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			await adapter.init();
			const pool = adapter.getClient();
			await pool.query(`
				DROP TABLE IF EXISTS accounts;
				CREATE TABLE accounts (
					id SERIAL PRIMARY KEY,
					name VARCHAR(100) NOT NULL,
					balance DECIMAL(10, 2) NOT NULL DEFAULT 0
				)
			`);
			await adapter.dispose();
		});

		it("should commit transaction successfully", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Transaction commit",
				components: [db],
			});

			const tc = testCase("commit transaction", (test) => {
				const store = test.use(db);

				store.exec("execute transaction", async (pool) => {
					const client = await pool.connect();
					try {
						await client.query("BEGIN");
						await client.query("INSERT INTO accounts (name, balance) VALUES ($1, $2)", ["Alice", 1000]);
						await client.query("INSERT INTO accounts (name, balance) VALUES ($1, $2)", ["Bob", 500]);
						await client.query("COMMIT");
					} catch (e) {
						await client.query("ROLLBACK");
						throw e;
					} finally {
						client.release();
					}
				});

				store
					.exec("verify accounts", async (pool) => {
						const result = await pool.query("SELECT SUM(balance) as total FROM accounts");
						return parseFloat(result.rows[0].total);
					})
					.assert("total should be 1500", (total) => total === 1500);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should rollback transaction on error", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Transaction rollback",
				components: [db],
			});

			const tc = testCase("rollback on error", (test) => {
				const store = test.use(db);

				store.exec("attempt failed transaction", async (pool) => {
					const client = await pool.connect();
					try {
						await client.query("BEGIN");
						await client.query("INSERT INTO accounts (name, balance) VALUES ($1, $2)", ["Charlie", 1000]);
						// Force error with invalid query
						await client.query("INSERT INTO nonexistent_table VALUES (1)");
						await client.query("COMMIT");
					} catch {
						await client.query("ROLLBACK");
						// Expected error, don't rethrow
					} finally {
						client.release();
					}
				});

				store
					.exec("verify no accounts created", async (pool) => {
						const result = await pool.query("SELECT COUNT(*) FROM accounts");
						return parseInt(result.rows[0].count);
					})
					.assert("should have 0 accounts", (count) => count === 0);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle transfer between accounts", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Account transfer",
				components: [db],
			});

			const tc = testCase("atomic transfer", (test) => {
				const store = test.use(db);

				store.exec("setup accounts", async (pool) => {
					await pool.query("INSERT INTO accounts (name, balance) VALUES ($1, $2), ($3, $4)", [
						"Sender",
						1000,
						"Receiver",
						500,
					]);
				});

				store.exec("transfer funds", async (pool) => {
					const client = await pool.connect();
					try {
						await client.query("BEGIN");
						await client.query("UPDATE accounts SET balance = balance - $1 WHERE name = $2", [200, "Sender"]);
						await client.query("UPDATE accounts SET balance = balance + $1 WHERE name = $2", [200, "Receiver"]);
						await client.query("COMMIT");
					} catch (e) {
						await client.query("ROLLBACK");
						throw e;
					} finally {
						client.release();
					}
				});

				store
					.exec("verify balances", async (pool) => {
						const result = await pool.query("SELECT name, balance FROM accounts ORDER BY name");
						return result.rows;
					})
					.assert("balances should be correct", (rows) => {
						const receiver = rows.find((r: { name: string }) => r.name === "Receiver");
						const sender = rows.find((r: { name: string }) => r.name === "Sender");
						return parseFloat(receiver.balance) === 700 && parseFloat(sender.balance) === 800;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Data Types", () => {
		it("should handle various PostgreSQL data types", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Data types",
				components: [db],
			});

			const tc = testCase("various data types", (test) => {
				const store = test.use(db);

				store.exec("create types table", async (pool) => {
					await pool.query(`
						CREATE TABLE IF NOT EXISTS data_types (
							id SERIAL PRIMARY KEY,
							text_col TEXT,
							int_col INTEGER,
							bigint_col BIGINT,
							float_col REAL,
							double_col DOUBLE PRECISION,
							bool_col BOOLEAN,
							json_col JSONB,
							array_col INTEGER[],
							timestamp_col TIMESTAMP WITH TIME ZONE,
							uuid_col UUID
						)
					`);
				});

				store.exec("insert various types", async (pool) => {
					await pool.query(
						`
						INSERT INTO data_types (
							text_col, int_col, bigint_col, float_col, double_col,
							bool_col, json_col, array_col, timestamp_col, uuid_col
						) VALUES (
							$1, $2, $3, $4, $5, $6, $7, $8, $9, $10
						)
					`,
						[
							"hello world",
							42,
							"9007199254740993",
							3.14,
							2.718281828459045,
							true,
							JSON.stringify({ key: "value", nested: { a: 1 } }),
							[1, 2, 3, 4, 5],
							new Date().toISOString(),
							"550e8400-e29b-41d4-a716-446655440000",
						]
					);
				});

				store
					.exec("verify types", async (pool) => {
						const result = await pool.query("SELECT * FROM data_types WHERE id = 1");
						return result.rows[0];
					})
					.assert("types should be correct", (row) => {
						return (
							row.text_col === "hello world" &&
							row.int_col === 42 &&
							row.bool_col === true &&
							row.json_col.key === "value" &&
							Array.isArray(row.array_col)
						);
					});

				store.exec("cleanup", async (pool) => {
					await pool.query("DROP TABLE data_types");
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle NULL values", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "NULL handling",
				components: [db],
			});

			const tc = testCase("null values", (test) => {
				const store = test.use(db);

				store.exec("create table", async (pool) => {
					await pool.query(`
						CREATE TABLE IF NOT EXISTS nullable_test (
							id SERIAL PRIMARY KEY,
							required_col TEXT NOT NULL,
							optional_col TEXT
						)
					`);
				});

				store.exec("insert with null", async (pool) => {
					await pool.query("INSERT INTO nullable_test (required_col, optional_col) VALUES ($1, $2)", [
						"required",
						null,
					]);
				});

				store
					.exec("query null", async (pool) => {
						const result = await pool.query("SELECT * FROM nullable_test WHERE optional_col IS NULL");
						return result.rows[0];
					})
					.assert("should have null column", (row) => {
						return row.optional_col === null && row.required_col === "required";
					});

				store.exec("cleanup", async (pool) => {
					await pool.query("DROP TABLE nullable_test");
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Aggregations and Joins", () => {
		it("should perform aggregation queries", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Aggregations",
				components: [db],
			});

			const tc = testCase("aggregate functions", (test) => {
				const store = test.use(db);

				store.exec("create and populate", async (pool) => {
					await pool.query(`
						CREATE TABLE IF NOT EXISTS products (
							id SERIAL PRIMARY KEY,
							name TEXT,
							category TEXT,
							price DECIMAL(10, 2)
						)
					`);
					await pool.query(`
						INSERT INTO products (name, category, price) VALUES
						('Widget A', 'widgets', 10.00),
						('Widget B', 'widgets', 15.00),
						('Gadget A', 'gadgets', 25.00),
						('Gadget B', 'gadgets', 30.00),
						('Gadget C', 'gadgets', 35.00)
					`);
				});

				store
					.exec("count by category", async (pool) => {
						const result = await pool.query(`
						SELECT category, COUNT(*) as count, AVG(price) as avg_price
						FROM products
						GROUP BY category
						ORDER BY category
					`);
						return result.rows;
					})
					.assert("aggregations correct", (rows) => {
						const gadgets = rows.find((r: { category: string }) => r.category === "gadgets");
						const widgets = rows.find((r: { category: string }) => r.category === "widgets");
						return (
							parseInt(gadgets.count) === 3 && parseInt(widgets.count) === 2 && parseFloat(gadgets.avg_price) === 30
						);
					});

				store.exec("cleanup", async (pool) => {
					await pool.query("DROP TABLE products");
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should perform JOIN queries", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "JOIN queries",
				components: [db],
			});

			const tc = testCase("join tables", (test) => {
				const store = test.use(db);

				store.exec("create tables", async (pool) => {
					await pool.query(`
						CREATE TABLE IF NOT EXISTS orders (
							id SERIAL PRIMARY KEY,
							customer_name TEXT,
							order_date DATE
						);
						CREATE TABLE IF NOT EXISTS order_items (
							id SERIAL PRIMARY KEY,
							order_id INTEGER REFERENCES orders(id),
							product_name TEXT,
							quantity INTEGER
						)
					`);
					await pool.query(`
						INSERT INTO orders (customer_name, order_date) VALUES
						('Alice', '2024-01-15'),
						('Bob', '2024-01-16')
					`);
					await pool.query(`
						INSERT INTO order_items (order_id, product_name, quantity) VALUES
						(1, 'Widget', 2),
						(1, 'Gadget', 1),
						(2, 'Widget', 5)
					`);
				});

				store
					.exec("join query", async (pool) => {
						const result = await pool.query(
							`
						SELECT o.customer_name, oi.product_name, oi.quantity
						FROM orders o
						JOIN order_items oi ON o.id = oi.order_id
						WHERE o.customer_name = $1
						ORDER BY oi.product_name
					`,
							["Alice"]
						);
						return result.rows;
					})
					.assert("join results correct", (rows) => {
						return rows.length === 2 && rows[0].product_name === "Gadget" && rows[1].product_name === "Widget";
					});

				store.exec("cleanup", async (pool) => {
					await pool.query("DROP TABLE order_items, orders");
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Error Handling", () => {
		it("should handle constraint violations", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Constraint violation",
				components: [db],
			});

			const tc = testCase("unique constraint error", (test) => {
				const store = test.use(db);

				store.exec("create table", async (pool) => {
					await pool.query(`
						CREATE TABLE IF NOT EXISTS unique_test (
							id SERIAL PRIMARY KEY,
							email TEXT UNIQUE
						)
					`);
					await pool.query("INSERT INTO unique_test (email) VALUES ($1)", ["test@example.com"]);
				});

				store.exec("violate unique constraint", async (pool) => {
					await pool.query("INSERT INTO unique_test (email) VALUES ($1)", ["test@example.com"]);
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toMatch(/unique|duplicate/i);
		});

		it("should handle syntax errors", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Syntax error",
				components: [db],
			});

			const tc = testCase("invalid SQL syntax", (test) => {
				test.use(db).exec(async (pool) => {
					await pool.query("SELEC * FORM users"); // Intentional typos
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toMatch(/syntax/i);
		});
	});

	describe("Assertions", () => {
		it("should fail test when assertion fails", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Assertion failure",
				components: [db],
			});

			const tc = testCase("failing assertion", (test) => {
				test
					.use(db)
					.exec(async (pool) => {
						const result = await pool.query("SELECT 1 as value");
						return result.rows[0].value;
					})
					.assert("value should be 2", (value) => value === 2); // Will fail
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed");
		});

		it("should support multiple chained assertions", async () => {
			const postgres = getPostgresConfig();
			const adapter = new PostgresAdapter({
				host: postgres.host,
				port: postgres.port,
				database: postgres.database,
				user: postgres.username,
				password: postgres.password,
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Chained assertions",
				components: [db],
			});

			const tc = testCase("multiple assertions", (test) => {
				test
					.use(db)
					.exec(async (pool) => {
						const result = await pool.query(`
						SELECT
							'test' as name,
							42 as count,
							true as active
					`);
						return result.rows[0];
					})
					.assert("should have name", (row) => row.name === "test")
					.assert("should have count", (row) => row.count === 42)
					.assert("should be active", (row) => row.active === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
