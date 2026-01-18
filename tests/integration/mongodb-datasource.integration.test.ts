/**
 * MongoDB DataSource Integration Tests
 *
 * Tests the MongoAdapter (DataSource) against a real MongoDB container
 * using the global container setup pattern.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import { MongoAdapter } from "@testurio/adapter-mongo";
import { DataSource, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getMongoDBConfig, isMongoDBAvailable } from "../containers";

describe.skipIf(!isMongoDBAvailable())("MongoDB DataSource Integration", () => {
	describe("Connection Lifecycle", () => {
		it("should connect and disconnect via TestScenario lifecycle", async () => {
			const mongodb = getMongoDBConfig();
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Connection lifecycle test",
				components: [db],
			});

			let wasConnected = false;

			const tc = testCase("verify connection", (test) => {
				test.use(db).exec("check connection", async (mongoDb) => {
					wasConnected = true;
					const result = await mongoDb.command({ ping: 1 });
					expect(result.ok).toBe(1);
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(wasConnected).toBe(true);
			expect(db.isStopped()).toBe(true);
		});

		it("should connect using host and port", async () => {
			const mongodb = getMongoDBConfig();
			const adapter = new MongoAdapter({
				host: mongodb.host,
				port: mongodb.port,
				database: mongodb.database,
				options: { directConnection: true },
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Host/port connection test",
				components: [db],
			});

			const tc = testCase("connect via host/port", (test) => {
				test
					.use(db)
					.exec(async (mongoDb) => {
						const result = await mongoDb.command({ ping: 1 });
						return result.ok;
					})
					.assert("should be connected", (ok) => ok === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("CRUD Operations", () => {
		const testCollection = `test_users_${Date.now()}`;

		it("should insert and find documents", async () => {
			const mongodb = getMongoDBConfig();
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Insert and find",
				components: [db],
			});

			const tc = testCase("insert and retrieve document", (test) => {
				const store = test.use(db);

				store
					.exec("insert document", async (mongoDb) => {
						const collection = mongoDb.collection(testCollection);
						const result = await collection.insertOne({
							name: "John Doe",
							email: "john@example.com",
							age: 30,
						});
						return result.insertedId;
					})
					.assert("should return insertedId", (id) => id !== null);

				store
					.exec("find document", async (mongoDb) => {
						const collection = mongoDb.collection(testCollection);
						const doc = await collection.findOne({ email: "john@example.com" });
						return doc;
					})
					.assert("document should match", (doc) => {
						return doc?.name === "John Doe" && doc?.age === 30;
					});

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(testCollection).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should update documents", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_update_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Update operations",
				components: [db],
			});

			const tc = testCase("update document", (test) => {
				const store = test.use(db);

				store.exec("insert document", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertOne({ name: "Jane Doe", age: 25 });
				});

				store
					.exec("update age", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const result = await collection.updateOne({ name: "Jane Doe" }, { $set: { age: 26 } });
						return result.modifiedCount;
					})
					.assert("should modify 1 document", (count) => count === 1);

				store
					.exec("verify update", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const doc = await collection.findOne({ name: "Jane Doe" });
						return doc?.age;
					})
					.assert("age should be updated", (age) => age === 26);

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(collectionName).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should delete documents", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_delete_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Delete operations",
				components: [db],
			});

			const tc = testCase("delete document", (test) => {
				const store = test.use(db);

				store.exec("insert document", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertOne({ name: "Delete Me" });
				});

				store
					.exec("verify exists", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const count = await collection.countDocuments();
						return count;
					})
					.assert("should have 1 document", (count) => count === 1);

				store
					.exec("delete document", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const result = await collection.deleteOne({ name: "Delete Me" });
						return result.deletedCount;
					})
					.assert("should delete 1 document", (count) => count === 1);

				store
					.exec("verify deleted", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const count = await collection.countDocuments();
						return count;
					})
					.assert("should have 0 documents", (count) => count === 0);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle bulk operations", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_bulk_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Bulk operations",
				components: [db],
			});

			const tc = testCase("bulk insert and find", (test) => {
				const store = test.use(db);

				store.exec("bulk insert", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertMany([
						{ name: "User1", age: 20 },
						{ name: "User2", age: 25 },
						{ name: "User3", age: 30 },
						{ name: "User4", age: 35 },
						{ name: "User5", age: 40 },
					]);
				});

				store
					.exec("count documents", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						return await collection.countDocuments();
					})
					.assert("should have 5 documents", (count) => count === 5);

				store
					.exec("find with filter", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const docs = await collection.find({ age: { $gte: 30 } }).toArray();
						return docs.length;
					})
					.assert("should find 3 documents", (count) => count === 3);

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(collectionName).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Aggregations", () => {
		it("should perform aggregation pipeline", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_agg_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Aggregation operations",
				components: [db],
			});

			const tc = testCase("aggregate documents", (test) => {
				const store = test.use(db);

				store.exec("setup data", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertMany([
						{ category: "electronics", price: 100 },
						{ category: "electronics", price: 200 },
						{ category: "clothing", price: 50 },
						{ category: "clothing", price: 75 },
						{ category: "electronics", price: 150 },
					]);
				});

				store
					.exec("aggregate by category", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const results = await collection
							.aggregate([
								{
									$group: {
										_id: "$category",
										totalPrice: { $sum: "$price" },
										avgPrice: { $avg: "$price" },
										count: { $sum: 1 },
									},
								},
								{ $sort: { _id: 1 } },
							])
							.toArray();
						return results;
					})
					.assert("aggregation results correct", (results) => {
						const clothing = results.find((r: { _id: string }) => r._id === "clothing");
						const electronics = results.find((r: { _id: string }) => r._id === "electronics");
						return (
							clothing?.totalPrice === 125 &&
							clothing?.count === 2 &&
							electronics?.totalPrice === 450 &&
							electronics?.count === 3
						);
					});

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(collectionName).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Indexes", () => {
		it("should create and use indexes", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_idx_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Index operations",
				components: [db],
			});

			const tc = testCase("create index", (test) => {
				const store = test.use(db);

				store.exec("create collection with index", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.createIndex({ email: 1 }, { unique: true });
				});

				store.exec("insert document", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertOne({ email: "test@example.com", name: "Test" });
				});

				store
					.exec("list indexes", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const indexes = await collection.listIndexes().toArray();
						return indexes;
					})
					.assert("should have email index", (indexes) => {
						return indexes.some((idx: { key: { email?: number } }) => idx.key.email === 1);
					});

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(collectionName).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Data Types", () => {
		it("should handle various MongoDB data types", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_types_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Data types",
				components: [db],
			});

			const tc = testCase("various data types", (test) => {
				const store = test.use(db);
				const testDate = new Date();

				store.exec("insert various types", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertOne({
						stringField: "hello world",
						numberField: 42,
						floatField: 3.14159,
						boolField: true,
						dateField: testDate,
						arrayField: [1, 2, 3, 4, 5],
						nestedField: { a: 1, b: { c: 2 } },
						nullField: null,
					});
				});

				store
					.exec("verify types", async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						const doc = await collection.findOne({});
						return doc;
					})
					.assert("types should be correct", (doc) => {
						return (
							doc?.stringField === "hello world" &&
							doc?.numberField === 42 &&
							Math.abs(doc?.floatField - 3.14159) < 0.0001 &&
							doc?.boolField === true &&
							doc?.dateField instanceof Date &&
							Array.isArray(doc?.arrayField) &&
							doc?.arrayField.length === 5 &&
							doc?.nestedField?.b?.c === 2 &&
							doc?.nullField === null
						);
					});

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(collectionName).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Error Handling", () => {
		it("should handle duplicate key error", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_dup_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Duplicate key error",
				components: [db],
			});

			const tc = testCase("duplicate key error", (test) => {
				const store = test.use(db);

				store.exec("create unique index", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.createIndex({ email: 1 }, { unique: true });
					await collection.insertOne({ email: "dup@test.com" });
				});

				store.exec("insert duplicate", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertOne({ email: "dup@test.com" });
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toMatch(/duplicate key|E11000/i);

			// Cleanup
			const cleanupAdapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			await cleanupAdapter.init();
			await cleanupAdapter
				.getClient()
				.collection(collectionName)
				.drop()
				.catch(() => {});
			await cleanupAdapter.dispose();
		});
	});

	describe("Assertions", () => {
		it("should fail test when assertion fails", async () => {
			const mongodb = getMongoDBConfig();
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Assertion failure",
				components: [db],
			});

			const tc = testCase("failing assertion", (test) => {
				test
					.use(db)
					.exec(async (mongoDb) => {
						const result = await mongoDb.command({ ping: 1 });
						return result.ok;
					})
					.assert("value should be 2", (ok) => ok === 2); // Will fail - ok is 1
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed");
		});

		it("should support multiple chained assertions", async () => {
			const mongodb = getMongoDBConfig();
			const collectionName = `test_chain_${Date.now()}`;
			const adapter = new MongoAdapter({
				uri: mongodb.uri,
				database: mongodb.database,
			});
			const db = new DataSource("mongodb", { adapter });

			const scenario = new TestScenario({
				name: "Chained assertions",
				components: [db],
			});

			const tc = testCase("multiple assertions", (test) => {
				const store = test.use(db);

				store.exec("setup", async (mongoDb) => {
					const collection = mongoDb.collection(collectionName);
					await collection.insertOne({ name: "Test", count: 42, active: true });
				});

				store
					.exec(async (mongoDb) => {
						const collection = mongoDb.collection(collectionName);
						return await collection.findOne({});
					})
					.assert("should have name", (doc) => doc?.name === "Test")
					.assert("should have count", (doc) => doc?.count === 42)
					.assert("should be active", (doc) => doc?.active === true);

				store.exec("cleanup", async (mongoDb) => {
					await mongoDb.collection(collectionName).drop();
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
