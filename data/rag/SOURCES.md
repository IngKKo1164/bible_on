# RAG data sources and licenses

Retrieved for the BibleOn RAG prototype on 2026-09-01. The download script pins GitHub
sources to exact commits and records local SHA-256 hashes after acquisition.

## Old Testament Hebrew: OSHB

- Source: https://github.com/openscriptures/morphhb
- Pinned commit: `3d15126fb1ef74867fc1434be1942e837932691f`
- Contents used: Westminster Leningrad Codex text, lemmas, and morphology in OSIS XML
- License: WLC text is public domain; OSHB lemma and morphology work is CC BY 4.0
- Required attribution: "Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb"

Preserve the original Unicode normalization. The OSHB project specifically warns that
normalizing its Hebrew text to NFC can damage distinctions in the source data.

## New Testament Greek: Nestle 1904

- Source: https://github.com/biblicalhumanities/Nestle1904
- Pinned commit: `713f28a3b7d4d66132f5aa809fa223fe79762e5d`
- Contents used: `morph/Nestle1904.csv` and its format/license README
- License: the morphology dataset is dedicated to the public domain under CC0
- Attribution retained voluntarily: Biblical Humanities Nestle 1904 project; transcription by Diego Santos and morphology by Ulrik Sandborg-Petersen

The selected CSV is one token per row and includes reference, Greek surface text,
morphology, Strong's number, lemma, and normalized form.

## STEPBible Data

- Source: https://github.com/STEPBible/STEPBible-Data
- Pinned commit: `02843f07cbb5009e00999a7c0efead6430dbb6e7`
- Contents: full repository snapshot, including TAHOT, TAGNT, lexicons, morphology codes, proper names, and versification data
- Repository license: CC BY 4.0
- Required credit: "STEP Bible" linked to https://www.stepbible.org/

Some individual files carry more specific notices in their filenames or headers. The
ingestion pipeline must inspect and preserve those notices, and should initially include
only the CC BY 4.0 TAHOT, TAGNT, lexicon, morphology, proper-name, and versification sets.
Do not ingest tagged third-party translations merely because they are present in the
repository snapshot.

## OpenBible.info cross references

- Source page: https://www.openbible.info/labs/cross-references/
- Download: https://a.openbible.info/data/cross-references.zip
- License: CC BY 4.0 unless otherwise indicated on the source page
- Attribution: OpenBible.info Bible Cross References

The archive contains verse-reference relationships and vote counts. It should be joined
to BibleOn's licensed Korean verse text by canonical verse IDs. Do not copy ESV scripture
quotations from the OpenBible webpage into the corpus; those quotations have a separate
copyright notice and are not required by the reference graph.

## Production rules

1. Store `source_id`, source revision, license, and canonical verse IDs on every chunk.
2. Keep source text immutable; place normalized and embedded output in derived folders.
3. Display verse citations in every chatbot answer and expose dataset attribution in-app.
4. Do not mix licensed Korean translations into this corpus until the contract explicitly
   permits server storage, indexing, embeddings, retrieval, and end-user display.
5. Re-run a legal and theological content review before any production release.
