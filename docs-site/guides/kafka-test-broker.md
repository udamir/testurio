# Kafka test broker configuration

Recommended broker setup for running testurio's per-test-case Kafka tests. Every test case opens its own consumer group and goes through a coordinator-join handshake. The broker defaults are tuned for production stability, not test parallelism — these settings cut the common bottlenecks.

## Why broker-side?

`KafkaJS` exposes most consumer/producer knobs via `ConsumerConfig` / `ProducerConfig`, but a handful of latency-critical settings are **broker-side only** and CANNOT be set via the kafkajs client. Notably:

- `group.initial.rebalance.delay.ms` — default `3000`. Tells the broker how long to wait after the first member of a new group joins before triggering the initial rebalance, so additional members have a chance to join in the same generation. For testurio (one-consumer-per-TC), this is dead weight — every TC pays the 3 second wait. Setting it to `0` removes the penalty.

The settings below are passed as broker environment variables via Docker Compose. The `KAFKA_` prefix maps to the `server.properties` key by lowercasing and replacing `_` with `.` (e.g. `KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS` → `group.initial.rebalance.delay.ms`).

## Reference docker-compose for tests

The following one-broker configuration is recommended for local + CI testing against testurio's `@testurio/adapter-kafka`. It uses Confluent's Kafka image; Redpanda has equivalent settings (see below).

```yaml
# docker-compose.kafka-tests.yml
services:
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports:
      - "9092:9092"
    environment:
      # --- testurio-critical ---
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      # Single-broker replication factors
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      # --- standard single-broker setup ---
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: "broker,controller"
      KAFKA_CONTROLLER_QUORUM_VOTERS: "1@kafka:9093"
      KAFKA_LISTENERS: "PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093"
      KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://localhost:9092"
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT"
      KAFKA_CONTROLLER_LISTENER_NAMES: "CONTROLLER"
      KAFKA_INTER_BROKER_LISTENER_NAME: "PLAINTEXT"
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
```

### What each setting does

| Setting | Default | Recommended for tests | Why |
| --- | --- | --- | --- |
| `group.initial.rebalance.delay.ms` | `3000` | `0` | Removes the per-group join penalty. With per-TC isolation, every test case pays this — at default, a 30-TC suite eats 90 s in join delays alone. |
| `auto.create.topics.enable` | `true` (since 2.6) | `true` | Tests publish to ad-hoc topic names; broker-side auto-create avoids needing to pre-provision. |
| `offsets.topic.replication.factor` | `3` | `1` | Single-broker setup; the default 3 would block startup waiting for non-existent replicas. |
| `transaction.state.log.replication.factor` | `3` | `1` | Same as offsets — needed for single-broker. |
| `transaction.state.log.min.isr` | `2` | `1` | Same — single-broker tolerates 0 replicas. |

### Redpanda equivalent

Redpanda accepts the same `group.initial.rebalance.delay.ms` knob but reads it from `redpanda.yaml` (or env vars prefixed `REDPANDA_`):

```yaml
services:
  redpanda:
    image: redpandadata/redpanda:v23.3.0
    command:
      - redpanda
      - start
      - --kafka-addr=PLAINTEXT://0.0.0.0:9092
      - --advertise-kafka-addr=PLAINTEXT://localhost:9092
      - --set redpanda.group_initial_rebalance_delay=0ms
      - --set redpanda.auto_create_topics_enabled=true
    ports:
      - "9092:9092"
```

## Parallel-TC cap

With `KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0`:

- **8 – 16 parallel TCs** on a single broker partition leader is a good starting point.
- Beyond that, coordinator-join contention starts to dominate test wall-clock; consider sharding across brokers or using the **shared groupId opt-out** (`new KafkaAdapter({ defaultSubscribeParams: { groupId: 'shared' } })`).

With default `group.initial.rebalance.delay.ms=3000`:

- **~3 parallel TCs** is the comfortable ceiling before the delay-induced serialization causes excessive timeouts.

See the [Subscriber Performance section](../api/core.md#subscriber) for the full guidance.

## Cross-references

- Subscriber API docs: [docs-site/api/core.md](../api/core.md#subscriber)
- Kafka adapter docs: [docs-site/api/adapter-kafka.md](../api/adapter-kafka.md)
