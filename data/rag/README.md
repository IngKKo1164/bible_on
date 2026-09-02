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

## Licensed Korean translations

The app-facing Korean corpus is generated separately with `npm run data:kbs-bible` and
validated with `npm run data:validate`. It lives under `public/data/bible` and remains
excluded from Git because the source text is licensed. Use its canonical book, chapter,
and verse fields as the Korean display layer for retrieval results; keep the source URL,
translation ID, and permission record attached to every derived RAG document.
