# RAG source data

This directory contains the reproducible acquisition setup for BibleOn's RAG corpus.
The downloaded source files are intentionally excluded from Git because the extracted
datasets are large and upstream sources can change independently of application code.

## Download

From the repository root, run:

```powershell
npm run data:download
```

Use `-Force` to replace existing downloads with the pinned source revisions. The script
records SHA-256 hashes in `data/rag/raw/download-manifest.json`.

## Local layout

- `raw/original/ot-hebrew-oshb`: Open Scriptures Hebrew Bible (WLC with morphology)
- `raw/original/nt-greek-nestle1904`: Nestle 1904 Greek NT morphology CSV
- `raw/stepbible`: full pinned STEPBible Data repository snapshot
- `raw/cross-references/openbible`: OpenBible.info cross-reference dataset
- `raw/_archives`: downloaded source archives used for reproducibility

Read `SOURCES.md` before transforming or publishing any corpus. Production ingestion
must retain source identity and attribution on every generated chunk or document.

## Build the retrieval corpus

After downloading and validating the source data, build and verify the local retrieval
documents:

```powershell
npm run test:rag
npm run data:rag-build
npm run data:rag-validate
```

The generated files live under `data/rag/derived` and are excluded from Git because they
contain licensed Korean Bible text:

- `verses.jsonl`: translation-specific verse records with canonical OSIS verse IDs
- `passages.jsonl`: embedding candidates split only at chapter and source-heading boundaries
- `cross-references.jsonl`: OpenBible references stored as weighted canonical range edges
- `manifest.json`: source paths, chunking policy, counts, and output hashes

Passages never cross a chapter. A source heading starts a new passage; text before the
first heading remains a heading-free chapter-start passage. Chapters without headings
remain one passage rather than being split at an arbitrary token count. Combined verse
labels preserve one source record while exposing every covered canonical verse ID. If a
heading occurs in the middle of a verse, passage `contentSegments` split that verse's text
at the exact heading position while both passages retain the same canonical verse citation.

Cross references are not embedded as prose. Non-positive vote edges are retained for
provenance but marked inactive, and positive weights use `log(1 + votes)` so highly voted
edges do not overwhelm retrieval. Range endpoints remain ranges until query-time context
assembly.

## Build and query the local search index

Build the hybrid retrieval index after the corpus validation succeeds:

```powershell
npm run data:rag-index
npm run data:rag-index-validate
npm run rag:query -- --translation=RNKSV "불안할 때 읽을 말씀"
npm run rag:evaluate
```

The local-only files under `data/rag/index` combine Korean BM25 retrieval, normalized
multilingual E5 embeddings, and a compact top-voted OpenBible adjacency index. The source
heading passage remains the semantic result and citation unit. Passages that exceed the
embedding model limit are split into technical vector windows only; a matching window is
always collapsed back to its original passage before ranking or display.

The pinned `Xenova/multilingual-e5-small` q8 model is cached under `data/rag/models`. Query
and passage prefixes follow the upstream E5 model contract. Retrieval uses channel-confidence
fusion for BM25 and vector candidates, preserving a strong exact match from either
channel, then adds a capped one-hop cross-reference score with edge provenance retained in the
result. Korean recommendation queries receive a small deterministic vocabulary expansion while
the original user text remains unchanged. Both the model cache and generated index are excluded
from Git and can be reproduced from the manifests and scripts.

`npm run rag:evaluate` is a fast regression benchmark, not a production quality guarantee. It
checks a small, hand-reviewed set of exact-lookup and recommendation questions across both Korean
translations, and also rejects duplicate passages, translation leakage, and missing source URLs.

## Licensed Korean translations

The app-facing Korean corpus is generated separately with `npm run data:kbs-bible` and
validated with `npm run data:validate`. It lives under `public/data/bible` and remains
excluded from Git because the source text is licensed. Use its canonical book, chapter,
and verse fields as the Korean display layer for retrieval results; keep the source URL,
translation ID, and permission record attached to every derived RAG document.
