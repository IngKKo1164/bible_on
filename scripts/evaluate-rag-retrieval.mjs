import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createHybridRetriever } from './lib/hybrid-retriever.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const cases = [
  {
    id: 'creation',
    query: '태초에 하나님이 천지를 창조하셨다는 말씀',
    expected: ['Gen.1.1', 'John.1.1', 'John.1.2', 'John.1.3'],
  },
  {
    id: 'anxiety',
    query: '불안하고 걱정될 때 읽을 말씀',
    expected: [
      'Phil.4.6', 'Phil.4.7', '1Pet.5.7', 'Ps.55.22', 'Ps.42.5', 'Ps.42.11',
      'Ps.6.2', 'Ps.6.3', 'Ps.77.1', 'Ps.143.1', 'Jer.46.27',
    ],
  },
  {
    id: 'forgiveness',
    query: '다른 사람을 용서하기 어려울 때 읽을 말씀',
    expected: ['Eph.4.32', 'Col.3.13', 'Matt.6.14', 'Matt.18.21', 'Luke.17.3'],
  },
  {
    id: 'guidance',
    query: '삶의 방향을 잃었을 때 하나님의 인도하심',
    expected: [
      'Prov.3.5', 'Prov.3.6', 'Ps.119.105', 'Ps.143.8', 'Ps.143.10',
      'Gal.5.16', 'Isa.30.21', 'Ps.107.7', 'Ps.23.2', 'Ps.23.3',
    ],
  },
  {
    id: 'love',
    query: '사랑의 의미와 모습을 보여주는 말씀',
    expected: [
      '1Cor.13.4', '1Cor.13.5', '1Cor.13.7', '1Cor.13.13', '1John.4.7',
      '1John.4.8', 'Rom.13.8', 'Rom.13.10', 'Phil.2.2', 'Phil.2.3', 'Phil.2.4',
    ],
  },
  {
    id: 'strength',
    query: '내게 능력 주시는 분 안에서 모든 것을 할 수 있다는 말씀',
    expected: ['Phil.4.13'],
  },
];

function caseHit(results, expected, cutoff) {
  return results.slice(0, cutoff).some((result) => (
    result.passage.verseIds.some((verseId) => expected.includes(verseId))
  ));
}

const retriever = await createHybridRetriever({ repositoryRoot, localFilesOnly: true });
const durations = [];
try {
  for (const translationId of ['GAE', 'RNKSV']) {
    let hitsAtFive = 0;
    let reciprocalRankTotal = 0;
    console.log(`\n[${translationId}]`);
    for (const evaluationCase of cases) {
      const startedAt = performance.now();
      const results = await retriever.search(evaluationCase.query, {
        translationId,
        limit: 10,
      });
      durations.push(performance.now() - startedAt);
      assert.equal(results.length, 10, `${translationId}/${evaluationCase.id}: result count`);
      assert.equal(
        new Set(results.map((result) => result.passage.id)).size,
        results.length,
        `${translationId}/${evaluationCase.id}: duplicate passage`,
      );
      results.forEach((result) => {
        assert.equal(result.passage.translation.id, translationId, 'translation leakage');
        assert(result.passage.verseIds.length > 0, 'missing canonical verse IDs');
        assert(result.passage.source?.url, 'missing source URL');
      });
      const firstRelevantRank = results.findIndex((result) => (
        result.passage.verseIds.some((verseId) => evaluationCase.expected.includes(verseId))
      )) + 1;
      const hitAtFive = caseHit(results, evaluationCase.expected, 5);
      if (hitAtFive) hitsAtFive += 1;
      if (firstRelevantRank) reciprocalRankTotal += 1 / firstRelevantRank;
      const top = results[0]?.passage;
      console.log(
        `${evaluationCase.id.padEnd(12)} Hit@5=${hitAtFive ? 'Y' : 'N'} `
        + `rank=${firstRelevantRank || '-'} top=${top?.reference ?? '-'}`,
      );
    }
    console.log(
      `Recall@5(cases) ${(hitsAtFive / cases.length).toFixed(3)} | `
      + `MRR@10 ${(reciprocalRankTotal / cases.length).toFixed(3)}`,
    );
  }
  const sortedDurations = [...durations].sort((left, right) => left - right);
  const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const p95 = sortedDurations[Math.ceil(sortedDurations.length * 0.95) - 1];
  console.log(`\nQuery latency average ${average.toFixed(1)}ms | p95 ${p95.toFixed(1)}ms`);
} finally {
  await retriever.dispose();
}
