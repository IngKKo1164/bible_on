# RAG retrieval and metadata architecture

## Core rule

Every source is stored in its own channel and linked through canonical OSIS verse IDs. Bible text,
OpenBible topics, authorized commentary, original-language tokens, and editorial cross references
must remain distinguishable so the answer layer can cite what supplied each claim.

OpenBible topics are now part of retrieval, not merely metadata attached after a passage is found.
Original-language data and dating claims remain post-retrieval evidence because they are normally
used to inspect an already selected passage rather than discover one.

## Retrieval index

`npm run data:rag-index` creates four independent semantic views:

| View | Vector unit | Link back to the Bible |
| --- | --- | --- |
| `body` | one translated verse | translation-specific passage and canonical verse IDs |
| `heading_scene` | one source heading or scene | translation-specific heading passage |
| `topic` | one OpenBible topic label | topic-to-verse reverse index |
| `commentary` | one authorized commentary record or token window | canonical verse IDs |

The same user question is also sent to BM25. Vector similarities from different views are never
treated as if they shared an absolute score scale. Each channel produces a ranked list and the
lists are combined with weighted reciprocal rank fusion (RRF).

No adjacent-passage vector is stored. Neighboring text can be loaded after a passage is selected
when the answer needs literary context, but surrounding literal wording is not treated as a proxy
for implicit meaning during retrieval.

## Query flow

1. Preserve the original question as the first retrieval hypothesis.
2. Add bounded, deterministic search hypotheses for recognized pastoral situations such as anxiety,
   guidance, hurt, grief, loneliness, failure, or guilt. These are search formulations, not answers.
3. Run BM25 against Korean heading-based passages.
4. Embed each hypothesis separately and search verse body, heading/scene, OpenBible topic, and
   authorized commentary views.
5. Resolve topic hits through `topic-links-top.json`, then map canonical verse IDs to the requested
   Korean translation.
6. Fuse the ranked candidate lists with weighted RRF and freeze that direct ranking.
7. Expand only the highest direct candidates through outgoing OpenBible editorial cross references.
   Graph-added candidates never become new seeds, so expansion is exactly one hop.
8. Load post-retrieval evidence and return every channel with its provenance to the answer layer.

There is no separate hard or soft question router in this stage. All core retrieval views run for
each hypothesis. This avoids duplicating the semantic work already done by query hypotheses and
keeps routing mistakes from suppressing useful evidence.

## Generated stores

`npm run data:rag-metadata` writes reproducible output to `data/rag/metadata/`.

| File | Unit | Purpose |
| --- | --- | --- |
| `topics.jsonl` | OpenBible topic | stable topic identity, label, and attribution |
| `topic-associations.jsonl` | topic to verse range | quality score, votes, and snapshot provenance |
| `commentary-passages.jsonl` | authorized commentary | licensed explanation linked to canonical verses |
| `original-language.jsonl` | canonical verse | TAHOT/TAGNT tokens, lemmas, Strong IDs, morphology, variants |
| `lemma-verse-index.jsonl` | Strong lemma | dynamic shared-lemma links without pairwise edge explosion |
| `dating-claims.jsonl` | sourced claim | competing date ranges without manufacturing a consensus |

OpenBible cross references remain in `data/rag/derived/cross-references.jsonl` and are typed as
`editorial_cross_reference`. Quotation, allusion, parallel, and thematic relations must not be
inferred from that label; each would need separately curated evidence.

## Authorized commentary

The repository contains the validation schema but no commentary text by default. Place authorized
records in the ignored local file `data/rag/curated/commentary-passages.jsonl`. The build accepts a
record only when it includes a precise source locator, license, rights status, and evidence of those
rights. It then expands the canonical reference range and includes the text in the commentary vector
view. Missing input produces an empty, valid commentary channel rather than invented explanation.

```json
{"schemaVersion":1,"type":"authorized_commentary","id":"publisher:work:gen-1-1","reference":{"start":"Gen.1.1","end":"Gen.1.1"},"title":"Section title","content":"Authorized text","source":{"title":"Work title","locator":"p. 10","license":"Contract name"},"rights":{"status":"licensed","evidence":"Contract or approval reference"}}
```

## Post-retrieval metadata

`metadata-repository.mjs` always makes topics, commentary, and editorial relations available.
Original-language records are added for questions about Hebrew, Greek, lemmas, morphology, or
Strong numbers. Dating claims are added only for dating, composition, redaction, or manuscript
questions. Callers can override this with `--metadata=all`, an explicit channel list, or
`--metadata=none`.

`data/rag/curated/dating-claims.jsonl` remains empty until approved scholarly sources are selected.
A claim must include a scope, date type, range, viewpoint, confidence, and precise source locator.
Multiple records may cover the same passage; the build never merges them into one allegedly certain
date.

## LangChain and LangGraph

Neither package is needed for this deterministic retrieval pipeline. LangChain can later wrap the
retriever when a model provider is connected and standard document or tool interfaces become useful.
LangGraph becomes valuable when generation gains durable conversation state, retries, human review,
or a citation-verification loop. The custom BM25, multi-view retrieval, RRF, and graph expansion can
remain unchanged beneath either framework.

## Commands

```powershell
npm run data:download
npm run data:rag-build
npm run data:rag-metadata
npm run data:rag-validate
npm run data:rag-metadata-validate
npm run data:rag-index
npm run data:rag-index-validate
npm run rag:evaluate
npm run rag:query -- --metadata=auto "교회 사람에게 상처받았을 때 읽을 말씀"
```
