# BibleOn server design

Status: initial design based on the current React prototype  
Branch: `design` (RAG-specific server components remain on `rag-chatbot`)  
Last reviewed: 2026-09-02

## 1. Goal and boundary

The current repository is a Vite/React prototype. Almost all user, church, chat, and
reading data exists as hard-coded constants, component state, or browser local storage.
The server must turn those flows into authenticated, durable, multi-device, church-aware
product behavior while keeping RAG-specific ingestion, retrieval, and model integration
isolated on the `rag-chatbot` branch.

The first production shape should be a modular monolith rather than independent
microservices. Authentication, membership, community, reading state, and messaging have
strong transactional relationships. RAG workers and real-time connections run as separate
processes but share contracts and domain modules with the API.

## 2. Findings from the code audit

| Current client area | Current behavior | Required server responsibility | Priority |
| --- | --- | --- | --- |
| `OnboardingApp` | Email and four social choices only advance local UI state | Account creation, OAuth exchange, email verification, sessions, agreements, onboarding transaction | P0 |
| `churchData.js` | Five churches are hard-coded and searched in memory | Verified registry, normalized search, membership request/invite, approval, tenant isolation | P0 |
| Bible loading | Every book in both translations is eagerly downloaded | Manifest/version/cache policy; gated chapter API only if its license permits server delivery | P0 |
| Notes and highlights | Notes, highlights, recent passages, and profile use local storage | Per-user sync, conflict/version handling, soft deletion, export and account deletion | P0 |
| Home RAG chat | A question receives delayed test text; rooms use local storage | Persistent conversations, retrieval, model secrets, streaming, citations, safety, limits, retention | P0 |
| Church home | Church, service, notice, member, and QT data is hard-coded | Church-scoped content, roles, post/reaction moderation, service plans and notices | P1 |
| Messages | Direct/group rooms, invites, unread state, and settings are local arrays | Authorized rooms, ordered messages, read cursors, history visibility, WebSocket, abuse controls | P1 |
| Notifications | Read/delete and alert toggles are component state | Durable inbox, preferences, push tokens, fan-out and delivery receipts | P1 |
| Profile image | Image becomes a base64 browser value | Signed upload, MIME/size validation, processing, lifecycle cleanup | P1 |
| Reading statistics | Streaks, activity, roadmap, and counts are sample values | Reading events, daily aggregates, timezone streaks, bookmarks, roadmap state | P2 |
| Subscription | A fixed monthly price has no entitlement check | Product catalog, verified billing webhooks, entitlement and feature gates | P2 |
| Recommendations | Keyword/tag sorting runs in the component | Versioned rules first; ranking worker only after enough consented data exists | P2 |

Client-only behavior that stays client-side includes layout, gestures, picker state, visual
highlight geometry, optimistic rendering, and transient form drafts.

## 3. Proposed architecture

    React / future clients
             |
       HTTPS / WebSocket
             |
    TypeScript API modular monolith
    auth | users | churches | reading | community | chat | notifications
             |
      PostgreSQL + Redis
             |
    RAG / push / media workers
       |                 |
    LLM/embed       object storage

PostgreSQL vector search and licensed Korean text are enabled only after the content
license permits server storage and derived embeddings.

### Runtime choices

- Node.js with TypeScript, matching the repository toolchain.
- Fastify-style HTTP server with schema validation and OpenAPI generation. The precise
  framework may change without changing the domain boundaries below.
- PostgreSQL as the source of truth. Constraints enforce tenant membership, message
  ordering, unique reactions, and idempotency.
- Redis only for disposable state: rate limits, presence, short locks, cache, jobs, and
  WebSocket fan-out. No user record exists only in Redis.
- S3-compatible storage for avatars and future attachments through short-lived signed URLs.
- REST/JSON for normal operations, Server-Sent Events for RAG answers, and WebSocket for
  chat and notification events.

### Suggested layout

    server/
      src/
        app.ts
        config/
        platform/          # database, Redis, queue, storage, telemetry
        modules/
          auth/
          users/
          churches/
          bible/
          reading/
          rag/
          community/
          messaging/
          notifications/
          billing/
        realtime/
        workers/
      migrations/
      test/
      openapi/

