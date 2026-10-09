# QuickNotes System Design

A complete system design and production-ready architecture plan for scaling **QuickNotes** from a browser-only client to a cloud-native online service capable of serving **1,000,000 active users**.

This project contains two core halves:
1. **Interactive REST API Client**: A lightweight, resilient front-end client (`index.html`, `style.css`, `api.js`) that connects to a REST API backend (demonstrated using JSONPlaceholder), implementing full `GET`, `POST`, and `DELETE` workflows with robust loading, error, success, and empty states.
2. **Backend Engineering Design Documents**: Comprehensive architectural, database, and API specifications designed for the backend engineering team to implement production QuickNotes.

---

## Project Structure

```text
quicknotes-system-design/
├── index.html              # Semantic HTML5 client interface
├── style.css               # Clean, accessible styling with distinct status indicators
├── api.js                  # Asynchronous REST client (GET, POST, DELETE, validation)
├── docs/
│   ├── api-design.md       # Production REST API specification (endpoints, payloads, errors)
│   ├── data-model.md       # Relational database schema, DDL, queries, and index strategies
│   └── architecture.md     # 1M user scaling plan, capacity math, diagram, and SPOF mitigation
└── README.md               # Project overview, run instructions, and learnings
```

---

## Design Documents

Detailed technical specifications live inside the [`docs/`](docs/) directory:

- 📄 **[API Design Document](docs/api-design.md)**: Details 8 RESTful endpoints for QuickNotes, complete with HTTP methods, paths, success codes, full request and response JSON payloads, and unified error handling specifications (`400`, `401`, `403`, `404`, and `500`).
- 🗄️ **[Data Model Document](docs/data-model.md)**: Defines the relational schema across `users`, `notes`, `tags`, and `note_tags`. Includes DDL `CREATE TABLE` statements, relationship explanations ($1:N$ and $M:N$), composite indexing justifications, sample SQL queries with joins, and an engineering justification for SQL over NoSQL.
- 🏗️ **[System Architecture Document](docs/architecture.md)**: Covers functional and non-functional requirements, traffic and storage estimates for 1M users, high-level architecture diagram, component roles, step-by-step `GET` and `POST` request execution flows, architectural trade-offs, and single-point-of-failure (SPOF) mitigation strategies.

---

## How to Run the API Client

The front-end client runs directly in any modern browser without external framework dependencies.

### Step 1: Start a Local Web Server
Because the script uses modern ES modules and fetch requests, serve the repository through a local web server:

**Using Python 3:**
```bash
# Navigate to the repository root
cd quicknotes-system-design

# Start HTTP server
python3 -m http.server 8000
```

**Using Node.js:**
```bash
npx serve .
```

### Step 2: Open in Your Browser
Visit [http://localhost:8000](http://localhost:8000) in your web browser.

### Step 3: Test Interactive Features
1. **Load Notes (`GET`)**:
   - Click the **Load notes** button.
   - The button is disabled and displays a `"Loading notes..."` indicator.
   - Upon completion, the status updates to `"Loaded 10 notes from the server."` and 10 notes appear in the list with titles, bodies, and IDs.
2. **Input Validation**:
   - Attempt to click **Add Note** with an empty title.
   - The client intercepts submission and displays an error message: `"Title is required to create a note."`
   - Titles are strictly validated to a maximum length of 100 characters.
3. **Create Note (`POST`)**:
   - Enter a title and optional body in the form, then click **Add Note**.
   - The submit button is disabled during transit.
   - On success, the newly created note is immediately prepended to the top of the list, the form resets, and the status confirms: `"Note created (status 201, id 101)."`
4. **Delete Note (`DELETE`)**:
   - Click the **Delete** button on any note card.
   - The delete request is dispatched to `/posts/{id}`.
   - On response, the note is removed from the DOM and a confirmation message appears: `"Note #{id} deleted successfully."`
   - If all notes are deleted, an empty-state message appears automatically.

> **Note regarding Mock API Persistence:**
> JSONPlaceholder is a mock REST API. Newly created posts (e.g. ID 101) return simulated success responses but are not permanently persisted on their remote database. The client code handles this gracefully, issuing the real HTTP `DELETE` call to verify contract compliance and updating the local view state accordingly.

---

## What I Learned

1. **Client-Side REST Integration & Defensive State Management**:
   Writing an async API client reinforced the importance of managing all four core UI states—loading, success, error, and empty. Disabling action buttons during in-flight network requests is critical to prevent accidental double-submits and race conditions. Furthermore, inserting all server- and user-supplied strings strictly via `textContent` rather than `innerHTML` ensures total immunity against Cross-Site Scripting (XSS).

2. **Relational Schema Normalization & Composite Indexing**:
   Designing the relational data model highlighted how many-to-many relationships are cleanly decomposed into two one-to-many relationships using junction tables (`note_tags`). More importantly, analyzing query execution demonstrated why composite indexes like `idx_notes_user_updated (user_id, updated_at DESC)` are essential: they allow database engines to satisfy user-specific pagination lookups directly via B-tree index scans without executing expensive sequential scans or disk-based sorts (`filesort`).

3. **High-Availability Distributed Systems Design**:
   Estimating capacity for 1,000,000 users provided practical intuition for back-of-the-envelope calculations: separating read and write throughput, sizing annual storage overhead, and decoupling heavy synchronous tasks (like full-text search indexing) into asynchronous message queues. Designing redundant multi-AZ topologies across every layer—DNS, CDN, load balancers, stateless app servers, cache replicas, and database standbys—demonstrated how modern systems achieve 99.9% availability without single points of failure.
