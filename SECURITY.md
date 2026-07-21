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

## Reporting a Vulnerability
If you discover a security vulnerability within this project, please send an email to security@example.com rather than opening a public issue. We will acknowledge receipt of your report and provide a timeline for triage and resolution.
