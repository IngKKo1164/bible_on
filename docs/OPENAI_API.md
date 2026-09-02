# OpenAI API integration

## Account and model

BibleOn uses an API Platform project key owned by the developer, not a ChatGPT browser session or
an end user's OpenAI login. To keep the API under the same OpenAI identity, sign in to the API
Platform with the same OpenAI account, create a dedicated `BibleOn` project, configure API billing,
and create a project-scoped secret key.

The default model is `gpt-5.6-luna`, selected for cost-sensitive workloads. Override it with
`OPENAI_CHAT_MODEL` only after running retrieval and answer-quality evaluations against the candidate
model.

Official references:

- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://platform.openai.com/docs/quickstart/make-your-first-api-request

## Local setup

Create an ignored `.env` file from `.env.example` and set the secret locally:

```dotenv
OPENAI_API_KEY=your-project-key
OPENAI_CHAT_MODEL=gpt-5.6-luna
```

Never put the key in a `VITE_` variable, browser storage, source file, Git commit, mobile binary, or
chat message. `npm run dev` starts both Vite and the local server-only API. The browser calls
`/api/ai/chat`; Vite proxies it to `127.0.0.1:8787`.

The retrieval pipeline can also be exercised directly:

```powershell
npm run rag:chat -- "불안할 때 읽을 말씀을 찾아줘"
```

## Request lifecycle

1. The server authenticates the BibleOn user and consumes a per-user quota.
2. LangGraph loads the thread checkpoint and asks the contextual planner whether retrieval is needed.
3. The planner uses a Structured Output call for a bounded search plan.
4. The local retriever searches Bible text, headings, OpenBible topics, authorized commentary, and
   one-hop cross references.
5. The answer call receives only the selected evidence and returns Korean text plus passage IDs.
6. Unknown passage IDs are removed, citations are reloaded from the licensed local corpus, and the
   completed turn is persisted idempotently.

Both OpenAI requests set `store: false`; BibleOn owns the durable conversation state. A simple
acknowledgement is answered locally and makes no OpenAI call.

## Production requirements

`server/dev-server.mjs` is deliberately blocked in production. Integrate
`createBibleChatApiHandler()` into the real authenticated server and provide both callbacks:

- `authenticateRequest`: returns the verified BibleOn `userId`; never trust a body or arbitrary
  header for identity.
- `consumeQuota`: atomically enforces per-user/per-IP rate limits and subscription allowances before
  invoking the model.

Keep the API and web app on the same origin, validate CSRF protections when cookie authentication is
used, place `OPENAI_API_KEY` and `DATABASE_URL` in the deployment secret manager, use a dedicated
OpenAI project with spend alerts, and rotate the project key if it is ever exposed. The API key pays
for every app user's model usage; app users do not supply their own OpenAI account.
