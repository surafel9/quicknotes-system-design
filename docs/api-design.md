# QuickNotes REST API Specification

This document defines the production RESTful API specification for the QuickNotes backend service. The API is designed to support high-throughput client applications (web and mobile) serving over 1,000,000 active users, offering full CRUD operations, tag-based categorization, and full-text search.

---

## 1. Base URL & Common Conventions

- **Base URL**: `https://api.quicknotes.io/api/v1`
- **Transport**: HTTPS (TLS 1.3 required)
- **Data Format**: `application/json; charset=utf-8`
- **Authentication**: Bearer Token (JWT) supplied in the `Authorization: Bearer <token>` header
- **Date & Time Format**: ISO 8601 strings in UTC (`YYYY-MM-DDTHH:MM:SSZ`)

---

## 2. API Endpoints Summary

| Method | Path | Description | Success Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/notes` | Retrieve a paginated list of notes for the authenticated user | `200 OK` |
| `GET` | `/notes/{id}` | Retrieve details of a specific note by ID | `200 OK` |
| `POST` | `/notes` | Create a new note for the authenticated user | `201 Created` |
| `PUT` | `/notes/{id}` | Fully update an existing note's title, body, and tags | `200 OK` |
| `PATCH` | `/notes/{id}` | Partially update an existing note's title or body | `200 OK` |
| `DELETE` | `/notes/{id}` | Permanently delete a note by ID | `204 No Content` |
| `GET` | `/notes/search` | Search notes by query string matching title or body | `200 OK` |
| `GET` | `/tags` | List all unique tags used across the authenticated user's notes | `200 OK` |

---

## 3. Endpoint Details & Examples

### 3.1 List Notes (`GET /notes`)

Retrieves a paginated collection of notes belonging to the authenticated user. Supports optional query parameters for pagination, sorting, and tag filtering.

#### Query Parameters
- `page` *(optional, integer, default: `1`)*: Page number.
- `limit` *(optional, integer, default: `10`, max: `100`)*: Number of notes per page.
- `tag` *(optional, string)*: Filter notes associated with a specific tag name.
- `sort` *(optional, string, default: `-updated_at`)*: Field to sort by (`created_at`, `updated_at`, `title`). Prepend `-` for descending order.

#### Request Example
```http
GET /api/v1/notes?page=1&limit=2&sort=-updated_at HTTP/1.1
Host: api.quicknotes.io
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

#### Response Example (`200 OK`)
```json
{
  "data": [
    {
      "id": 1042,
      "user_id": 42,
      "title": "System Architecture Review Notes",
      "body": "Discussed database read replica replication lag and Redis cache-aside invalidation strategy.",
      "tags": ["engineering", "architecture"],
      "created_at": "2026-10-09T18:30:00Z",
      "updated_at": "2026-10-09T19:15:00Z"
    },
    {
      "id": 1039,
      "user_id": 42,
      "title": "Quarterly Planning Priorities",
      "body": "Finalize Q4 infrastructure migration and launch public API developer documentation.",
      "tags": ["planning"],
      "created_at": "2026-10-08T10:00:00Z",
      "updated_at": "2026-10-08T11:45:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "limit": 2,
    "total_records": 18,
    "total_pages": 9,
    "has_next": true,
    "has_prev": false
  }
}
```

---

### 3.2 Create Note (`POST /notes`)

Creates a new note for the authenticated user. The title is required (1 to 100 characters); the body is optional (up to 50,000 characters). An optional array of tags may be provided.

#### Request Example
```http
POST /api/v1/notes HTTP/1.1
Host: api.quicknotes.io
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "title": "Database Migration Checklist",
  "body": "1. Run database backup\n2. Execute DDL migrations for note_tags\n3. Verify composite index\n4. Monitor connection pool",
  "tags": ["database", "devops"]
}
```

#### Response Example (`201 Created`)
```json
{
  "data": {
    "id": 1043,
    "user_id": 42,
    "title": "Database Migration Checklist",
    "body": "1. Run database backup\n2. Execute DDL migrations for note_tags\n3. Verify composite index\n4. Monitor connection pool",
    "tags": ["database", "devops"],
    "created_at": "2026-10-09T20:45:00Z",
    "updated_at": "2026-10-09T20:45:00Z"
  },
  "message": "Note created successfully"
}
```

---

### 3.3 Get Single Note (`GET /notes/{id}`)

Fetches complete details for a single note by ID. Returns `404 Not Found` if the note does not exist or `403 Forbidden` if it belongs to another user.

#### Response Example (`200 OK`)
```json
{
  "data": {
    "id": 1043,
    "user_id": 42,
    "title": "Database Migration Checklist",
    "body": "1. Run database backup\n2. Execute DDL migrations for note_tags\n3. Verify composite index\n4. Monitor connection pool",
    "tags": ["database", "devops"],
    "created_at": "2026-10-09T20:45:00Z",
    "updated_at": "2026-10-09T20:45:00Z"
  }
}
```

---

### 3.4 Full Update (`PUT /notes/{id}`)

Replaces all editable attributes of the target note.

#### Request Body
```json
{
  "title": "Database Migration Checklist (Completed)",
  "body": "All migration steps were successfully executed without downtime.",
  "tags": ["database", "devops", "verified"]
}
```

#### Response Example (`200 OK`)
```json
{
  "data": {
    "id": 1043,
    "user_id": 42,
    "title": "Database Migration Checklist (Completed)",
    "body": "All migration steps were successfully executed without downtime.",
    "tags": ["database", "devops", "verified"],
    "created_at": "2026-10-09T20:45:00Z",
    "updated_at": "2026-10-09T20:55:00Z"
  },
  "message": "Note updated successfully"
}
```

