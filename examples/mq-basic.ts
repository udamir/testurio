/**
 * Basic Message Queue Example
 *
 * Demonstrates testing with Publisher and Subscriber components for message queue operations.
 * This example shows type-safe pub/sub patterns with topic definitions.
 *
 * For real tests, install the appropriate adapter:
 * - @testurio/adapter-kafka - Apache Kafka
 * - @testurio/adapter-rabbitmq - RabbitMQ
 * - @testurio/adapter-redis - Redis Pub/Sub
 */

import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
// In real tests, import from adapter package:
// import { KafkaAdapter } from "@testurio/adapter-kafka";
// import { RabbitMQAdapter } from "@testurio/adapter-rabbitmq";
// import { RedisPubSubAdapter } from "@testurio/adapter-redis";

// For this example, we use the test mock (not exported from testurio)
import { createFakeMQAdapter, createInMemoryBroker } from "../tests/mocks/fakeMQAdapter";

// =============================================================================
// Type Definitions
// =============================================================================

// Type-safe topic definitions for message queue
interface OrderTopics {
	"order-created": { orderId: string; customerId: string; total: number };
	"order-shipped": { orderId: string; trackingNumber: string };
	"order-cancelled": { orderId: string; reason: string };
}

interface NotificationTopics {
	"email-sent": { to: string; subject: string; status: "sent" | "failed" };
	"sms-sent": { phone: string; message: string; status: "sent" | "failed" };
}

// =============================================================================
// Component Setup
// =============================================================================

// Create shared broker for testing (in real tests, components connect to actual broker)
const broker = createInMemoryBroker();

// Create Publisher for order events
const orderPublisher = new Publisher<OrderTopics>("order-pub", {
	adapter: createFakeMQAdapter(broker),
	// Real Kafka example:
	// adapter: new KafkaAdapter({ brokers: ["localhost:9092"] }),
});

// Create Subscriber for order events
const orderSubscriber = new Subscriber<OrderTopics>("order-sub", {
	adapter: createFakeMQAdapter(broker),
	// Real Kafka example:
	// adapter: new KafkaAdapter({ brokers: ["localhost:9092"], groupId: "test-group" }),
});

// Create Publisher for notifications
const notificationPublisher = new Publisher<NotificationTopics>("notif-pub", {
	adapter: createFakeMQAdapter(broker),
});

// Create Subscriber for notifications
const notificationSubscriber = new Subscriber<NotificationTopics>("notif-sub", {
	adapter: createFakeMQAdapter(broker),
});

// Create the test scenario with all MQ components
// Note: Subscribers should be listed before Publishers to ensure subscriptions are ready
const scenario = new TestScenario({
	name: "Message Queue Integration Test",
	components: [orderSubscriber, orderPublisher, notificationSubscriber, notificationPublisher],
});

// =============================================================================
// Test Cases
// =============================================================================

// Test: Basic publish and subscribe
const basicPubSubTest = testCase("Basic publish and subscribe", (test) => {
	const pub = test.use(orderPublisher);
	const sub = test.use(orderSubscriber);

	// Step 1: Publish order created event
	pub.publish("order-created", {
		orderId: "ORD-001",
		customerId: "CUST-123",
		total: 99.99,
	});

	// Step 2: Wait for and validate the message
	sub.waitMessage("order-created")
		.assert("orderId should match", (msg) => msg.payload.orderId === "ORD-001")
		.assert("customerId should match", (msg) => msg.payload.customerId === "CUST-123")
		.assert("total should be correct", (msg) => msg.payload.total === 99.99);
});

// Test: Multiple messages in sequence
const sequentialMessagesTest = testCase("Sequential message flow", (test) => {
	const pub = test.use(orderPublisher);
	const sub = test.use(orderSubscriber);

	// Step 1: Publish order created
	pub.publish("order-created", {
		orderId: "ORD-002",
		customerId: "CUST-456",
		total: 150.0,
	});

	// Step 2: Wait for order created
	sub.waitMessage("order-created").assert("order created", (msg) => msg.payload.orderId === "ORD-002");

	// Step 3: Publish order shipped
	pub.publish("order-shipped", {
		orderId: "ORD-002",
		trackingNumber: "TRACK-789",
	});

	// Step 4: Wait for order shipped
	sub.waitMessage("order-shipped")
		.assert("orderId should match", (msg) => msg.payload.orderId === "ORD-002")
		.assert("tracking number should be set", (msg) => msg.payload.trackingNumber === "TRACK-789");
});

