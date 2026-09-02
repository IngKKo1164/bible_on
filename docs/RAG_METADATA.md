# RAG metadata architecture

## Principle

Bible passages remain the only text embedded for semantic retrieval. Every passage already carries
canonical OSIS `verseIds`; topic, original-language, relation, and dating records are stored
separately and joined through those IDs after retrieval.

This avoids four problems:

- the same metadata being copied into both Korean translations and every heading-based passage;
- long metadata fields distorting the semantic embedding of the Bible text;
- a source update requiring the full passage/vector index to be rebuilt;
- uncertain claims, especially dating and allusion claims, appearing to be part of the Bible text.

## Generated stores

`npm run data:rag-metadata` writes local, reproducible output to `data/rag/metadata/`.

| File | Unit | Purpose |
| --- | --- | --- |
| `topics.jsonl` | OpenBible topic | Stable topic identity and attribution |
| `topic-associations.jsonl` | topic to verse range | Quality score, votes, snapshot provenance |
| `original-language.jsonl` | canonical verse | TAHOT/TAGNT token arrays with surface, lemma, Strong, morphology, and variants |
| `lemma-verse-index.jsonl` | Strong lemma | Dynamic `shared_lemma` links without a pairwise edge explosion |
| `dating-claims.jsonl` | sourced claim | Multiple competing date ranges without manufacturing a consensus |

OpenBible cross references remain in `data/rag/derived/cross-references.jsonl` and are explicitly
typed as `editorial_cross_reference`. Quotation, allusion, parallel, and thematic relations must not
be inferred from that label; they require their own curated evidence later.

## Query flow

1. BM25 and local E5 retrieve a Korean heading-based passage.
2. One-hop OpenBible graph expansion may add related candidate passages.
3. The final passage `verseIds` are passed to `metadata-repository.mjs`.
4. A deterministic intent selector loads only the needed channels.
5. The answer layer receives Bible text and attributed metadata as distinct fields.

The current selector always includes topics and editorial relations. Original-language data is
added for questions mentioning original languages, lemmas, morphology, or Strong numbers. Dating
claims are added only for dating, composition, redaction, or manuscript questions. The caller can
override this with `--metadata=all`, an explicit channel list, or `--metadata=none`.

## Dating claims

`data/rag/curated/dating-claims.jsonl` is intentionally empty until an approved scholarly source is
selected. A claim must include a scope, date type, range, viewpoint, confidence, and precise source
locator. Multiple records may cover the same passage.

```json
{"schemaVersion":1,"type":"dating_claim","id":"source-id:claim-id","scope":{"kind":"book","start":"Gen.1.1","end":"Gen.50.26"},"dateType":"composition","range":{"earliestYear":-600,"latestYear":-400,"convention":"negative_bce_positive_ce"},"viewpoint":"Name of the represented position","confidence":"unspecified","source":{"title":"Bibliographic title","locator":"p. 10"}}
```

The build rejects unsourced claims and never combines competing ranges into one supposedly correct
date.

## LangChain and LangGraph

Neither package is required for the current deterministic corpus and retrieval pipeline, so neither
is installed yet.

LangChain becomes useful when a real model provider is connected. The existing hybrid retriever can
be wrapped as a custom retriever that accepts a string and returns document objects; model switching,
structured output, prompt templates, and tool schemas can then use its standard interfaces without
replacing the custom BM25/E5/graph implementation.

LangGraph becomes useful when the answer workflow is stateful or branches by intent. A likely graph
is:

```text
classify intent
  -> retrieve Bible passages
  -> fetch topic/original/relation/dating channels in parallel
  -> assemble attributed context
  -> generate
  -> verify every citation
  -> retry retrieval or return
```

Add LangGraph when the app needs durable conversation state, resumable execution, streaming,
human review, or citation-verification retries. Until then, ordinary functions are smaller and easier
to test. LangGraph can be adopted independently of LangChain, so this decision does not lock the
project into either framework.

Official references:

- <https://docs.langchain.com/oss/javascript/langchain/overview>
- <https://docs.langchain.com/oss/javascript/integrations/retrievers/index>
- <https://docs.langchain.com/oss/javascript/langgraph/overview>
- <https://docs.langchain.com/oss/javascript/langgraph/persistence>
- <https://docs.langchain.com/oss/javascript/langgraph/workflows-agents>

## Commands

```powershell
npm run data:download
npm run data:rag-build
npm run data:rag-metadata
npm run data:rag-validate
npm run data:rag-metadata-validate
npm run rag:query -- --metadata=auto "창세기 1장의 히브리어 원어를 보여줘"
```
