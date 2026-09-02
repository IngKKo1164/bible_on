import { randomUUID } from 'node:crypto';
import {
  Command,
  END,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';
import { BibleChatState } from './bible-chat-state.mjs';
import { createContextualQueryPlanner } from './query-planner.mjs';

const MAX_ACTIVE_PASSAGES = 8;
const MAX_RECENT_TURNS = 8;

function uniqueStrings(values, limit = MAX_ACTIVE_PASSAGES) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]
    .slice(0, limit);
}

function compactResult(result) {
  return {
    passageId: result.passage?.id ?? result.passageId,
    rank: result.rank,
    score: result.score,
    channels: result.channels ?? [],
    matchedVerseIds: result.matchedVerseIds ?? [],
    matchedTopics: (result.matchedTopics ?? []).map((topic) => ({
      id: topic.id,
      label: topic.label,
      associationId: topic.associationId,
    })),
    crossReferences: (result.crossReferences ?? []).map((reference) => ({
      relationType: reference.relationType,
      expansionDepth: reference.expansionDepth,
      from: reference.from,
      toStart: reference.toStart,
      toEnd: reference.toEnd,
      seedPassageId: reference.seedPassageId,
    })),
  };
}

function compactPassage(passage, rank, channels) {
  return {
    passageId: passage.id,
    rank,
    score: 1,
    channels,
    matchedVerseIds: passage.verseIds,
    matchedTopics: [],
    crossReferences: [],
  };
}

function passageIdsForReuse(state) {
  return uniqueStrings([
    state.selectedPassageId,
    state.focusPassageId,
    ...state.resolvedReferences,
    ...state.activePassageIds,
  ]);
}

function routePlannedAction(state) {
  return state.retrievalAction;
}

function routeEvidence(state) {
  if (state.retrievalAction !== 'anchored' || state.retrievalAttempt !== 1) {
    return 'generate_answer';
  }
  const anchors = new Set(passageIdsForReuse(state));
  const hasExpandedEvidence = state.retrievalResults.some((result) => (
    !anchors.has(result.passageId)
  ));
  return hasExpandedEvidence ? 'generate_answer' : 'global_search';
}

function normalizeGeneratorResult(result) {
  if (typeof result === 'string') return { text: result, citations: [] };
  const text = typeof result?.text === 'string' ? result.text : 'Test 중입니다.';
  const citations = Array.isArray(result?.citations)
    ? result.citations.filter((citation) => typeof citation?.passageId === 'string')
      .map((citation) => ({
        passageId: citation.passageId,
        canonicalStart: citation.canonicalStart ?? null,
        canonicalEnd: citation.canonicalEnd ?? null,
        sourceUrl: citation.sourceUrl ?? null,
      }))
    : [];
  return { text, citations };
}

