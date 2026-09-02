import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requireValue(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function requireUuid(value, name) {
  const normalized = requireValue(value, name);
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${name} must be a UUID.`);
  return normalized;
}

export function createPostgresConversationRepository({
  databaseUrl = process.env.DATABASE_URL,
  pool,
  maxConnections = Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
} = {}) {
  if (!pool && !databaseUrl) throw new Error('DATABASE_URL is required for conversation storage.');
  if (!Number.isInteger(maxConnections) || maxConnections < 1) {
    throw new Error('DATABASE_POOL_MAX must be a positive integer.');
  }

  const ownsPool = !pool;
  const database = pool ?? new Pool({
    connectionString: databaseUrl,
    max: maxConnections,
    application_name: 'bibleon-conversation',
  });

  async function ensureThread({
    threadId,
    ownerUserId,
    title = '',
    translationId = 'RNKSV',
  }) {
    const normalizedThreadId = requireUuid(threadId, 'threadId');
    const normalizedOwnerUserId = requireValue(ownerUserId, 'ownerUserId');
    const result = await database.query(`
      INSERT INTO bibleon.ai_threads (
        id, owner_user_id, title, translation_id, updated_at
      ) VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (id) DO UPDATE SET
        translation_id = EXCLUDED.translation_id,
        updated_at = now()
      WHERE bibleon.ai_threads.owner_user_id = EXCLUDED.owner_user_id
        AND bibleon.ai_threads.deleted_at IS NULL
      RETURNING id
    `, [normalizedThreadId, normalizedOwnerUserId, title.trim(), translationId]);
    if (result.rowCount !== 1) {
      throw Object.assign(new Error('Thread ownership check failed.'), { status: 403 });
    }
    return result.rows[0];
  }

  async function assertThreadOwner({ threadId, ownerUserId }) {
    const normalizedThreadId = requireUuid(threadId, 'threadId');
    const normalizedOwnerUserId = requireValue(ownerUserId, 'ownerUserId');
    const result = await database.query(`
      SELECT id
      FROM bibleon.ai_threads
      WHERE id = $1
        AND owner_user_id = $2
        AND deleted_at IS NULL
    `, [normalizedThreadId, normalizedOwnerUserId]);
    if (result.rowCount !== 1) {
      throw Object.assign(new Error('Thread ownership check failed.'), { status: 403 });
    }
    return result.rows[0];
  }

  async function saveCompletedTurn({
    threadId,
    ownerUserId,
    title,
    state,
  }) {
    const normalizedThreadId = requireUuid(threadId, 'threadId');
    const normalizedOwnerUserId = requireValue(ownerUserId, 'ownerUserId');
    const turnId = requireUuid(state?.turnId, 'state.turnId');
    const client = await database.connect();

    try {
      await client.query('BEGIN');
      const threadResult = await client.query(`
        INSERT INTO bibleon.ai_threads (
          id, owner_user_id, title, translation_id, updated_at
        ) VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (id) DO UPDATE SET
          title = CASE
            WHEN bibleon.ai_threads.title = '' THEN EXCLUDED.title
            ELSE bibleon.ai_threads.title
          END,
          translation_id = EXCLUDED.translation_id,
          updated_at = now()
        WHERE bibleon.ai_threads.owner_user_id = EXCLUDED.owner_user_id
          AND bibleon.ai_threads.deleted_at IS NULL
        RETURNING id
      `, [
        normalizedThreadId,
        normalizedOwnerUserId,
        title?.trim() || state.currentQuery.slice(0, 80),
        state.translationId,
      ]);
      if (threadResult.rowCount !== 1) {
        throw Object.assign(new Error('Thread ownership check failed.'), { status: 403 });
      }

      const userMessage = await client.query(`
        INSERT INTO bibleon.ai_messages (
          id, thread_id, turn_id, role, content, status
        ) VALUES ($1, $2, $3, 'user', $4, 'complete')
        ON CONFLICT (thread_id, turn_id, role) DO UPDATE SET
          content = EXCLUDED.content,
          status = 'complete',
          deleted_at = NULL
        RETURNING id
      `, [randomUUID(), normalizedThreadId, turnId, state.currentQuery]);

      const assistantMessage = await client.query(`
        INSERT INTO bibleon.ai_messages (
          id, thread_id, turn_id, role, content, status
        ) VALUES ($1, $2, $3, 'assistant', $4, 'complete')
        ON CONFLICT (thread_id, turn_id, role) DO UPDATE SET
          content = EXCLUDED.content,
          status = 'complete',
          deleted_at = NULL
        RETURNING id
      `, [randomUUID(), normalizedThreadId, turnId, state.responseText]);
      const assistantMessageId = assistantMessage.rows[0].id;

      await client.query(
        'DELETE FROM bibleon.ai_message_citations WHERE message_id = $1',
        [assistantMessageId],
      );
      for (const [index, citation] of (state.answerCitations ?? []).entries()) {
        await client.query(`
          INSERT INTO bibleon.ai_message_citations (
            message_id, ordinal, passage_id, canonical_start, canonical_end, source_url
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          assistantMessageId,
          index + 1,
          citation.passageId,
          citation.canonicalStart,
          citation.canonicalEnd,
          citation.sourceUrl,
        ]);
      }

      await client.query(`
        INSERT INTO bibleon.ai_retrieval_runs (
          id, thread_id, turn_id, retrieval_action, raw_query, standalone_query,
          search_hypotheses, resolved_passage_ids, result_trace, status, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::text[], $9::jsonb, 'complete', now())
        ON CONFLICT (thread_id, turn_id) DO UPDATE SET
          retrieval_action = EXCLUDED.retrieval_action,
          raw_query = EXCLUDED.raw_query,
          standalone_query = EXCLUDED.standalone_query,
          search_hypotheses = EXCLUDED.search_hypotheses,
          resolved_passage_ids = EXCLUDED.resolved_passage_ids,
          result_trace = EXCLUDED.result_trace,
          status = 'complete',
          completed_at = now()
      `, [
        randomUUID(),
        normalizedThreadId,
        turnId,
        state.retrievalAction,
        state.currentQuery,
        state.standaloneQuery,
        JSON.stringify(state.searchHypotheses ?? []),
        state.resolvedReferences ?? [],
        JSON.stringify(state.retrievalResults ?? []),
      ]);

      await client.query('COMMIT');
      return {
        threadId: normalizedThreadId,
        turnId,
        userMessageId: userMessage.rows[0].id,
        assistantMessageId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    ensureThread,
    assertThreadOwner,
    saveCompletedTurn,
    handleTurnComplete({ threadId, ownerUserId, state }) {
      return saveCompletedTurn({ threadId, ownerUserId, state });
    },
    createTurnCompletionHandler({ threadId, ownerUserId, title }) {
      return ({ state }) => saveCompletedTurn({ threadId, ownerUserId, title, state });
    },
    async close() {
      if (ownsPool) await database.end();
    },
  };
}
