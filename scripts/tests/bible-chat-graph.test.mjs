import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBibleChatGraph,
  invokeBibleChatTurn,
  resumeBibleChatTurn,
} from '../lib/conversation/bible-chat-graph.mjs';
import { createBibleChatCheckpointer } from '../lib/conversation/checkpointer.mjs';
import { createPostgresConversationRepository } from '../lib/conversation/postgres-conversation-repository.mjs';
import { createContextualQueryPlanner } from '../lib/conversation/query-planner.mjs';

const passages = [
  {
    id: 'RNKSV:Ps.23:p1',
    translation: { id: 'RNKSV' },
    verseIds: ['Ps.23.1', 'Ps.23.2'],
    canonicalStart: 'Ps.23.1',
    canonicalEnd: 'Ps.23.2',
    reference: '시편 23:1-2',
    content: '주님은 나의 목자시니, 내게 부족함 없어라.',
    source: { url: 'https://www.bskorea.or.kr/bible/korbibReadpage.php' },
  },
  {
    id: 'RNKSV:John.10:p1',
    translation: { id: 'RNKSV' },
    verseIds: ['John.10.11'],
    canonicalStart: 'John.10.11',
    canonicalEnd: 'John.10.11',
    reference: '요한복음 10:11',
    content: '나는 선한 목자이다.',
    source: { url: 'https://www.bskorea.or.kr/bible/korbibReadpage.php' },
  },
];

function createFakeRetriever() {
  const searchCalls = [];
  return {
    searchCalls,
    async search(query, options) {
      searchCalls.push({ query, options });
      const selected = options.anchorPassageIds?.length ? passages : passages.slice(0, 1);
      return selected.map((passage, index) => ({
        passage,
        rank: index + 1,
        score: 1 - index * 0.1,
        channels: index === 0 && options.anchorPassageIds?.length
          ? ['conversation_anchor']
          : ['body', ...(options.anchorPassageIds?.length ? ['cross_reference'] : [])],
        matchedVerseIds: passage.verseIds,
        matchedTopics: [],
        crossReferences: index === 0 ? [] : [{
          relationType: 'editorial_cross_reference',
          expansionDepth: 1,
          from: 'Ps.23.1',
          toStart: 'John.10.11',
          toEnd: 'John.10.11',
          seedPassageId: passages[0].id,
        }],
      }));
    },
    getPassagesByIds(ids, { translationId } = {}) {
      const requested = new Set(ids);
      return passages.filter((passage) => (
        requested.has(passage.id)
        && (!translationId || passage.translation.id === translationId)
      ));
    },
  };
}

test('adaptive graph reuses, enriches, and expands prior evidence without unnecessary searches', async () => {
  const retriever = createFakeRetriever();
  const runtime = await createBibleChatCheckpointer({ mode: 'memory' });
  const graph = createBibleChatGraph({ retriever, checkpointer: runtime.checkpointer });
  const threadId = 'conversation-test';

  try {
    const first = await invokeBibleChatTurn({
      graph,
      threadId,
      query: '불안할 때 읽을 말씀을 찾아줘',
    });
    assert.equal(first.retrievalAction, 'global');
    assert.deepEqual(first.activePassageIds, [passages[0].id]);
    assert.equal(first.responseText, 'Test 중입니다.');
    assert.equal(retriever.searchCalls.length, 1);

    const reused = await invokeBibleChatTurn({
      graph,
      threadId,
      query: '그 말씀 다시 보여줘',
    });
    assert.equal(reused.retrievalAction, 'reuse');
    assert.equal(retriever.searchCalls.length, 1);
    assert.deepEqual(reused.retrievedPassageIds, [passages[0].id]);

    const metadata = await invokeBibleChatTurn({
      graph,
      threadId,
      query: '그 말씀의 히브리어 원어는 뭐야?',
    });
    assert.equal(metadata.retrievalAction, 'metadata');
    assert.equal(retriever.searchCalls.length, 1);

    const anchored = await invokeBibleChatTurn({
      graph,
      threadId,
      query: '비슷한 말씀도 찾아줘',
    });
    assert.equal(anchored.retrievalAction, 'anchored');
    assert.equal(retriever.searchCalls.length, 2);
    assert.deepEqual(retriever.searchCalls[1].options.anchorPassageIds, [passages[0].id]);
    assert.equal(retriever.searchCalls[1].options.searchHypotheses[0].text, '비슷한 말씀도 찾아줘');
    assert.match(retriever.searchCalls[1].query, /이전 대화 주제/u);

    const acknowledgement = await invokeBibleChatTurn({
      graph,
      threadId,
      query: '고마워',
    });
    assert.equal(acknowledgement.retrievalAction, 'none');
    assert.equal(retriever.searchCalls.length, 2);
    assert.equal(acknowledgement.recentTurns.length, 8);
  } finally {
    await runtime.close();
  }
});

