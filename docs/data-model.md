# QuickNotes Data Model Specification

This document details the relational data model, entity schemas, constraints, indexes, sample queries, and database architecture justification for the QuickNotes service.

---

## 1. Entities & Schema Definition

The QuickNotes system is structured around four core relational entities: `users`, `notes`, `tags`, and the junction entity `note_tags`.

### 1.1 `users` Table
Stores authenticated user credentials and profile metadata.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` / `BIGINT` | `PRIMARY KEY AUTOINCREMENT` | Unique identifier for each user |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` | User email address used for login |
| `name` | `VARCHAR(100)` | `NOT NULL` | Display name of the user |
| `password_hash`| `VARCHAR(255)` | `NOT NULL` | Secure salted bcrypt/argon2 password hash |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Account creation timestamp in UTC |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Last profile update timestamp in UTC |

### 1.2 `notes` Table
Stores the actual content and metadata of user notes.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` / `BIGINT` | `PRIMARY KEY AUTOINCREMENT` | Unique identifier for each note |
| `user_id` | `INTEGER` / `BIGINT` | `NOT NULL, FK -> users(id) ON DELETE CASCADE` | References owning user account |
| `title` | `VARCHAR(100)` | `NOT NULL` | Note title (enforced max 100 characters) |
| `body` | `TEXT` | `NULL` | Optional note body text content |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Note creation timestamp in UTC |
| `updated_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Last modification timestamp in UTC |

### 1.3 `tags` Table
Stores normalized, unique classification labels that categorize notes.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` / `BIGINT` | `PRIMARY KEY AUTOINCREMENT` | Unique identifier for each tag |
| `name` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Unique lowercase alphanumeric tag name |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Tag initial creation timestamp in UTC |

### 1.4 `note_tags` Table
Associative junction table establishing the many-to-many relationship between notes and tags.

| Column | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `note_id` | `INTEGER` / `BIGINT` | `NOT NULL, FK -> notes(id) ON DELETE CASCADE` | Foreign key referencing associated note |
| `tag_id` | `INTEGER` / `BIGINT` | `NOT NULL, FK -> tags(id) ON DELETE CASCADE` | Foreign key referencing associated tag |
| `created_at` | `TIMESTAMP` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | Association timestamp in UTC |

*Composite Primary Key*: `PRIMARY KEY (note_id, tag_id)` ensures a note cannot be tagged with the same tag multiple times.

---

## 2. Relationships

The data model features both One-to-Many and Many-to-Many relationships:

### 2.1 One-to-Many Relationship ($1 : N$)
- **`users` $\rightarrow$ `notes`**:
  - One user can author zero, one, or thousands of notes.
  - Each individual note belongs strictly to exactly one user, enforced by `notes.user_id NOT NULL REFERENCES users(id)`.
  - When a user account is deleted, all owned notes are automatically removed via `ON DELETE CASCADE`, preserving relational hygiene and avoiding orphaned notes.

### 2.2 Many-to-Many Relationship ($M : N$)
- **`notes` $\leftrightarrow$ `tags`**:
  - A single note can have multiple tags (e.g. `#architecture`, `#engineering`, `#devops`).
  - A single tag can categorize multiple notes across different users.
  - In relational database design, $M : N$ relationships cannot be stored directly inside a normalized column without violating First Normal Form (1NF) or causing severe update anomalies and duplicate storage.
  - The `note_tags` junction table cleanly decomposes the $M : N$ relationship into two $1 : N$ relationships:
    - One note has many `note_tags` entries ($1 : N$).
    - One tag has many `note_tags` entries ($1 : N$).

---

## 3. DDL: CREATE TABLE Statements

Standard SQL DDL statements compatible with SQLite and PostgreSQL:

```sql
-- 1. Users Table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Notes Table
CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Tags Table
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Note Tags Junction Table
CREATE TABLE note_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

---

## 4. Indexing Strategy & Justifications

To achieve sub-10ms query execution times under 1 million users, the following indexes are defined:

```sql
-- Index 1: Optimize user note pagination and sorting by recent updates
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC);

-- Index 2: Optimize reverse lookups from tags to notes
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);

