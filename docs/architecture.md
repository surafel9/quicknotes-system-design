# QuickNotes System Architecture & Scaling Plan

This document details the end-to-end technical architecture, capacity estimates, component specifications, request execution flows, architectural trade-offs, and high-availability strategy for scaling QuickNotes to support **1,000,000 active users**.

---

## 1. System Requirements

### 1.1 Functional Requirements
1. **Note Management**: Users can create, view, update, and delete rich-text notes with titles and bodies.
2. **Tagging & Organization**: Users can attach multiple tags to notes and retrieve notes filtered by tag.
3. **Full-Text Search**: Users can quickly search note titles and contents by keyword.
4. **Cross-Platform Access**: Responsive access across desktop web browsers, tablets, and mobile devices.

### 1.2 Non-Functional Requirements
1. **High Availability**: The service must provide 99.9% uptime (less than 8.76 hours of downtime per year).
2. **Low Latency**: Read requests (`GET /notes`) must respond in under 50 ms (p95); write requests (`POST /notes`) must complete in under 150 ms (p95).
3. **Data Durability & Consistency**: Zero data loss for saved notes with strict ACID guarantees on writes.
4. **Horizontal Scalability**: Stateless application tiers capable of scaling dynamically with traffic spikes.
5. **Security & Data Isolation**: All traffic encrypted via TLS 1.3; strict row-level authorization preventing cross-user data leaks.

---

## 2. Capacity Estimations & Load Calculations (1 Million Users)

### 2.1 User Base Assumptions
- **Active User Base**: 1,000,000 users.
- **Daily Writes**: Each user creates or updates an average of 2 notes per day.
- **Daily Reads**: Each user views notes or refreshes their list an average of 10 times per day.
- **Traffic Pattern**: Peak traffic is estimated at $5\times$ the daily average.

### 2.2 Writes Per Second (Throughput)
- **Total Writes per Day**:
  $$1,000,000 \text{ users} \times 2 \text{ writes/day} = 2,000,000 \text{ writes/day}$$
- **Seconds per Day**: $24 \times 60 \times 60 = 86,400 \text{ seconds}$
- **Average Writes per Second**:
  $$\text{Average Writes/s} = \frac{2,000,000}{86,400} \approx 23.15 \text{ writes/second (}\approx 24 \text{ writes/s)}$$
- **Peak Writes per Second ($5\times$ Average)**:
  $$\text{Peak Writes/s} = 23.15 \times 5 \approx 115.75 \text{ writes/second (}\approx 116 \text{ writes/s)}$$

### 2.3 Reads Per Second (Throughput)
- **Total Reads per Day**:
  $$1,000,000 \text{ users} \times 10 \text{ reads/day} = 10,000,000 \text{ reads/day}$$
- **Average Reads per Second**:
  $$\text{Average Reads/s} = \frac{10,000,000}{86,400} \approx 115.74 \text{ reads/second (}\approx 116 \text{ reads/s)}$$
- **Peak Reads per Second ($5\times$ Average)**:
  $$\text{Peak Reads/s} = 115.74 \times 5 \approx 578.70 \text{ reads/second (}\approx 580 \text{ reads/s)}$$
- **Read-to-Write Ratio**: $5:1$ (Read-dominant workload).

### 2.4 Annual Storage Requirements
- **Average Storage per Note**:
  - Title: ~50 bytes (UTF-8, max 100 characters)
  - Body: ~1,000 bytes (1 KB)
  - Metadata (`id`, `user_id`, timestamps, status): ~150 bytes
  - Tag links (`note_tags` entries): ~100 bytes
  - **Total per note record**: $\approx 1.3 \text{ KB}$
- **New Notes Created per Year**:
  - Assuming 50% of writes are net-new notes:
    $$1,000,000 \text{ notes/day} \times 365 = 365,000,000 \text{ notes/year}$$
- **Raw Data Storage per Year**:
  $$365,000,000 \times 1.3 \text{ KB} \approx 474,500,000 \text{ KB} \approx 474.5 \text{ GB/year}$$
- **Storage with Index & WAL Overhead (+50%)**:
  $$474.5 \text{ GB} \times 1.5 \approx \mathbf{711.75 \text{ GB/year (}\approx 0.71 \text{ TB/year)}}$$

*Conclusion*: At ~712 GB per year, the entire QuickNotes dataset for 1M users easily fits on standard modern database volumes without requiring premature distributed sharding.

---

## 3. High-Level Architecture Diagram