---

### 3.5 Partial Update (`PATCH /notes/{id}`)

Updates one or more specific fields of the note without replacing omitted fields.

#### Request Body
```json
{
  "title": "Database Migration Checklist (Verified)"
}
```

#### Response Example (`200 OK`)
```json
{
  "data": {
    "id": 1043,
    "user_id": 42,
    "title": "Database Migration Checklist (Verified)",
    "body": "All migration steps were successfully executed without downtime.",
    "tags": ["database", "devops", "verified"],
    "created_at": "2026-10-09T20:45:00Z",
    "updated_at": "2026-10-09T21:00:00Z"
  }
}
```

---

### 3.6 Delete Note (`DELETE /notes/{id}`)

Permanently removes the specified note and its associations in `note_tags`.

#### Request Example
```http
DELETE /api/v1/notes/1043 HTTP/1.1
Host: api.quicknotes.io
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response Example (`204 No Content`)
*(Empty response body)*

---

### 3.7 Search Notes (`GET /notes/search`)

Performs a full-text search against the user's notes using query parameter `q`.

#### Query Parameters
- `q` *(required, string)*: Search keyword.
- `limit` *(optional, integer, default: `20`)*: Results limit.

#### Response Example (`200 OK`)
```json
{
  "data": [
    {
      "id": 1042,
      "title": "System Architecture Review Notes",
      "body": "Discussed database read replica replication lag and Redis cache-aside invalidation strategy.",
      "tags": ["engineering", "architecture"],
      "created_at": "2026-10-09T18:30:00Z",
      "updated_at": "2026-10-09T19:15:00Z"
    }
  ],
  "query": "replication lag",
  "total_matches": 1
}
```

---

### 3.8 List Tags (`GET /tags`)

Returns all distinct tags associated with the authenticated user's notes, along with the count of notes tagged with each.

#### Response Example (`200 OK`)
```json
{
  "data": [
    { "id": 1, "name": "architecture", "notes_count": 8 },
    { "id": 2, "name": "database", "notes_count": 5 },
    { "id": 3, "name": "engineering", "notes_count": 14 }
  ]
}
```

---

## 4. Error Status Codes & Handling

QuickNotes returns standard HTTP error status codes. Every error response includes a unified JSON error payload to enable consistent parsing by client applications.

### Standard Error Response Schema
```json
{
  "error": {
    "code": "STRING_IDENTIFIER",
    "message": "Human-readable explanation of the error.",
    "details": [
      {
        "field": "title",
        "issue": "Title is required and cannot be empty."
      }
    ],
    "timestamp": "2026-10-09T20:50:00Z",
    "request_id": "req_8f1b2c4e8a"
  }
}
```

### Handled Error Status Codes

| Code | Status | Trigger Condition | Example Error Body |
| :--- | :--- | :--- | :--- |
| **`400`** | **Bad Request** | Malformed JSON syntax, missing required fields, or validation failure (e.g. title longer than 100 characters). | See Example 4.1 below |
| **`401`** | **Unauthorized** | Missing, invalid, or expired Bearer authentication token. | See Example 4.2 below |
| **`403`** | **Forbidden** | Valid token provided, but the user does not possess authorization to access or delete another user's note. | See Example 4.3 below |
| **`404`** | **Not Found** | The requested resource (e.g. `/notes/9999`) does not exist in the database. | See Example 4.4 below |
| **`500`** | **Internal Server Error** | Unexpected unhandled server exception, database connectivity loss, or internal dependency failure. | See Example 4.5 below |

---

### Error Examples

#### 4.1 `400 Bad Request` Example
Triggered when submitting a note with an empty title or a title exceeding 100 characters:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request payload failed input validation.",
    "details": [
      {
        "field": "title",
        "issue": "Title is required and must not exceed 100 characters (received 128 characters)."
      }
    ],
    "timestamp": "2026-10-09T20:50:00Z",
    "request_id": "req_8f1b2c4e8a"
  }
}
```

#### 4.2 `401 Unauthorized` Example
Triggered when requesting an endpoint without an `Authorization` header:
```json
{
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Missing or invalid Bearer authentication token. Please sign in.",
    "details": [],
    "timestamp": "2026-10-09T20:50:01Z",
    "request_id": "req_8f1b2c4e8b"
  }
}
```

#### 4.3 `403 Forbidden` Example
Triggered when User 42 attempts to modify or delete a note created by User 88:
```json
{
  "error": {
    "code": "ACCESS_DENIED",
    "message": "You do not have permission to view or modify note #982.",
    "details": [],
    "timestamp": "2026-10-09T20:50:02Z",
    "request_id": "req_8f1b2c4e8c"
  }
}
```

#### 4.4 `404 Not Found` Example
Triggered when querying `/api/v1/notes/999999` which does not exist:
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Note with ID #999999 could not be found.",
    "details": [],
    "timestamp": "2026-10-09T20:50:03Z",
    "request_id": "req_8f1b2c4e8d"
  }
}
```

#### 4.5 `500 Internal Server Error` Example
Triggered when an unexpected infrastructure or uncaught exception occurs:
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred while processing your request. Please try again later.",
    "details": [],
    "timestamp": "2026-10-09T20:50:04Z",
    "request_id": "req_8f1b2c4e8e"
  }
}
```
