/**
 * @testurio/adapter-mongo
 *
 * MongoDB adapter for Testurio DataSource component.
 * Uses the official MongoDB Node.js driver.
 *
 * @example
 * ```typescript
 * import { DataSource } from "testurio";
 * import { MongoAdapter } from "@testurio/adapter-mongo";
 *
 * const mongo = new DataSource("mongodb", {
 *   adapter: new MongoAdapter({
 *     uri: "mongodb://localhost:27017",
 *     database: "testdb",
 *   }),
 * });
 *
 * await mongo.start();
 *
 * // Direct execution
 * const users = await mongo.exec(async (db) => {
 *   return db.collection("users").find().toArray();
 * });
 *
 * // In test scenarios
 * const tc = testCase("verify document exists", (test) => {
 *   const db = test.use(mongo);
 *
 *   db
 *     .exec("find user by email", async (db) => {
 *       return db.collection("users").findOne({ email: "test@example.com" });
 *     })
 *     .assert("user should exist", (user) => user !== null);
 * });
 * ```
 */

// Re-export common MongoDB types for convenience
export type {
	Collection,
	Db,
	DeleteResult,
	Document,
	Filter,
	FindOptions,
	InsertOneResult,
	MongoClient,
	UpdateResult,
} from "mongodb";
export { createMongoAdapter, MongoAdapter } from "./mongo.adapter.js";
export type { MongoAdapterConfig } from "./mongo.types.js";
