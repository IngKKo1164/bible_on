import path from 'node:path';
import { createHybridRetriever } from '../hybrid-retriever.mjs';
import { createMetadataRepository } from '../metadata-repository.mjs';
import { createBibleChatGraph, invokeBibleChatTurn, resumeBibleChatTurn } from './bible-chat-graph.mjs';
import { createBibleChatCheckpointer } from './checkpointer.mjs';
import { createOpenAIBibleChatComponents } from './openai-bible-chat.mjs';
import { createPostgresConversationRepository } from './postgres-conversation-repository.mjs';

function citationPreview(passage) {
  const firstSegments = passage.contentSegments?.slice(0, 3)
    .map((segment) => segment.text)
    .join(' ');
  const text = firstSegments || passage.content || '';
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

export async function createOpenAIBibleChatRuntime({
  repositoryRoot = process.cwd(),
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_CHAT_MODEL,
  databaseUrl = process.env.DATABASE_URL,
  checkpointerMode,
  localFilesOnly = true,
  openAIClient,
  onUsage,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const openAI = createOpenAIBibleChatComponents({
    client: openAIClient,
    apiKey,
    ...(model ? { model } : {}),
    onUsage,
  });
  const [retriever, metadataRepository, checkpointRuntime] = await Promise.all([
    createHybridRetriever({ repositoryRoot: root, localFilesOnly }),
    createMetadataRepository({ repositoryRoot: root }),
    createBibleChatCheckpointer({
      ...(checkpointerMode ? { mode: checkpointerMode } : {}),
      databaseUrl,
    }),
  ]);
  const conversationRepository = databaseUrl
    ? createPostgresConversationRepository({ databaseUrl })
    : null;
  const graph = createBibleChatGraph({
    retriever,
    metadataRepository,
    planner: openAI.planner,
    answerGenerator: openAI.answerGenerator,
    checkpointer: checkpointRuntime.checkpointer,
    onTurnComplete: conversationRepository
      ? (payload) => conversationRepository.handleTurnComplete(payload)
      : null,
  });

  function enrichResult(result) {
    const passageIds = result.answerCitations.map((citation) => citation.passageId);
    const passages = retriever.getPassagesByIds(passageIds, {
      translationId: result.translationId,
    });
    const passagesById = new Map(passages.map((passage) => [passage.id, passage]));
    return {
      ...result,
      model: openAI.model,
      displayCitations: result.answerCitations.map((citation) => {
        const passage = passagesById.get(citation.passageId);
        if (!passage) return null;
        return {
          id: citation.passageId,
          passageId: citation.passageId,
          reference: passage.reference,
          translation: passage.translation.label,
          text: citationPreview(passage),
          canonicalStart: citation.canonicalStart,
          canonicalEnd: citation.canonicalEnd,
          sourceUrl: citation.sourceUrl,
        };
      }).filter(Boolean),
    };
  }

  return {
    model: openAI.model,
    async ask({
      threadId,
      ownerUserId,
      query,
      translationId = 'RNKSV',
      selectedPassageId = null,
      turnId,
    }) {
      if (conversationRepository) {
        await conversationRepository.ensureThread({
          threadId,
          ownerUserId,
          title: query.slice(0, 80),
          translationId,
        });
      }
      const result = await invokeBibleChatTurn({
        graph,
        threadId,
        ownerUserId,
        query,
        translationId,
        selectedPassageId,
        ...(turnId ? { turnId } : {}),
      });
      return enrichResult(result);
    },
    async resume({ threadId, passageId, ownerUserId }) {
      if (conversationRepository) {
        await conversationRepository.assertThreadOwner({ threadId, ownerUserId });
      }
      return enrichResult(await resumeBibleChatTurn({
        graph,
        threadId,
        passageId,
        ownerUserId,
      }));
    },
    async close() {
      await Promise.allSettled([
        retriever.dispose(),
        checkpointRuntime.close(),
        conversationRepository?.close(),
      ]);
    },
  };
}