export function createBibleChatGraph({
  retriever,
  metadataRepository = null,
  planner = createContextualQueryPlanner(),
  answerGenerator = async () => ({ text: 'Test 중입니다.', citations: [] }),
  onTurnComplete = null,
  checkpointer,
  retrievalLimit = 8,
} = {}) {
  if (!retriever?.search || !retriever?.getPassagesByIds) {
    throw new Error('A retriever with search() and getPassagesByIds() is required.');
  }
  if (!checkpointer) throw new Error('A LangGraph checkpointer is required.');

  const prepareTurn = (state) => {
    const currentQuery = state.currentQuery.trim();
    if (!currentQuery) throw new Error('currentQuery must not be empty.');
    return {
      currentQuery,
      selectedPassageId: state.selectedPassageId ?? null,
      continuity: 'new_topic',
      retrievalAction: 'global',
      standaloneQuery: currentQuery,
      searchHypotheses: [],
      resolvedReferences: [],
      clarificationQuestion: null,
      retrievedPassageIds: [],
      retrievalResults: [],
      retrievalAttempt: 0,
      responseText: '',
      answerCitations: [],
    };
  };

  const planContextualQuery = async (state) => {
    const { updatedTopic, ...plan } = await planner.plan(state);
    return {
      ...plan,
      activeTopic: updatedTopic,
    };
  };

  const skipRetrieval = () => ({
    retrievedPassageIds: [],
    retrievalResults: [],
  });

  const reuseEvidence = (state) => {
    const passages = retriever.getPassagesByIds(passageIdsForReuse(state), {
      translationId: state.translationId,
    });
    return {
      retrievedPassageIds: passages.map((passage) => passage.id),
      retrievalResults: passages.map((passage, index) => (
        compactPassage(passage, index + 1, ['conversation_reuse'])
      )),
      retrievalAttempt: state.retrievalAttempt + 1,
    };
  };

  const selectMetadataEvidence = (state) => {
    const passages = retriever.getPassagesByIds(passageIdsForReuse(state), {
      translationId: state.translationId,
    });
    return {
      retrievedPassageIds: passages.map((passage) => passage.id),
      retrievalResults: passages.map((passage, index) => (
        compactPassage(passage, index + 1, ['metadata_lookup'])
      )),
      retrievalAttempt: state.retrievalAttempt + 1,
    };
  };

  const runSearch = async (state, anchorPassageIds = []) => {
    const results = await retriever.search(state.standaloneQuery || state.currentQuery, {
      translationId: state.translationId,
      limit: retrievalLimit,
      searchHypotheses: state.searchHypotheses,
      anchorPassageIds,
    });
    return {
      retrievedPassageIds: results.map((result) => result.passage.id),
      retrievalResults: results.map(compactResult),
      retrievalAttempt: state.retrievalAttempt + 1,
    };
  };

  const anchoredSearch = (state) => runSearch(state, passageIdsForReuse(state));
  const globalSearch = (state) => runSearch(state);

  const clarifyReference = (state) => {
    const candidates = passageIdsForReuse(state);
    const resumed = interrupt({
      type: 'clarify_reference',
      question: state.clarificationQuestion,
      candidatePassageIds: candidates,
    });
    const passageId = typeof resumed === 'string' ? resumed : resumed?.passageId;
    if (!candidates.includes(passageId)) {
      throw new Error('The clarification response must select one of the candidate passage IDs.');
    }
    return {
      selectedPassageId: passageId,
      focusPassageId: passageId,
      resolvedReferences: [passageId],
      retrievalAction: 'reuse',
      clarificationQuestion: null,
    };
  };

  const generateAnswer = async (state) => {
    const passages = retriever.getPassagesByIds(state.retrievedPassageIds, {
      translationId: state.translationId,
    });
    const metadata = metadataRepository
      ? await Promise.all(passages.map(async (passage) => ({
          passageId: passage.id,
          evidence: await metadataRepository.getForPassage(passage, {
            query: state.standaloneQuery || state.currentQuery,
            channels: 'auto',
          }),
        })))
      : [];
    const result = normalizeGeneratorResult(await answerGenerator({
      query: state.currentQuery,
      standaloneQuery: state.standaloneQuery,
      continuity: state.continuity,
      retrievalAction: state.retrievalAction,
      activeTopic: state.activeTopic,
      passages,
      metadata,
      retrievalTrace: state.retrievalResults,
    }));
    return {
      responseText: result.text,
      answerCitations: result.citations,
    };
  };

  const persistTurn = async (state) => {
    const activePassageIds = state.retrievedPassageIds.length
      ? uniqueStrings(state.retrievedPassageIds)
      : uniqueStrings(state.activePassageIds);
    const focusPassageId = state.selectedPassageId
      ?? activePassageIds[0]
      ?? state.focusPassageId
      ?? null;
    const recentTurns = [
      ...state.recentTurns,
      { role: 'user', content: state.currentQuery, passageIds: [] },
      {
        role: 'assistant',
        content: state.responseText,
        passageIds: uniqueStrings(state.answerCitations.map((citation) => citation.passageId)),
      },
    ].slice(-MAX_RECENT_TURNS);
    const update = {
      activeTopic: state.activeTopic ?? state.currentQuery,
      focusPassageId,
      activePassageIds,
      selectedPassageId: null,
      recentTurns,
    };

    if (typeof onTurnComplete === 'function') {
      // Checkpoint retries can replay this node, so persistence adapters must key writes by turnId.
      await onTurnComplete({
        idempotencyKey: state.turnId,
        state: { ...state, ...update },
      });
    }
    return update;
  };

  return new StateGraph(BibleChatState)
    .addNode('prepare_turn', prepareTurn)
    .addNode('plan_contextual_query', planContextualQuery)
    .addNode('skip_retrieval', skipRetrieval)
    .addNode('reuse_evidence', reuseEvidence)
    .addNode('select_metadata_evidence', selectMetadataEvidence)
    .addNode('anchored_search', anchoredSearch)
    .addNode('global_search', globalSearch)
    .addNode('clarify_reference', clarifyReference)
    .addNode('verify_evidence', (state) => state)
    .addNode('generate_answer', generateAnswer)
    .addNode('persist_turn', persistTurn)
    .addEdge(START, 'prepare_turn')
    .addEdge('prepare_turn', 'plan_contextual_query')
    .addConditionalEdges('plan_contextual_query', routePlannedAction, {
      none: 'skip_retrieval',
      reuse: 'reuse_evidence',
      metadata: 'select_metadata_evidence',
      anchored: 'anchored_search',
      global: 'global_search',
      clarify: 'clarify_reference',
    })
    .addEdge('skip_retrieval', 'generate_answer')
    .addEdge('reuse_evidence', 'verify_evidence')
    .addEdge('select_metadata_evidence', 'verify_evidence')
    .addEdge('anchored_search', 'verify_evidence')
    .addEdge('global_search', 'verify_evidence')
    .addEdge('clarify_reference', 'reuse_evidence')
    .addConditionalEdges('verify_evidence', routeEvidence, {
      global_search: 'global_search',
      generate_answer: 'generate_answer',
    })
    .addEdge('generate_answer', 'persist_turn')
    .addEdge('persist_turn', END)
    .compile({ checkpointer });
}

export function invokeBibleChatTurn({
  graph,
  threadId,
  query,
  translationId = 'RNKSV',
  selectedPassageId = null,
  turnId = randomUUID(),
}) {
  if (!threadId?.trim()) throw new Error('threadId is required.');
  return graph.invoke({
    turnId,
    currentQuery: query,
    translationId,
    selectedPassageId,
  }, {
    configurable: { thread_id: threadId },
  });
}

export function resumeBibleChatTurn({ graph, threadId, passageId }) {
  if (!threadId?.trim()) throw new Error('threadId is required.');
  return graph.invoke(new Command({ resume: { passageId } }), {
    configurable: { thread_id: threadId },
  });
}
