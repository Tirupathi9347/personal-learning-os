-- Agentic Learning OS: Phase 5E Database-Enforced Idempotency & Concurrency Hardening
-- Adds idempotency_key to public.tasks and enforces per-user uniqueness on non-null keys.

-- 1. Ensure idempotency_key column exists on tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 2. Ensure user_id column exists on tasks table (if not already present)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create a unique partial index for idempotency_key per user
-- When idempotency_key IS NOT NULL, two tasks for the same user cannot share the same idempotency key.
-- Historical tasks with idempotency_key IS NULL are completely unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_idempotency 
ON public.tasks (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 4. Fast lookup index on idempotency_key
CREATE INDEX IF NOT EXISTS idx_tasks_idempotency_key 
ON public.tasks (idempotency_key) 
WHERE idempotency_key IS NOT NULL;
