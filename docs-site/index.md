---
layout: home

hero:
  name: Testurio
  text: Declarative E2E Testing for Distributed Systems
  tagline: Multi-protocol integration testing framework with type-safe, readable syntax
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/udamir/testurio

features:
  - icon: "\U0001F3AD"
    title: "Client \xB7 Mock \xB7 Proxy"
    details: Every test component acts as a client sending requests, a mock returning responses with payload validation, or a proxy forwarding and transforming live traffic.
  - icon: "\U0001F310"
    title: Multi-Protocol Support
    details: HTTP, gRPC (Unary & Streaming), WebSocket, and TCP protocols with a unified testing API.
  - icon: "\U0001F4DD"
    title: Declarative API
    details: Write tests in execution order with clear, readable syntax. No imperative setup or teardown code.
  - icon: "\U0001F512"
    title: Type-Safe
    details: Full TypeScript support with automatic type inference from service definitions and Zod schemas.
  - icon: "\U00002705"
    title: Schema Validation
    details: Runtime payload validation using Zod-compatible schemas with auto-validation at I/O boundaries.
  - icon: "\U0001F4E8"
    title: Message Queue Support
    details: Test pub/sub flows with Kafka, RabbitMQ, and Redis Pub/Sub using Publisher and Subscriber components.
  - icon: "\U0001F4BE"
    title: DataSource Integration
    details: Direct SDK access to Redis, PostgreSQL, and MongoDB for test setup, assertions, and teardown.
---
