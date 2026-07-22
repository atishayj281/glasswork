# Security Policy

## Overview
Aegis Pipeline Studio is designed with data privacy and security as top priorities. This document describes the details of what data is processed, where it is stored, how user data is isolated, and how security vulnerabilities should be reported.

---

## Data Sent to the LLM
To ensure user data privacy, **Aegis never sends raw row data to the LLM**. 

Only dataset metadata (column names, inferred data types, null percentage, and row count) is shared with the LLM. 
* **Exact Code Path:** The metadata payload is extracted via the `DatasetProfile` model, formatted using the helper function `_profile_context` in [agent.py](file:///d:/Users/Projects/aegis-pipeline-studio/backend/app/services/agent.py#L109), and injected into the LLM system prompt in [agent.py](file:///d:/Users/Projects/aegis-pipeline-studio/backend/app/services/agent.py#L205).

---

## Storage Architecture
Data is stored using a dual-storage setup to minimize cost while ensuring durability and fast local query speeds:

1. **Google Cloud Firestore (Metadata & Auth)**:
   * Stores user authentication details, chat messages, pipeline visual structure (steps, edges), and execution status/metadata.
   * Path: [session.py](file:///d:/Users/Projects/aegis-pipeline-studio/backend/app/services/session.py) (`save` and `get` methods).
2. **Supabase Storage (Raw File Bytes)**:
   * Stores the raw uploaded files and generated Parquet format datasets under user-specific prefixes (e.g., `users/{uid}/uploads/` and `sessions/{session_id}/data.parquet`).
   * Bypasses client-side access constraints using service-role authentication on ingestion.
3. **Local Server Disk (Cache)**:
   * Acts as a fast ephemeral cache layer. Parquet files are cached locally for execution of the pandas data pipeline. If a file is not found locally (e.g., in a multi-instance server environment), it is downloaded from Supabase Storage on-demand.
   * Path: [session.py](file:///d:/Users/Projects/aegis-pipeline-studio/backend/app/services/session.py) (`load_dataframe`).

---

## Session Lifecycle and TTL (Time-To-Live)
* **TTL duration**: Sessions are set to expire after a configurable number of hours (default: `24` hours), defined by the `SESSION_TTL_HOURS` environment variable in [config.py](file:///d:/Users/Projects/aegis-pipeline-studio/backend/app/config.py#L12).
* **Deletion behavior**: When a session is explicitly deleted, or when expired sessions are purged, Aegis removes all related data from all three locations:
  1. Local parquet file is deleted.
  2. Firestore document is deleted.
  3. Supabase Storage object is deleted.
  * Path: [session.py](file:///d:/Users/Projects/aegis-pipeline-studio/backend/app/services/session.py) (`delete` method).

---

## Webhook Authentication & Security Model

Persistent Saved Pipelines expose an unauthenticated trigger endpoint (`POST /api/webhooks/{pipeline_id}/trigger`) designed for external automated tool integration (n8n, Zapier, cron, custom backends).

### 1. Secret-Based Authentication (Not Session-Based)
* **Auth Header**: Webhooks are authorized via the `X-Webhook-Secret` HTTP header rather than user session tokens or Firebase Bearer tokens.
* **Secret Generation**: Raw secrets are generated server-side using cryptographically secure random tokens (`secrets.token_urlsafe(32)`).
* **SHA-256 Hashing at Rest**: Aegis stores **only the SHA-256 hash** of the secret (`secret_hash`) in the database. The raw secret string is displayed **only once** to the owner upon creation or secret rotation and is never logged or returned in subsequent `GET` requests.
* **Timing Attack Prevention**: Secret verification uses constant-time comparison (`secrets.compare_digest`) to prevent timing side-channel attacks.
* **IDOR & Enumeration Prevention**: Any request with a missing header, invalid secret, inactive pipeline, or non-existent pipeline ID receives the exact same response: `404 Not Found (detail="Pipeline not found")`.
* **Rate Limiting**: Webhook triggers are rate-limited per pipeline ID (`webhook_{pipeline_id}`) using a token bucket limiter to prevent denial-of-service or brute-force attempts.

---

## Data Returned on Webhook Triggers (Data Scope)

It is important to distinguish between **Data Sent to the LLM** and **Data Returned to Webhook Callers**:

1. **Data Sent to the LLM (Metadata Only)**:
   * During chat conversation and pipeline generation, Aegis strictly sends **only dataset metadata** (column names, types, null rates, row count) to the external LLM provider. Raw row data is **never** sent to the LLM.

2. **Data Returned to Webhook Callers (Transformed Output Data)**:
   * The "metadata only to the LLM" restriction does **NOT** apply to the HTTP response returned to a valid webhook caller.
   * When an external service posts a data file to `POST /api/webhooks/{pipeline_id}/trigger` with a valid `X-Webhook-Secret`, Aegis executes the saved pipeline locally using pandas and **returns the actual transformed dataset output rows (`preview`), columns, row count, Plotly chart figures, and step execution logs** back to the webhook caller in the HTTP response body.
   * This behavior is intentional, allowing external automation workflows to consume the transformed business data.

---

## Reporting a Vulnerability
If you discover a security vulnerability within this project, please send an email to security@example.com rather than opening a public issue. We will acknowledge receipt of your report and provide a timeline for triage and resolution.