Modules call another module only through its public service interface. HTTP handlers stay
thin: validate, authorize, call one use case, and map the result. Database rows are never
returned directly as API payloads.

## 4. Authentication and tenant authorization

### Authentication

- Email sign-up stores an Argon2id hash, verifies email ownership, records terms/privacy
  versions, and applies IP- and identity-based rate limits.
- Apple, Kakao, Naver, and Google are external identities linked to one user. Provider
  tokens are verified server-side and never become BibleOn access tokens.
- Access tokens are short-lived. Refresh tokens are opaque, rotated on every use, stored
  hashed, grouped into a session family, and revoked on reuse detection or logout.
- Account linking requires fresh proof from both identities. Equal email text alone never
  merges accounts.

### Church tenancy and roles

Every church-owned row contains `church_id`. Access is based on an active membership,
never merely on a church ID from the client.

- `member`: read permitted church content and post within allowed scope.
- `leader`: member abilities plus department content and moderation.
- `church_admin`: membership approval, departments, notices, services, and moderation.
- `platform_admin`: verified registry and support; never implied by a church role.

Membership state is separate from role: `pending`, `active`, `rejected`, `suspended`, or
`left`. Church search returns only public registry fields. The member directory requires an
active same-church membership and honors profile privacy settings.

## 5. Core data model

Public IDs should be non-sequential, such as UUIDv7. Mutable records carry timestamps and
an integer version where clients need conflict detection. Times use UTC; user and church
timezones are explicit IANA identifiers.

| Aggregate | Main records and invariants |
| --- | --- |
| Identity | `users`, `external_identities`, `email_verifications`, `sessions`, `agreements`; provider subject is unique per provider |
| Profile | `profiles`, `user_preferences`, `media_assets`; visibility is server-enforced |
| Church | `churches`, `departments`, `memberships`, `membership_roles`; only verified churches appear in onboarding |
| Bible catalog | `translations`, `books`, `verses`, `content_licenses`; canonical reference includes translation, book, chapter, and verse/range |
| Reading | `reading_events`, `recent_passages`, `verse_annotations`, `reading_goals`; annotation kind is note, highlight, or bookmark |
| RAG | `rag_conversations`, `rag_messages`, `rag_citations`, `source_documents`, `source_chunks`; completed answers retain source revision |
| Church content | `service_plans`, `notices`, `community_posts`, `post_reactions`; one reaction per actor/post/type |
| Messaging | `conversations`, `conversation_participants`, `messages`; sequence is unique and increasing within a conversation |
| Notification | `notifications`, `notification_preferences`, `device_tokens`, `delivery_attempts`; device tokens are encrypted |
| Commerce | `products`, `subscriptions`, `entitlements`, `billing_events`; provider event ID is unique |
| Governance | `audit_logs`, `moderation_cases`, `data_export_jobs`, `deletion_jobs`; audit rows are append-only |

For group chat, `conversation_participants.joined_sequence` controls which history a new
member may read. `last_read_sequence` calculates unread counts without one read row per
message. A direct conversation has a canonical participant-set key so concurrent requests
cannot create duplicate one-to-one rooms.

## 6. HTTP and event contract

All routes are under `/v1`. Cursor pagination is required for mutable feeds and message
lists. Mobile mutations accept `Idempotency-Key`. Errors have a stable shape:

    {
      "error": {
        "code": "membership_required",
        "message": "An active church membership is required.",
        "requestId": "...",
        "details": {}
      }
    }

### P0 endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /v1/auth/email/sign-up` | Create pending account and send verification |
| `POST /v1/auth/email/sign-in` | Start a session |
| `POST /v1/auth/oauth/exchange` | Verify provider result and start/link an account |
| `POST /v1/auth/refresh`, `POST /v1/auth/logout` | Rotate or revoke a session |
| `GET /v1/me`, `PATCH /v1/me/profile` | Current user and profile |
| `PUT /v1/me/onboarding` | Save church choice, interests, pace, and agreement versions atomically |
| `GET /v1/churches?query=` | Search verified public church directory |
| `POST /v1/churches/:id/membership-requests` | Request or redeem membership invitation |
| `GET /v1/bible/manifest` | Translation/book/version/cache metadata |
| `GET /v1/bible/:translation/books/:book/chapters/:chapter` | Licensed chapter delivery when enabled |
| `GET /v1/me/reading-state?updatedAfter=` | Incremental recent-passage and annotation sync |
| `PUT /v1/me/annotations/:canonicalRef` | Upsert versioned note/highlight/bookmark |
| `DELETE /v1/me/annotations/:canonicalRef` | Tombstone annotation for cross-device sync |
| `POST /v1/rag/conversations` | Create a RAG conversation |
| `GET /v1/rag/conversations` | List cursor-paginated active/deleted history |
| `POST /v1/rag/conversations/:id/messages` | Ask question; SSE streams answer and final citations |
| `DELETE /v1/rag/conversations/:id` | Soft-delete with configured retention |

