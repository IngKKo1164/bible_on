import { createHash } from 'node:crypto';
import {
  makeCanonicalVerseId,
  parseOpenBibleReference,
  referenceBookCatalog,
} from './bible-reference.mjs';

export const METADATA_CHANNELS = Object.freeze([
  'topics',
  'originalLanguage',
  'relations',
  'datingClaims',
]);

const STEP_TO_OSIS = Object.freeze({
  Gen: 'Gen', Exo: 'Exod', Lev: 'Lev', Num: 'Num', Deu: 'Deut', Jos: 'Josh',
  Jdg: 'Judg', Rut: 'Ruth', '1Sa': '1Sam', '2Sa': '2Sam', '1Ki': '1Kgs',
  '2Ki': '2Kgs', '1Ch': '1Chr', '2Ch': '2Chr', Ezr: 'Ezra', Neh: 'Neh',
  Est: 'Esth', Job: 'Job', Psa: 'Ps', Pro: 'Prov', Ecc: 'Eccl', Sng: 'Song',
  Isa: 'Isa', Jer: 'Jer', Lam: 'Lam', Ezk: 'Ezek', Dan: 'Dan', Hos: 'Hos',
  Jol: 'Joel', Amo: 'Amos', Oba: 'Obad', Jon: 'Jonah', Mic: 'Mic', Nam: 'Nah',
  Hab: 'Hab', Zep: 'Zeph', Hag: 'Hag', Zec: 'Zech', Mal: 'Mal', Mat: 'Matt',
  Mrk: 'Mark', Luk: 'Luke', Jhn: 'John', Act: 'Acts', Rom: 'Rom', '1Co': '1Cor',
  '2Co': '2Cor', Gal: 'Gal', Eph: 'Eph', Php: 'Phil', Col: 'Col',
  '1Th': '1Thess', '2Th': '2Thess', '1Ti': '1Tim', '2Ti': '2Tim', Tit: 'Titus',
  Phm: 'Phlm', Heb: 'Heb', Jas: 'Jas', '1Pe': '1Pet', '2Pe': '2Pet',
  '1Jn': '1John', '2Jn': '2John', '3Jn': '3John', Jud: 'Jude', Rev: 'Rev',
});

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function valueOrNull(value) {
  const normalized = value?.trim();
  return normalized || null;
}

function splitOnce(value, separator) {
  const index = value.indexOf(separator);
  return index === -1
    ? [value, '']
    : [value.slice(0, index), value.slice(index + separator.length)];
}

export function extractStrongNumbers(value, languagePrefix = null) {
  const matches = value?.match(/[GH]\d{4}[A-Z]?/g) ?? [];
  return unique(languagePrefix ? matches.filter((match) => match.startsWith(languagePrefix)) : matches);
}

