# Conversational RAG with LangGraph

## Purpose

The conversation workflow and the Bible retrieval corpus have different lifecycles. LangGraph stores
small, resumable conversation state while the retriever remains the authority for Bible passages,
topics, original-language records, commentary, and cross references.

The workflow runs in Node.js on the server. It must not be imported into the Vite browser bundle,
because PostgreSQL credentials and model-provider secrets are server-only.

## Graph

```text
START -> prepare_turn -> plan_contextual_query
  none     -> skip_retrieval ---------------------------> generate_answer
  reuse    -> reuse_evidence ---------> verify_evidence -> generate_answer
  metadata -> select_metadata_evidence -> verify_evidence -> generate_answer
  anchored -> anchored_search --------> verify_evidence -> generate_answer
                                           | no expansion
                                           +-> global_search -> verify_evidence
  global   -> global_search -----------> verify_evidence -> generate_answer
  clarify  -> interrupt -> reuse_evidence -> verify_evidence -> generate_answer
generate_answer -> persist_turn -> END
```

`query-planner.mjs` includes a deterministic planner for local tests and a `generatePlan` boundary
for a future structured-output LLM. The planner receives the current question, bounded recent turns,
the active topic, and passage IDs. Conversation text is treated as untrusted context, never as Bible
evidence. The original question remains the first search hypothesis; contextual reformulations are
additional hypotheses.

## Adaptive retrieval

| Action | Behavior |
| --- | --- |
| `none` | Acknowledgement or conversational turn; no corpus call |
| `reuse` | Reload the active passage IDs without semantic search |
| `metadata` | Reload active passages and request only query-relevant metadata at generation time |
| `anchored` | Search with active passages as anchors, including one-hop cross references |
| `global` | Run the complete multi-view corpus search |
| `clarify` | Pause with a LangGraph interrupt until one candidate passage is selected |

Only IDs and compact retrieval traces enter checkpoints. Passage text, vectors, original-language
tokens, and licensed commentary are reloaded from their source stores for generation.

## PostgreSQL boundaries

Production uses one PostgreSQL database with separate ownership boundaries:

- `bibleon_langgraph`: internal LangGraph checkpoints, created by `PostgresSaver.setup()`.
- `bibleon`: product-facing threads, messages, citations, and retrieval audit records from
  `database/migrations/001_bible_chat.sql`.

The checkpoint is not the user-visible chat history. Application writes must be idempotent on
`(thread_id, turn_id, role)` because a durable graph node may be replayed after a retry. The API layer
must verify `owner_user_id` on every thread operation and should use a restricted database role,
TLS, encrypted backups, retention rules, and secret-manager supplied credentials in production.
The API should also serialize or reject overlapping runs for the same `thread_id` so two user turns
cannot race to update one checkpoint.

## Setup

1. Apply `database/migrations/001_bible_chat.sql` with the deployment migration tool.
2. Set `DATABASE_URL` and optionally `LANGGRAPH_CHECKPOINT_SCHEMA` in the server environment.
3. Run `npm run db:langgraph-setup` once as a release or migration job.
4. Create the runtime checkpointer without `setup: true`; schema setup should not run on every request.

Development and tests use `MemorySaver`. Production fails closed when `DATABASE_URL` is absent and
does not silently fall back to in-memory state.

## Integration surface

`createBibleChatGraph()` accepts the existing hybrid retriever, optional metadata repository, a
planner, answer generator, and an idempotent `onTurnComplete` persistence callback. Until a model
provider is connected, the default answer remains `Test 중입니다.`. The graph can therefore be
integration-tested now without API spend while preserving the final orchestration and database shape.

`postgres-conversation-repository.mjs` supplies the production callback. Bind `threadId` and the
authenticated `ownerUserId` in the server request handler, then pass the resulting handler to the
graph. Its transaction upserts both messages, citations, and the compact retrieval audit by `turnId`;
the ownership guard prevents a conflicting thread ID from being attached to another user.

The OpenAI Responses API adapter, low-cost default model, local API bridge, and production security
requirements are documented in `docs/OPENAI_API.md`.
