-- ZenBrain PostgreSQL Schema
-- Requires: PostgreSQL 15+ with pgvector extension
--
-- Usage: psql -f 001_init.sql -d your_database
-- Or run via your migration tool.

-- Enable pgvector for embedding storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Layer 3: Episodic Memory
-- ============================================
CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  context TEXT,
  embedding vector(1536),
  emotional_weight REAL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodic_created ON episodic_memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_context ON episodic_memories (context);
CREATE INDEX IF NOT EXISTS idx_episodic_embedding ON episodic_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================
-- Layer 4: Semantic Long-Term Memory (Facts)
-- ============================================
CREATE TABLE IF NOT EXISTS learned_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  source TEXT NOT NULL DEFAULT 'conversation',
  embedding vector(1536),
  access_count INTEGER NOT NULL DEFAULT 0,
  -- FSRS scheduling fields
  fsrs_difficulty REAL,
  fsrs_stability REAL,
  fsrs_next_review TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_facts_created ON learned_facts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON learned_facts (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_facts_next_review ON learned_facts (fsrs_next_review ASC) WHERE fsrs_next_review IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facts_embedding ON learned_facts USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search
ALTER TABLE learned_facts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_facts_fts ON learned_facts USING gin (search_vector);

-- ============================================
-- Layer 5: Procedural Memory
-- ============================================
CREATE TABLE IF NOT EXISTS procedural_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  tools JSONB NOT NULL DEFAULT '[]',
  outcome TEXT NOT NULL,
  embedding vector(1536),
  success_rate REAL NOT NULL DEFAULT 1.0,
  execution_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedures_success ON procedural_memories (success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_procedures_embedding ON procedural_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================
-- Layer 6: Core Memory (Pinned Blocks)
-- ============================================
CREATE TABLE IF NOT EXISTS core_memory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Layer 7: Cross-Context Links
-- ============================================
CREATE TABLE IF NOT EXISTS cross_context_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_a UUID NOT NULL,
  entity_b UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_a, entity_b)
);

-- ============================================
-- Knowledge Graph Entities (for Cross-Context)
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'concept',
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON knowledge_entities USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_type ON knowledge_entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON knowledge_entities USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