```
                             [ Clients (Web / Mobile) ]
                                         │
                                         ▼
                                   [ DNS Layer ]
                              (Route 53 / Cloudflare)
                                         │
                                         ▼
                            [ Content Delivery Network ]
                                 (Edge Static CDN)
                                         │
                       Dynamic API Calls │ (HTTPS / TLS 1.3)
                                         ▼
                            [ Load Balancer (ALB) ]
                            (SSL Termination / Health)
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
           [ App Server #1 ]                         [ App Server #2 ]
           (Node.js / Express)                       (Node.js / Express)
             │      │       │                          │      │       │
             │      │       └────────────┬─────────────┘      │       │
             │      │                    │                    │       │
       Read  │      │ Cache Check        │ Read/Write         │       │
             │      ▼                    ▼                    │       │
             │  ┌─────────────────────────────┐               │       │
             │  │   In-Memory Cache (Redis)   │               │       │
             │  └─────────────────────────────┘               │       │
             │                                                │       │
             ▼                                                ▼       │
      ┌───────────────┐                              ┌───────────────┐│
      │ Read Replica  │◄──────── Replication ────────│  Primary DB   ││
      │ (PostgreSQL)  │                              │ (PostgreSQL)  ││
      └───────────────┘                              └───────────────┘│
                                                              │       │
                                              Enqueue Task    │       │
                                              (Search Index)  ▼       │
                                              ┌───────────────────────┐
                                              │ Message Queue (Rabbit)│
                                              └───────────────────────┘
                                                          │
                                                          │ Pull Job
                                                          ▼
                                              ┌───────────────────────┐
                                              │   Background Worker   │
                                              │ (Search / Analytics)  │
                                              └───────────────────────┘
```

---

## 4. Component Explanations (One Sentence Each)

- **Client**: Initiates HTTP requests through modern web browsers and mobile applications to interact with QuickNotes services.
- **DNS**: Resolves domain names to optimal Anycast IP addresses, providing geographic routing and initial network failover.
- **CDN**: Caches static front-end assets (`index.html`, `style.css`, `api.js`) at edge locations close to users to minimize latency and offload origin traffic.
- **Load Balancer**: Distributes incoming API traffic evenly across multiple application server instances while terminating SSL and monitoring instance health.
- **App Servers**: Execute core business logic, handle user authentication, validate inputs, and orchestrate database and cache operations.
- **Cache (Redis)**: Stores frequently read user notes and session data in high-speed RAM to prevent repetitive database read operations.
- **Primary Database**: Serves as the authoritative source of truth that safely processes all insert, update, and delete write transactions with strict ACID guarantees.
- **Read Replica**: Offloads read queries from the primary database by handling list and search read traffic asynchronously.
- **Message Queue**: Decouples write operations from non-critical tasks by buffering asynchronous jobs such as full-text search indexing and user activity logging.
- **Worker**: Consumes background jobs from the queue to update search indexes and generate analytical summaries without delaying user requests.

---

## 5. Step-by-Step Request Flows

### 5.1 Step-by-Step Flow: `GET /notes`
1. **Client Request**: The client dispatches an authenticated HTTP request `GET /api/v1/notes` with a Bearer JWT token in the headers.
2. **DNS & Routing**: DNS directs the client to the nearest Load Balancer endpoint.
3. **Load Balancing**: The Load Balancer terminates TLS, verifies request integrity, and routes the request to an available App Server using round-robin.
4. **Authentication & Cache Lookup**: The App Server verifies the JWT token to extract `user_id = 42` and checks Redis for the key `user:42:notes:page:1`.
5. **Cache Hit Path**: If the key exists in Redis, the App Server deserializes the cached JSON array and immediately returns a `200 OK` response (~5 ms).
6. **Cache Miss Path**: If the key is not found, the App Server sends a SQL query to the **Read Replica** database utilizing the composite index `idx_notes_user_updated`.
7. **Cache Population**: The App Server populates Redis with the query result and sets a Time-To-Live (TTL = 300 seconds).
8. **Client Response**: The App Server returns the notes list and pagination metadata with status `200 OK` to the client.

### 5.2 Step-by-Step Flow: `POST /notes`
1. **Client Submission**: The client sends a `POST /api/v1/notes` request with a JSON payload containing `{ title, body, tags }`.
2. **Load Balancing**: The Load Balancer directs the payload to a healthy App Server instance.
3. **Input Validation**: The App Server validates that `title` is non-empty and under 100 characters; invalid payloads return an immediate `400 Bad Request`.
4. **Primary DB Transaction**: The App Server opens a transaction on the **Primary Database**, inserts a new record into `notes`, resolves or inserts tag IDs in `tags`, and writes rows into `note_tags`.
5. **Transaction Commit**: The Primary Database commits the transaction, guaranteeing data durability and generating the new note ID.
6. **Cache Invalidation**: The App Server invalidates related user cache keys in Redis (`DEL user:42:notes:*`) to prevent stale reads on subsequent queries.
7. **Task Enqueueing**: The App Server pushes an asynchronous search indexing job `{ note_id: 1043, action: "INDEX" }` to the **Message Queue**.
8. **Client Response**: The App Server returns a `201 Created` status code with the newly created note payload to the user (~40 ms).
9. **Asynchronous Worker Processing**: The Background Worker pulls the job from the Message Queue and updates the full-text search engine without impacting client response time.

