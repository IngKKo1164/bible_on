import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createBibleChatApiHandler } from '../../server/bible-chat-api.mjs';
import {
  createOpenAIBibleChatComponents,
  createOpenAIClient,
  DEFAULT_OPENAI_CHAT_MODEL,
} from '../lib/conversation/openai-bible-chat.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('OpenAI components create a contextual plan and a grounded cited answer', async () => {
  const calls = [];
  const usages = [];
  const passage = {
    id: 'RNKSV:Ps.23:p1',
    translation: { id: 'RNKSV', label: '새번역' },
    reference: '시편 23:1-2',
    canonicalStart: 'Ps.23.1',
    canonicalEnd: 'Ps.23.2',
    heading: '주님은 나의 목자',
    contentSegments: [{
      canonicalIds: ['Ps.23.1'],
      text: '주님은 나의 목자시니, 내게 부족함 없어라.',
    }],
    content: '주님은 나의 목자시니, 내게 부족함 없어라.',
    source: { url: 'https://www.bskorea.or.kr/bible/korbibReadpage.php' },
  };
  const outputs = [
    {
      continuity: 'new_topic',
      retrievalAction: 'global',
      standaloneQuery: '불안한 사람에게 하나님의 돌봄을 보여주는 말씀',
      resolvedReferences: [],
      searchHypotheses: [{
        id: 'care',
        kind: 'search_hypothesis',
        text: '하나님의 돌봄과 평안',
        weight: 0.8,
      }],
      confidence: 0.91,
      clarificationQuestion: null,
      updatedTopic: '불안 속 하나님의 돌봄',
    },
    {
      text: '새번역 시편 23편은 하나님을 목자로 표현하며 돌보심을 보여줍니다.',
      citationPassageIds: [passage.id, 'RNKSV:Invented.1:p1'],
    },
  ];
  const fakeClient = {
    responses: {
      async parse(parameters) {
        calls.push(parameters);
        return {
          id: `response-${calls.length}`,
          output_parsed: outputs.shift(),
          usage: { input_tokens: 100, output_tokens: 20 },
        };
      },
    },
  };
  const components = createOpenAIBibleChatComponents({
    client: fakeClient,
    onUsage: (usage) => usages.push(usage),
  });
  const plan = await components.planner.plan({
    currentQuery: '불안할 때 읽을 말씀을 찾아줘',
    translationId: 'RNKSV',
    activeTopic: null,
    focusPassageId: null,
    activePassageIds: [],
    selectedPassageId: null,
    recentTurns: [],
  });
  const answer = await components.answerGenerator({
    query: '불안할 때 읽을 말씀을 찾아줘',
    standaloneQuery: plan.standaloneQuery,
    continuity: plan.continuity,
    retrievalAction: plan.retrievalAction,
    activeTopic: plan.updatedTopic,
    passages: [passage],
    metadata: [],
    retrievalTrace: [{ passageId: passage.id, matchedVerseIds: ['Ps.23.1'] }],
  });

  assert.equal(components.model, DEFAULT_OPENAI_CHAT_MODEL);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.store === false));
  assert.ok(calls.every((call) => call.model === DEFAULT_OPENAI_CHAT_MODEL));
  assert.equal(plan.searchHypotheses[0].text, '불안할 때 읽을 말씀을 찾아줘');
  assert.match(calls[1].input[0].content, /Ps\.23\.1/u);
  assert.deepEqual(answer.citations, [{
    passageId: passage.id,
    canonicalStart: passage.canonicalStart,
    canonicalEnd: passage.canonicalEnd,
    sourceUrl: passage.source.url,
  }]);
  assert.deepEqual(usages.map((usage) => usage.stage), ['query_planner', 'answer']);
});

test('acknowledgements do not spend an OpenAI request', async () => {
  let callCount = 0;
  const components = createOpenAIBibleChatComponents({
    client: { responses: { async parse() { callCount += 1; } } },
  });
  const plan = await components.planner.plan({
    currentQuery: '고마워',
    translationId: 'RNKSV',
    activeTopic: '불안',
    focusPassageId: 'RNKSV:Ps.23:p1',
    activePassageIds: ['RNKSV:Ps.23:p1'],
    selectedPassageId: null,
    recentTurns: [],
  });
  const answer = await components.answerGenerator({ retrievalAction: plan.retrievalAction });

  assert.equal(plan.retrievalAction, 'none');
  assert.equal(answer.text, '언제든 편하게 물어보세요.');
  assert.equal(callCount, 0);
});

test('OpenAI client requires a server-side API key', () => {
  assert.throws(() => createOpenAIClient({ apiKey: '' }), /OPENAI_API_KEY is required/u);
});

test('HTTP API keeps credentials server-side and returns the chat result', async () => {
  let received;
  const handler = createBibleChatApiHandler({
    async authenticateRequest() {
      return { userId: 'signed-in-user' };
    },
    async getRuntime() {
      return {
        async ask(input) {
          received = input;
          return {
            turnId: '21790217-f56c-45a0-a34f-a73b6fd66f25',
            responseText: '테스트 답변',
            displayCitations: [],
            retrievalAction: 'global',
            retrievedPassageIds: [],
            model: DEFAULT_OPENAI_CHAT_MODEL,
          };
        },
      };
    },
    async consumeQuota() {},
    logger: { error() {} },
  });
  const server = createServer(handler);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: '7e6a794e-e25d-4b6f-b2bd-57927cd95e17',
        query: '불안할 때 읽을 말씀',
        translationId: 'RNKSV',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message.text, '테스트 답변');
    assert.equal(body.model, DEFAULT_OPENAI_CHAT_MODEL);
    assert.equal(received.ownerUserId, 'signed-in-user');
    assert.equal(received.query, '불안할 때 읽을 말씀');
  } finally {
    await close(server);
  }
});
