import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeOpenBibleVerseId,
  normalizeStepReference,
  parseOpenBibleTopicScoreLine,
  parseOpenBibleTopicVoteLine,
  parseStepOriginalLine,
  selectMetadataChannels,
  validateAuthorizedCommentary,
  validateDatingClaim,
} from '../lib/rag-metadata.mjs';

test('normalizes STEPBible and numeric OpenBible references to OSIS IDs', () => {
  assert.equal(normalizeStepReference('Mat.1.1'), 'Matt.1.1');
  assert.equal(normalizeStepReference('1Sa.16.7'), '1Sam.16.7');
  assert.equal(decodeOpenBibleVerseId('02020001'), 'Exod.20.1');
});

test('parses TAHOT and TAGNT original-language rows without flattening provenance', () => {
  const hebrew = parseStepOriginalLine(
    'Gen.1.1#02=L\tבָּרָ֣א\tba.Ra\'\the created\t{H1254A}\tHVqp3ms\t\t\tH1254A\t\t\t\t{H1254A=בָּרָא=to create}',
    'TAHOT',
  );
  assert.equal(hebrew.verseId, 'Gen.1.1');
  assert.equal(hebrew.surface, 'בָּרָ֣א');
  assert.equal(hebrew.lemmaStrong, 'H1254A');
  assert.equal(hebrew.morphology, 'HVqp3ms');

  const greek = parseStepOriginalLine(
    'Mat.1.1#01=NKO\tΒίβλος (Biblos)\t[The] book\tG0976=N-NSF\tβίβλος=book\tNA28+TR\t\t\tLibro\tbook\t#01\tG0976\t',
    'TAGNT',
  );
  assert.equal(greek.verseId, 'Matt.1.1');
  assert.equal(greek.surface, 'Βίβλος');
  assert.equal(greek.transliteration, 'Biblos');
  assert.equal(greek.lemma, 'βίβλος');
  assert.equal(greek.lemmaStrong, 'G0976');
});

test('joins OpenBible topic scores and votes through the same canonical range', () => {
  const score = parseOpenBibleTopicScoreLine('10 commandments\tExod.20.1-Exod.20.26\t7');
  const vote = parseOpenBibleTopicVoteLine('10 commandments\t02020001\t02020026\t302');
  assert.equal(score.start, vote.start);
  assert.equal(score.end, vote.end);
  assert.equal(score.qualityScore, 7);
  assert.equal(vote.votes, 302);
});

test('routes only metadata channels indicated by the question', () => {
  assert.deepEqual(
    selectMetadataChannels('불안할 때 읽을 말씀을 추천해줘'),
    ['topics', 'commentary', 'relations'],
  );
  assert.deepEqual(
    selectMetadataChannels('창세기 1장 히브리어 원어와 기록 시기를 알려줘'),
    ['topics', 'commentary', 'originalLanguage', 'relations', 'datingClaims'],
  );
});

test('accepts only commentary with explicit rights evidence and a source locator', () => {
  const commentary = {
    schemaVersion: 1,
    type: 'authorized_commentary',
    id: 'example:genesis-1-1',
    reference: { start: 'Gen.1.1', end: 'Gen.1.1' },
    title: 'Example commentary',
    content: 'An authorized sample explanation.',
    source: { title: 'Example source', locator: 'p. 1', license: 'Example license' },
    rights: { status: 'licensed', evidence: 'Contract reference 1' },
  };
  assert.equal(validateAuthorizedCommentary(commentary), commentary);
  assert.throws(
    () => validateAuthorizedCommentary({ ...commentary, rights: { status: 'licensed' } }),
    /rights and evidence/,
  );
});

test('requires sourced ranges for dating claims instead of a single synthetic date', () => {
  const claim = {
    schemaVersion: 1,
    type: 'dating_claim',
    id: 'example:genesis-composition-1',
    scope: { kind: 'book', start: 'Gen.1.1', end: 'Gen.50.26' },
    dateType: 'composition',
    range: { earliestYear: -600, latestYear: -400, convention: 'negative_bce_positive_ce' },
    viewpoint: 'example scholarly position',
    confidence: 'unspecified',
    source: { title: 'Example source', locator: 'p. 10' },
  };
  assert.equal(validateDatingClaim(claim), claim);
  assert.throws(
    () => validateDatingClaim({ ...claim, source: { title: 'Example source' } }),
    /source title and locator/,
  );
});