### P1 endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /v1/churches/:id/home` | Aggregated summary, service, notices, and counters |
| `GET /v1/churches/:id/members` | Authorized privacy-filtered directory search |
| `GET/POST /v1/churches/:id/posts` | QT/community feed and creation |
| `PUT/DELETE /v1/posts/:id/reactions/:type` | Idempotent reaction update |
| `GET/POST /v1/conversations` | List or create direct/group conversations |
| `GET/POST /v1/conversations/:id/messages` | Cursor history or idempotent send |
| `POST /v1/conversations/:id/participants` | Invite members and record join sequence |
| `PATCH /v1/conversations/:id/me` | Read cursor, favorite, notification preference |
| `GET /v1/notifications` | Durable notification inbox |
| `PATCH /v1/notifications/:id`, `POST /v1/notifications/read-all` | Read/archive state |
| `POST /v1/me/avatar-upload` | Issue constrained signed upload |
| `POST /v1/devices` | Register or rotate a push token |

### WebSocket events

Authenticate during connection setup and re-authorize every subscription. The server emits
`message.created`, `conversation.updated`, `typing.changed`, `presence.changed`, and
`notification.created`. Client commands carry a unique command ID and receive `ack` or a
structured error. WebSocket is a live optimization; reconnection catches up from REST
cursors.

## 7. RAG design

RAG runs server-side because model credentials, prompt policy, licensed retrieval, rate
limits, and audit data cannot be trusted to the browser.

1. Authenticate, apply entitlement and user/IP limits, and classify abuse or urgent safety
   content.
2. Normalize the question while preserving original text and conversation context.
3. Retrieve by canonical verse IDs with hybrid lexical/vector search and cross-reference
   expansion. Filter candidates by translation license and entitlement.
4. Rerank a small set and build a prompt only from immutable, licensed source chunks.
5. Stream answer tokens, then send citations after verifying each reference exists and was
   actually retrieved.
6. Persist policy/model versions, retrieval IDs and scores, latency, usage, safety result,
   final answer, and citation snapshots.

The model must not invent Bible text. When retrieval is insufficient it says so and offers
verified passages rather than fabricating a quotation. Answers are study support, not a
replacement for professional medical, legal, crisis, or clergy care.

The source rules in `data/rag/SOURCES.md` remain authoritative. Every derived chunk retains
source ID, revision, license, attribution, canonical reference, and normalization version.
Hebrew data preserves its source Unicode normalization.

## 8. Reading-state sync

Local storage remains useful as an offline cache but cannot be the source of truth after
sign-in. Use this incremental sync protocol:

- The client generates stable mutation IDs and includes its last server cursor.
- The server applies unseen mutations transactionally and returns changes after the cursor.
- Notes use optimistic concurrency through `version`. Conflicting non-empty note edits are
  returned for explicit resolution instead of silent last-write-wins.
- Highlights, bookmarks, recent passages, and preferences may use last-write-wins with
  server timestamps.
- Deletes create tombstones retained long enough for all devices to observe them.
- Reading events are append-only and deduplicated by mutation ID. Daily streaks derive from
  the user's timezone.

A one-time migration endpoint can accept the current local-storage schema after account
creation. It is idempotent and never overwrites newer server values.

## 9. Security, privacy, and governance

- Validate at the transport boundary and authorize again inside the use case. Never trust
  `user_id`, `church_id`, role, sender, or message sequence from the client.
- Parameterize database access. Escape user content on output and sanitize any future rich
  text on input.
