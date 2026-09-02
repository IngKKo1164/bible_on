import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';

const nullableString = z.string().nullable().default(null);

export const BibleChatState = new StateSchema({
  stateVersion: z.number().int().default(1),
  turnId: z.string().default(''),
  currentQuery: z.string().default(''),
  translationId: z.enum(['GAE', 'RNKSV']).default('RNKSV'),
  activeTopic: nullableString,
  focusPassageId: nullableString,
  activePassageIds: z.array(z.string()).default(() => []),
  selectedPassageId: nullableString,
  recentTurns: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    passageIds: z.array(z.string()).default(() => []),
  })).default(() => []),
  continuity: z.enum([
    'new_topic',
    'follow_up',
    'acknowledgement',
    'ambiguous',
  ]).default('new_topic'),
  retrievalAction: z.enum([
    'none',
    'reuse',
    'metadata',
    'anchored',
    'global',
    'clarify',
  ]).default('global'),
  standaloneQuery: z.string().default(''),
  searchHypotheses: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    text: z.string(),
    weight: z.number(),
  })).default(() => []),
  resolvedReferences: z.array(z.string()).default(() => []),
  clarificationQuestion: nullableString,
  retrievedPassageIds: z.array(z.string()).default(() => []),
  retrievalResults: z.array(z.record(z.string(), z.unknown())).default(() => []),
  retrievalAttempt: z.number().int().nonnegative().default(0),
  responseText: z.string().default(''),
  answerCitations: z.array(z.object({
    passageId: z.string(),
    canonicalStart: nullableString,
    canonicalEnd: nullableString,
    sourceUrl: nullableString,
  })).default(() => []),
});