-- Index 3: Optimize search by title prefix or exact match
CREATE INDEX idx_notes_title ON notes(title);
```

### Technical Reasons:
1. **`idx_notes_user_updated (user_id, updated_at DESC)`**:
   - The most common query in the application is listing a user's most recently modified notes (`WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10`).
   - Without this index, the query engine must perform a full sequential table scan across all notes belonging to the user and perform an expensive in-memory sort (`filesort`).
   - With this composite B-tree index, the database conducts a direct range scan and reads index nodes in pre-sorted order, reducing time complexity from $O(N \log N)$ to $O(\log N + K)$, where $K$ is the limit.

2. **`idx_note_tags_tag_id (tag_id)`**:
   - While the composite primary key `(note_id, tag_id)` automatically indexes `note_id` as the leading column, standard B-tree index structures cannot efficiently filter by the second column (`tag_id`) alone.
   - When a user filters notes by tag (e.g. `WHERE tags.name = 'devops'`), the query joins from `tags` to `note_tags`. An index on `note_tags(tag_id)` allows instant index seeks, avoiding a full table scan across millions of junction rows.

---

## 5. Example SQL Queries

### Query 1: Retrieve 10 Most Recent Notes for a User with All Associated Tags (JOIN)
Retrieves a paginated list of notes along with aggregated tags formatted as a comma-separated list.

```sql
SELECT 
    n.id AS note_id,
    n.title,
    n.body,
    n.updated_at,
    COALESCE(GROUP_CONCAT(t.name), '') AS tags
FROM notes n
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.user_id = 42
GROUP BY n.id, n.title, n.body, n.updated_at
ORDER BY n.updated_at DESC
LIMIT 10 OFFSET 0;
```

### Query 2: Retrieve All Notes Belonging to a User Tagged with a Specific Tag (Multi-table JOIN)
Finds all notes belonging to User 42 that are labeled with `#architecture`.

```sql
SELECT 
    n.id AS note_id,
    n.title,
    n.body,
    n.created_at,
    n.updated_at
FROM notes n
JOIN note_tags nt ON n.id = nt.note_id
JOIN tags t ON nt.tag_id = t.id
WHERE n.user_id = 42
  AND t.name = 'architecture'
ORDER BY n.updated_at DESC;
```

### Query 3: Count How Many Notes a User Has in Each Tag (JOIN & GROUP BY)
Aggregates and displays tag usage statistics for a specific user to populate UI tag badges.

```sql
SELECT 
    t.name AS tag_name,
    COUNT(n.id) AS note_count
FROM tags t
JOIN note_tags nt ON t.id = nt.tag_id
JOIN notes n ON nt.note_id = n.id
WHERE n.user_id = 42
GROUP BY t.id, t.name
ORDER BY note_count DESC, t.name ASC;
```

---

## 6. SQL vs. NoSQL Justification

For QuickNotes, a **Relational SQL Database (PostgreSQL / MySQL)** is the superior and recommended architectural choice over a NoSQL document or key-value store for several critical engineering reasons:

1. **Relational Integrity and Strict Constraints**:
   Notes inherently feature relational structures: users author notes, notes belong to users, and notes share normalized tags. SQL engines natively enforce referential integrity using foreign keys and cascading deletes (`ON DELETE CASCADE`). If a user or note is deleted, relational constraints guarantee zero orphaned records without requiring fragile application-level cleanup logic.

2. **Normalized Tagging Without Data Anomalies**:
   In a NoSQL document database (such as MongoDB), tags are typically stored as embedded string arrays inside note documents (`["devops", "architecture"]`). Renaming a tag, querying system-wide tag usage, or counting tagged notes across users would require scanning and rewriting millions of documents. In SQL, tags exist as a normalized, deduplicated entity in `tags`, and associations are maintained in the lightweight `note_tags` table, enabling instantaneous updates and aggregation queries.

3. **ACID Transactions**:
   Creating or updating a note with multiple tags involves inserting into both the `notes` table and the `note_tags` junction table. SQL provides true ACID transactions (`BEGIN ... COMMIT`), guaranteeing that either the entire note creation and tag linkage succeeds atomically, or it cleanly rolls back upon error. NoSQL databases offer weaker or more complex distributed transaction semantics.

4. **Predictable Query Patterns at 1 Million Users**:
   At 1,000,000 users, QuickNotes generates approximately 10 to 50 million total notes. This data volume easily fits within modern relational databases on standard hardware or cloud-managed instances (e.g. AWS Aurora PostgreSQL), which effortlessly handle tens of thousands of read queries per second when backed by read replicas and composite B-tree indexes. SQL provides battle-tested performance, rich tooling, and predictable indexing without the risk of eventual consistency anomalies or unbounded document growth.