---

## 6. Architectural Trade-offs

### Trade-off 1: Caching Strategy — Cache-Aside (Lazy Loading) vs. Write-Through
- **Option A (Write-Through)**: Every note creation or update writes simultaneously to the Primary DB and updates the Redis cache.
  - *Pros*: Reads are virtually guaranteed 100% cache hits.
  - *Cons*: High write latency, write amplification overhead, and wasted memory caching notes for inactive users who rarely re-open the app.
- **Option B (Cache-Aside with Eviction on Write - Chosen)**: When a note is created or updated, the application writes to the Primary DB and simply invalidates (`DEL`) the affected user's cached note lists. Data is re-fetched and cached only when the user requests it.
  - *Pros*: Memory-efficient (only active user datasets occupy RAM), resilient against cache corruption, and straightforward to implement.
  - *Cons*: Small latency penalty on the very first read following a write (cache miss).
- **Decision**: Adopt **Cache-Aside with Invalidation**. It provides optimal memory efficiency for a 1M user base where many notes are archived and infrequently reread.

### Trade-off 2: Full-Text Search — Synchronous DB Queries vs. Asynchronous Queue-Based Search Index
- **Option A (Synchronous In-DB Pattern Matching)**: Execute `LIKE '%keyword%'` or inline SQL full-text queries directly against the main database on write and search.
  - *Pros*: Single datastore, zero extra worker infrastructure, instant queryability.
  - *Cons*: Full table scans degrade database IOPS during search spikes; synchronous search indexing blocks user write requests.
- **Option B (Asynchronous Queue-Backed Worker - Chosen)**: Writes commit immediately to the Primary DB and emit a message to a lightweight queue; background workers asynchronously ingest and index notes.
  - *Pros*: Preserves fast sub-50ms write latency for users, isolates search engine failures from core note CRUD operations, and scales worker threads independently.
  - *Cons*: Eventual consistency for search (notes become searchable 100–300 ms after creation).
- **Decision**: Adopt **Asynchronous Queue-Backed Search Processing**. The momentary delay before a note appears in search is unnoticeable to users, whereas fast write responsiveness is paramount.

---

## 7. Single Points of Failure (SPOFs) & Mitigation

To achieve 99.9% uptime, every component in the architecture is designed with redundancy, automated health checks, and rapid failover:

| Architecture Tier | Potential Failure Mode | Mitigation Strategy & Redundancy |
| :--- | :--- | :--- |
| **DNS Tier** | Regional outage / DDoS attack | Anycast routing across globally distributed edge providers (AWS Route 53 / Cloudflare) with automated health checking and zero-downtime DNS failover. |
| **CDN Tier** | Edge POP failure | Multi-POP CDN network automatically re-routes incoming traffic away from degraded edge locations to adjacent healthy nodes. |
| **Load Balancer Tier**| Balancer node crash | Active-passive redundant load balancers provisioned across multiple Availability Zones (Multi-AZ) with elastic IP automated failover. |
| **App Server Tier** | Server crash or unhandled process crash | Redundant fleet of 2+ stateless app server instances distributed across multiple Availability Zones managed by an auto-scaling group. If one crashes, the load balancer stops forwarding traffic and launches a replacement. |
| **Cache Tier** | Redis master crash | Redis deployed in high-availability Sentinel / Redis Cluster mode with a standby replica in a separate zone; automatic failover promotes replica to master in under 5 seconds. If Redis goes offline completely, the app gracefully degrades to querying the database directly. |
| **Database Tier** | Primary DB hardware failure | Multi-AZ Primary Database with synchronous replication to a standby instance and asynchronous streaming replication to Read Replicas. Upon primary failure, automated failover promotes the standby in under 60 seconds with zero data loss. |
| **Queue & Worker Tier** | Worker process crash or queue outage | Message Queue is deployed as a clustered, durable broker (e.g. AWS SQS or RabbitMQ mirrored queues) with persistence to disk. Worker instances run in a managed auto-healing pool; unacknowledged messages are returned to the queue and retried with dead-letter queue (DLQ) support. |
