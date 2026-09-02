# BibleOn server

This directory is reserved for BibleOn server code. The initial architecture and delivery
plan live in [docs/SERVER_DESIGN.md](../docs/SERVER_DESIGN.md).

## Working boundary

General server work is implemented on the `design` branch. This directory owns:

- API contracts and server-side domain logic
- authentication, authorization, and church tenancy
- database schema, migrations, queues, and workers
- real-time messaging and notification delivery
- server tests, observability, deployment, and operational documentation

RAG ingestion, retrieval, chatbot orchestration, citation validation, and model-provider
integration belong to the `rag-chatbot` branch. Keep the boundary explicit through API
contracts so those changes do not require edits to unrelated UI or community modules.

## Implementation gate

Do not ingest, embed, back up, or serve licensed Korean Bible text from the server until
the written license explicitly covers those uses. Until then, the server may store only
canonical references and source metadata while the approved client distribution remains
unchanged.