test('planner gives a model bounded conversation state and constrains its output', async () => {
  let received;
  const planner = createContextualQueryPlanner({
    async generatePlan(payload) {
      received = payload;
      return {
        continuity: 'follow_up',
        retrievalAction: 'not-a-real-action',
        standaloneQuery: '시편 23편의 목자 이미지와 연결되는 말씀',
        searchHypotheses: [{ text: '선한 목자와 돌봄', weight: 3 }],
        confidence: 4,
      };
    },
  });
  const result = await planner.plan({
    currentQuery: '그와 비슷한 말씀은?',
    translationId: 'RNKSV',
    activeTopic: '불안할 때 하나님의 돌봄',
    focusPassageId: passages[0].id,
    activePassageIds: [passages[0].id],
    selectedPassageId: null,
    recentTurns: [{
      role: 'assistant',
      content: '시편 23편을 찾았습니다.',
      passageIds: [passages[0].id],
    }],
  });

  assert.match(received.systemPrompt, /untrusted context/u);
  assert.equal(received.input.activeTopic, '불안할 때 하나님의 돌봄');
  assert.equal(result.retrievalAction, 'anchored');
  assert.equal(result.searchHypotheses[0].text, '그와 비슷한 말씀은?');
  assert.equal(result.searchHypotheses.at(-1).weight, 1);
  assert.equal(result.confidence, 1);
});

test('planner requests clarification for an unresolved reference with multiple passages', async () => {
  const planner = createContextualQueryPlanner();
  const result = await planner.plan({
    currentQuery: '그 말씀의 뜻은 뭐야?',
    translationId: 'RNKSV',
    activeTopic: '목자',
    focusPassageId: null,
    activePassageIds: passages.map((passage) => passage.id),
    selectedPassageId: null,
    recentTurns: [],
  });

  assert.equal(result.retrievalAction, 'clarify');
  assert.equal(result.continuity, 'ambiguous');
  assert.deepEqual(result.resolvedReferences, passages.map((passage) => passage.id));
});

test('PostgreSQL mode fails closed when deployment credentials are absent', async () => {
  await assert.rejects(
    () => createBibleChatCheckpointer({ mode: 'postgres', databaseUrl: '' }),
    /DATABASE_URL is required/u,
  );
});

test('clarification interrupts and resumes with a selected passage', async () => {
  const retriever = createFakeRetriever();
  const runtime = await createBibleChatCheckpointer({ mode: 'memory' });
  const planner = {
    async plan(state) {
      if (state.currentQuery === '어느 쪽?') {
        return {
          continuity: 'ambiguous',
          retrievalAction: 'clarify',
          standaloneQuery: state.currentQuery,
          resolvedReferences: state.activePassageIds,
          searchHypotheses: [{
            id: 'user-query',
            kind: 'user_query',
            text: state.currentQuery,
            weight: 1,
          }],
          confidence: 1,
          clarificationQuestion: '어느 말씀을 뜻하나요?',
          updatedTopic: state.activeTopic,
        };
      }
      return createContextualQueryPlanner().plan(state);
    },
  };
  const graph = createBibleChatGraph({
    retriever,
    planner,
    checkpointer: runtime.checkpointer,
  });
  const threadId = 'interrupt-test';

  try {
    await invokeBibleChatTurn({ graph, threadId, query: '목자에 관한 말씀' });
    const paused = await invokeBibleChatTurn({ graph, threadId, query: '어느 쪽?' });
    assert.equal(paused.__interrupt__[0].value.type, 'clarify_reference');
    assert.deepEqual(paused.__interrupt__[0].value.candidatePassageIds, [passages[0].id]);

    const resumed = await resumeBibleChatTurn({
      graph,
      threadId,
      passageId: passages[0].id,
    });
    assert.equal(resumed.retrievalAction, 'reuse');
    assert.equal(resumed.focusPassageId, passages[0].id);
    assert.equal(resumed.responseText, 'Test 중입니다.');
  } finally {
    await runtime.close();
  }
});

test('PostgreSQL repository writes a completed turn atomically with idempotent keys', async () => {
  const statements = [];
  const client = {
    async query(statement, values = []) {
      const sql = String(statement).trim();
      statements.push({ sql, values });
      if (/INSERT INTO bibleon\.ai_threads/u.test(sql)) {
        return { rowCount: 1, rows: [{ id: values[0] }] };
      }
      if (/INSERT INTO bibleon\.ai_messages/u.test(sql)) {
        return { rowCount: 1, rows: [{ id: values[0] }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {
      statements.push({ sql: 'RELEASE', values: [] });
    },
  };
  const repository = createPostgresConversationRepository({
    pool: { async connect() { return client; } },
  });
  const threadId = '7e6a794e-e25d-4b6f-b2bd-57927cd95e17';
  const turnId = '21790217-f56c-45a0-a34f-a73b6fd66f25';

  await repository.saveCompletedTurn({
    threadId,
    ownerUserId: 'auth-user-1',
    state: {
      turnId,
      translationId: 'RNKSV',
      currentQuery: '불안할 때 읽을 말씀',
      responseText: 'Test 중입니다.',
      retrievalAction: 'global',
      standaloneQuery: '불안할 때 읽을 말씀',
      searchHypotheses: [],
      resolvedReferences: [],
      retrievalResults: [{ passageId: passages[0].id, score: 1 }],
      answerCitations: [],
    },
  });

  assert.equal(statements[0].sql, 'BEGIN');
  assert.equal(statements.at(-2).sql, 'COMMIT');
  assert.equal(statements.at(-1).sql, 'RELEASE');
  assert.ok(statements.some(({ sql }) => /ON CONFLICT \(thread_id, turn_id, role\)/u.test(sql)));
  assert.ok(statements.some(({ sql }) => /ON CONFLICT \(thread_id, turn_id\)/u.test(sql)));
});