// Test: Multiple subscribers on different topics
const multiTopicTest = testCase("Multi-topic pub/sub", (test) => {
	const orderPub = test.use(orderPublisher);
	const orderSub = test.use(orderSubscriber);
	const notifPub = test.use(notificationPublisher);
	const notifSub = test.use(notificationSubscriber);

	// Step 1: Publish order event
	orderPub.publish("order-created", {
		orderId: "ORD-003",
		customerId: "CUST-789",
		total: 200.0,
	});

	// Step 2: Verify order event received
	orderSub.waitMessage("order-created").assert("order received", (msg) => msg.payload.orderId === "ORD-003");

	// Step 3: Publish notification
	notifPub.publish("email-sent", {
		to: "customer@example.com",
		subject: "Order Confirmation",
		status: "sent",
	});

	// Step 4: Verify notification received
	notifSub.waitMessage("email-sent")
		.assert("email to correct recipient", (msg) => msg.payload.to === "customer@example.com")
		.assert("email sent successfully", (msg) => msg.payload.status === "sent");
});

// Test: Order cancellation flow
const cancellationFlowTest = testCase("Order cancellation flow", (test) => {
	const pub = test.use(orderPublisher);
	const sub = test.use(orderSubscriber);

	// Step 1: Create order
	pub.publish("order-created", {
		orderId: "ORD-004",
		customerId: "CUST-999",
		total: 50.0,
	});

	// Step 2: Verify order created
	sub.waitMessage("order-created").assert("order created", (msg) => msg.payload.orderId === "ORD-004");

	// Step 3: Cancel order
	pub.publish("order-cancelled", {
		orderId: "ORD-004",
		reason: "Customer request",
	});

	// Step 4: Verify cancellation
	sub.waitMessage("order-cancelled")
		.assert("correct order cancelled", (msg) => msg.payload.orderId === "ORD-004")
		.assert("reason provided", (msg) => msg.payload.reason === "Customer request");
});

// Test: Message with custom matcher
const matcherTest = testCase("Message with custom matcher", (test) => {
	const pub = test.use(orderPublisher);
	const sub = test.use(orderSubscriber);

	// Publish multiple orders
	pub.publish("order-created", {
		orderId: "ORD-100",
		customerId: "CUST-A",
		total: 10.0,
	});

	pub.publish("order-created", {
		orderId: "ORD-200",
		customerId: "CUST-B",
		total: 200.0,
	});

	// Wait for specific message using matcher
	sub.waitMessage("order-created", {
		matcher: (msg) => msg.payload.total > 100,
	}).assert("high-value order matched", (msg) => msg.payload.orderId === "ORD-200");
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
	console.log("Running Message Queue tests...\n");

	try {
		// Clear broker between tests
		const result1 = await scenario.run(basicPubSubTest);
		console.log(`Basic pub/sub: ${result1.passed ? "PASSED" : "FAILED"}`);
		broker.clear();

		const result2 = await scenario.run(sequentialMessagesTest);
		console.log(`Sequential messages: ${result2.passed ? "PASSED" : "FAILED"}`);
		broker.clear();

		const result3 = await scenario.run(multiTopicTest);
		console.log(`Multi-topic: ${result3.passed ? "PASSED" : "FAILED"}`);
		broker.clear();

		const result4 = await scenario.run(cancellationFlowTest);
		console.log(`Cancellation flow: ${result4.passed ? "PASSED" : "FAILED"}`);
		broker.clear();

		const result5 = await scenario.run(matcherTest);
		console.log(`Custom matcher: ${result5.passed ? "PASSED" : "FAILED"}`);

		// Summary
		const allPassed =
			result1.passed && result2.passed && result3.passed && result4.passed && result5.passed;
		console.log(`\n${allPassed ? "All tests passed!" : "Some tests failed."}`);
		process.exit(allPassed ? 0 : 1);
	} catch (error) {
		console.error("Test execution failed:", error);
		process.exit(1);
	}
}

main();