export function normalizeStepReference(value) {
  const match = value.match(/^([123]?[A-Za-z]{2,3})\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid STEPBible reference: ${value}`);
  const osis = STEP_TO_OSIS[match[1]];
  if (!osis) throw new Error(`Unknown STEPBible book code: ${match[1]}`);
  return makeCanonicalVerseId(
    osis,
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  );
}

function parseGreekSurface(value) {
  const match = value.trim().match(/^(.*) \(([^()]*)\)$/u);
  return match
    ? { surface: match[1].trim(), transliteration: valueOrNull(match[2]) }
    : { surface: value.trim(), transliteration: null };
}

export function parseStepOriginalLine(line, datasetId) {
  const fields = line.split('\t');
  const referenceMatch = fields[0]?.match(
    /^([123]?[A-Za-z]{2,3}\.\d+\.\d+)(?:[([{][^\])}]+[\])}])?#(\d+)=([^\t]*)$/,
  );
  if (!referenceMatch) return null;

  const verseId = normalizeStepReference(referenceMatch[1]);
  const position = Number.parseInt(referenceMatch[2], 10);
  const textType = valueOrNull(referenceMatch[3]);

  if (datasetId === 'TAHOT') {
    const rootStrongs = extractStrongNumbers(fields[8], 'H');
    return {
      verseId,
      position,
      textType,
      surface: valueOrNull(fields[1]),
      omitted: !valueOrNull(fields[1]),
      transliteration: valueOrNull(fields[2]),
      gloss: valueOrNull(fields[3]),
      strongs: extractStrongNumbers(fields[4], 'H'),
      lemmaStrong: rootStrongs[0] ?? null,
      lemma: null,
      lemmaGloss: null,
      morphology: valueOrNull(fields[5]),
      editions: null,
      variants: {
        meaning: valueOrNull(fields[6]),
        spelling: valueOrNull(fields[7]),
      },
    };
  }

  if (datasetId === 'TAGNT') {
    const surface = parseGreekSurface(fields[1] ?? '');
    const [strongValue, morphology] = splitOnce(fields[3] ?? '', '=');
    const [lemma, lemmaGloss] = splitOnce(fields[4] ?? '', '=');
    const simpleStrongs = extractStrongNumbers(fields[11], 'G');
    return {
      verseId,
      position,
      textType,
      surface: valueOrNull(surface.surface),
      omitted: !valueOrNull(surface.surface),
      transliteration: surface.transliteration,
      gloss: valueOrNull(fields[2]),
      strongs: extractStrongNumbers(strongValue, 'G'),
      lemmaStrong: simpleStrongs[0] ?? extractStrongNumbers(strongValue, 'G')[0] ?? null,
      lemma: valueOrNull(lemma),
      lemmaGloss: valueOrNull(lemmaGloss),
      morphology: valueOrNull(morphology),
      editions: valueOrNull(fields[5]),
      variants: {
        meaning: valueOrNull(fields[6]),
        spelling: valueOrNull(fields[7]),
      },
    };
  }

  throw new Error(`Unsupported STEPBible original-language dataset: ${datasetId}`);
}

export function decodeOpenBibleVerseId(value) {
  if (!/^\d{8}$/.test(value)) throw new Error(`Invalid OpenBible numeric verse ID: ${value}`);
  const bookOrder = Number.parseInt(value.slice(0, 2), 10);
  const chapter = Number.parseInt(value.slice(2, 5), 10);
  const verse = Number.parseInt(value.slice(5, 8), 10);
  const book = referenceBookCatalog[bookOrder - 1];
  if (!book) throw new Error(`Unknown OpenBible numeric book ID: ${value.slice(0, 2)}`);
  return makeCanonicalVerseId(book, chapter, verse);
}

export function normalizeTopicLabel(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function makeTopicId(label) {
  const hash = createHash('sha256').update(normalizeTopicLabel(label)).digest('hex').slice(0, 16);
  return `openbible-topic:${hash}`;
}

export function makeTopicAssociationKey(label, start, end = start) {
  return `${normalizeTopicLabel(label)}\u0000${start}\u0000${end}`;
}

export function parseOpenBibleTopicScoreLine(line) {
  const [label, referenceValue, scoreValue] = line.split('\t');
  if (!label || !referenceValue || scoreValue === undefined) {
    throw new Error(`Invalid OpenBible topic-score row: ${line}`);
  }
  const reference = parseOpenBibleReference(referenceValue);
  const qualityScore = Number.parseInt(scoreValue, 10);
  if (!Number.isInteger(qualityScore)) throw new Error(`Invalid topic quality score: ${scoreValue}`);
  return {
    label: label.trim(),
    topicId: makeTopicId(label),
    start: reference.start.id,
    end: reference.end.id,
    qualityScore,
  };
}

export function parseOpenBibleTopicVoteLine(line) {
  const [label, startValue, endValue, votesValue] = line.split('\t');
  if (!label || !startValue || votesValue === undefined) {
    throw new Error(`Invalid OpenBible topic-vote row: ${line}`);
  }
  const start = decodeOpenBibleVerseId(startValue);
  const end = endValue ? decodeOpenBibleVerseId(endValue) : start;
  const votes = Number.parseInt(votesValue, 10);
  if (!Number.isInteger(votes)) throw new Error(`Invalid topic vote count: ${votesValue}`);
  return { label: label.trim(), start, end, votes };
}

export function compareCanonicalVerseIds(leftId, rightId) {
  const left = parseOpenBibleReference(leftId).start;
  const right = parseOpenBibleReference(rightId).start;
  return referenceBookCatalog.findIndex((book) => book.id === left.bookId)
    - referenceBookCatalog.findIndex((book) => book.id === right.bookId)
    || left.chapter - right.chapter
    || left.verse - right.verse;
}

export function createCanonicalRangeExpander(canonicalIds) {
  const orderedIds = [...new Set(canonicalIds)].sort(compareCanonicalVerseIds);
  const indexById = new Map(orderedIds.map((id, index) => [id, index]));
  return (start, end = start) => {
    const startIndex = indexById.get(start);
    const endIndex = indexById.get(end);
    if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
      return [start, end].filter((id, index, values) => index === 0 || id !== values[0]);
    }
    return orderedIds.slice(startIndex, endIndex + 1);
  };
}

export function selectMetadataChannels(question) {
  const normalized = question.normalize('NFKC').toLocaleLowerCase('ko-KR');
  const channels = new Set(['topics', 'relations']);
  if (/(원어|히브리어|헬라어|그리스어|스트롱|strong|어근|형태소|문법)/u.test(normalized)) {
    channels.add('originalLanguage');
  }
  if (/(언제|시기|연대|저작|작성|기록.{0,4}(시기|연대)|사본|편집.{0,4}(시기|연대))/u.test(normalized)) {
    channels.add('datingClaims');
  }
  return METADATA_CHANNELS.filter((channel) => channels.has(channel));
}

export function validateDatingClaim(claim) {
  const allowedScopeKinds = new Set(['book', 'passage']);
  const allowedDateTypes = new Set(['event', 'composition', 'redaction', 'manuscript']);
  const allowedConfidence = new Set(['low', 'medium', 'high', 'unspecified']);
  if (claim.schemaVersion !== 1 || claim.type !== 'dating_claim' || !claim.id) {
    throw new Error('Dating claim requires schemaVersion 1, type dating_claim, and an ID.');
  }
  if (!allowedScopeKinds.has(claim.scope?.kind)) throw new Error(`${claim.id}: invalid scope kind`);
  if (!claim.scope?.start || !claim.scope?.end) throw new Error(`${claim.id}: missing scope range`);
  parseOpenBibleReference(claim.scope.start);
  parseOpenBibleReference(claim.scope.end);
  if (!allowedDateTypes.has(claim.dateType)) throw new Error(`${claim.id}: invalid date type`);
  if (!Number.isInteger(claim.range?.earliestYear) || !Number.isInteger(claim.range?.latestYear)) {
    throw new Error(`${claim.id}: dating range must use integer years`);
  }
  if (claim.range.earliestYear > claim.range.latestYear) {
    throw new Error(`${claim.id}: dating range is reversed`);
  }
  if (!claim.viewpoint?.trim()) throw new Error(`${claim.id}: viewpoint is required`);
  if (!allowedConfidence.has(claim.confidence)) throw new Error(`${claim.id}: invalid confidence`);
  if (!claim.source?.title?.trim() || !claim.source?.locator?.trim()) {
    throw new Error(`${claim.id}: a source title and locator are required`);
  }
  return claim;
}
