BEGIN;

CREATE SCHEMA IF NOT EXISTS bibleon;

CREATE TABLE IF NOT EXISTS bibleon.ai_threads (
  id uuid PRIMARY KEY,
  owner_user_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  translation_id text NOT NULL DEFAULT 'RNKSV'
    CHECK (translation_id IN ('GAE', 'RNKSV')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_threads_owner_updated_idx
  ON bibleon.ai_threads (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bibleon.ai_messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES bibleon.ai_threads(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  status text NOT NULL DEFAULT 'complete'
    CHECK (status IN ('pending', 'complete', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (thread_id, turn_id, role)
);

CREATE INDEX IF NOT EXISTS ai_messages_thread_created_idx
  ON bibleon.ai_messages (thread_id, created_at, id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bibleon.ai_message_citations (
  message_id uuid NOT NULL REFERENCES bibleon.ai_messages(id) ON DELETE CASCADE,
  ordinal smallint NOT NULL CHECK (ordinal >= 1),
  passage_id text NOT NULL,
  canonical_start text,
  canonical_end text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, ordinal)
);

CREATE INDEX IF NOT EXISTS ai_message_citations_passage_idx
  ON bibleon.ai_message_citations (passage_id);

CREATE TABLE IF NOT EXISTS bibleon.ai_retrieval_runs (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES bibleon.ai_threads(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  retrieval_action text NOT NULL
    CHECK (retrieval_action IN ('none', 'reuse', 'metadata', 'anchored', 'global', 'clarify')),
  raw_query text NOT NULL,
  standalone_query text NOT NULL,
  search_hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(search_hypotheses) = 'array'),
  resolved_passage_ids text[] NOT NULL DEFAULT '{}',
  result_trace jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(result_trace) = 'array'),
  status text NOT NULL DEFAULT 'complete'
    CHECK (status IN ('pending', 'complete', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (thread_id, turn_id)
);

CREATE INDEX IF NOT EXISTS ai_retrieval_runs_thread_started_idx
  ON bibleon.ai_retrieval_runs (thread_id, started_at DESC);

COMMENT ON SCHEMA bibleon IS
  'Application-owned BibleOn data. LangGraph checkpoints live in a separate schema.';
COMMENT ON COLUMN bibleon.ai_retrieval_runs.result_trace IS
  'Compact IDs and scores only; Bible text and embedding vectors are not copied into conversation state.';

COMMIT;