- Apply CSRF protection with cookie authentication. Otherwise keep access tokens out of
  browser local storage and define secure native/web token handling separately.
- Encrypt transport, secrets, provider/device tokens, and sensitive backups. Use managed
  secret storage and key rotation.
- Enforce avatar type, decoded size, dimensions, malware scan, and metadata stripping.
- Rate-limit sign-in, church/member search, posting, messaging, media upload, and RAG.
- Keep append-only audit records for admin, membership, moderation, export/deletion,
  billing, and license changes. Never log passwords, tokens, or raw private messages.
- Define retention separately for active messages, deleted RAG chats, audit records,
  backups, and delivery telemetry. Account deletion covers PostgreSQL, object storage,
  vector index, queues, and backups according to policy.
- Church member data and private messages are not training data by default. Any future use
  requires separate explicit consent and de-identification.

## 10. Reliability and observability

- `/health/live` reports process health; `/health/ready` checks critical dependencies.
- Every request has a request ID and every job/event has a correlation ID. Structured logs,
  metrics, and traces exclude message bodies and secrets.
- Initial objectives: 99.9% monthly API availability; p95 below 300 ms for normal reads
  excluding providers; message acknowledgement only after durable commit.
- Jobs use bounded exponential retry and a dead-letter path. Workers are idempotent.
- Backups support point-in-time recovery and routine restore tests. Migrations use
  expand/migrate/contract steps so old and new API versions can overlap safely.

## 11. Delivery plan

### Phase 0 — foundation

1. Create the TypeScript package, configuration validation, local containers, structured
   logging, health routes, test harness, and CI checks.
2. Add PostgreSQL migrations for users, identities, sessions, churches, departments,
   memberships, profiles, agreements, and audit logs.
3. Generate and review the initial OpenAPI contract before client integration.

Exit: a clean database migrates, the API starts, health checks pass, and CI runs unit and
integration tests without external credentials.

### Phase 1 — identity and onboarding

Implement email auth, one OAuth provider end-to-end, verified church search, membership
request, onboarding transaction, current-user profile, session rotation, and audit trail.

Exit: a user creates an account, resumes on another device, finishes onboarding, and cannot
read another church's private data.

### Phase 2 — Bible state and RAG

Implement manifest/versioning, annotation and reading sync, local-data migration, RAG
persistence, ingestion provenance, hybrid retrieval, validated citations, streaming,
deletion retention, evaluation fixtures, and safety/rate limits.

Exit: note conflicts are covered by tests; every citation maps to a stored retrieved source;
license-disabled translations cannot be ingested or served.

### Phase 3 — church community

Implement church home aggregation, notices, services, directory privacy, posts, reactions,
moderation, and signed avatar upload.

Exit: tenant-isolation tests cover every church-scoped query and mutation.

### Phase 4 — messaging and notifications

Implement conversation creation, participant joins, ordered messages, read cursors, search,
WebSocket fan-out, durable notifications, push delivery, and abuse controls.

Exit: reconnect catch-up, concurrent sends, invite history visibility, unread counts, and
revoked-membership behavior pass integration tests.

### Phase 5 — roadmap and commerce

Implement reading goals/streak aggregates, recommendation rules, billing webhooks,
entitlements, admin operations, export, and account deletion.

## 12. Decisions required before production

These do not block Phase 0, but must be resolved before the affected module ships:

1. Exact Korean Bible license scope for server storage, CDN/API delivery, search indexing,
   embeddings, model prompts, logs, backups, and citation display.
2. Whether church membership is admin-approved, invitation-only, domain-verified, or a
   combination, and who sees the directory by default.
3. Retention periods for messages, deleted RAG chats, notifications, audit records, and
   backups, including legal-hold behavior.
4. First production identity providers and the web/native redirect model.
5. Billing provider, supported stores, refund/grace-period rules, and tax display.

## 13. First implementation slice

The next server-only change should implement Phase 0 plus the smallest Phase 1 vertical
slice: health check -> migration -> email sign-up -> current user -> church search ->
onboarding completion. This validates configuration, transactions, authentication, tenant
rules, OpenAPI generation, and integration tests before RAG or real-time messaging adds
operational complexity.
