# Development branches

BibleOn uses two active development branches in addition to the stable `main` branch:

- `design`: UI, UX, Bible reading, church, messaging, onboarding, API, authentication,
  persistence, real-time delivery, workers, infrastructure, and other product work
- `rag-chatbot`: source acquisition, parsing, indexing, retrieval, evaluation, chatbot,
  model API integration, and RAG-specific server work

Keep commits scoped to one branch. General server code belongs to `design`; only server
code that is specific to retrieval, chatbot orchestration, or model providers belongs to
`rag-chatbot`. Merge each branch into `main` independently after its own review and
verification; do not merge development branches directly into one another.
