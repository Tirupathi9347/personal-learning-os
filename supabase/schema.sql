-- Personal Learning OS: Master Single SQL Migration Script (Safe to re-run multiple times)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. API Keys Config Vault
CREATE TABLE IF NOT EXISTS api_keys_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) UNIQUE NOT NULL,
    encrypted_key TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    auth_tag VARCHAR(64) NOT NULL,
    selected_model VARCHAR(100) DEFAULT 'gemini-3.6-flash',
    is_active BOOLEAN DEFAULT TRUE,
    health_status VARCHAR(20) DEFAULT 'healthy',
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    github_repo_url TEXT,
    start_date DATE,
    target_end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tasks / To-Do Manager
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    completed_at TIMESTAMPTZ,
    postponed_count INT DEFAULT 0,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for agent write idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_idempotency 
ON tasks (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 4. Daily Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    raw_content TEXT NOT NULL,
    summary TEXT,
    learning_summary TEXT,
    reflection TEXT,
    tomorrow_plan TEXT,
    time_spent_minutes INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Skills Framework
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL,
    proficiency_level INT DEFAULT 1,
    target_level INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Notes & Knowledge Base
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    fts_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || content)) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Topic Nodes
CREATE TABLE IF NOT EXISTS topic_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    parent_id UUID REFERENCES topic_nodes(id) ON DELETE CASCADE,
    description TEXT,
    mastery_percentage INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GitHub Repositories Cache
CREATE TABLE IF NOT EXISTS github_repos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    html_url TEXT NOT NULL,
    description TEXT,
    stargazers_count INT DEFAULT 0,
    forks_count INT DEFAULT 0,
    language VARCHAR(100),
    pushed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. GitHub Activity & Event Logs
CREATE TABLE IF NOT EXISTS github_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    repo_name VARCHAR(255) NOT NULL,
    message TEXT,
    url TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. LeetCode Profile Cache
CREATE TABLE IF NOT EXISTS leetcode_profile_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    ranking INT,
    total_solved INT DEFAULT 0,
    easy_solved INT DEFAULT 0,
    medium_solved INT DEFAULT 0,
    hard_solved INT DEFAULT 0,
    acceptance_rate FLOAT DEFAULT 0.0,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. LeetCode Submissions Log
CREATE TABLE IF NOT EXISTS leetcode_submissions_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    title_slug VARCHAR(255) NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(50) DEFAULT 'Accepted',
    lang VARCHAR(50),
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Time Tracking Sessions
CREATE TABLE IF NOT EXISTS time_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 0,
    description TEXT,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Mistake & Problem Log Engine
CREATE TABLE IF NOT EXISTS mistakes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Syntax/Logic',
    root_cause TEXT NOT NULL,
    solution TEXT NOT NULL,
    prevention_rule TEXT,
    severity VARCHAR(20) DEFAULT 'medium',
    skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Universal Evidence Links
CREATE TABLE IF NOT EXISTS evidence_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Pending AI Actions
CREATE TABLE IF NOT EXISTS pending_ai_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_prompt TEXT NOT NULL,
    proposed_changes JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Action History Logs
CREATE TABLE IF NOT EXISTS action_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    payload JSONB NOT NULL,
    inverse_payload JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'applied',
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE api_keys_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_profile_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_submissions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_history ENABLE ROW LEVEL SECURITY;

-- Clean existing policies safely before creating (Prevents error 42710)
DROP POLICY IF EXISTS "Allow authenticated access api_keys_config" ON api_keys_config;
DROP POLICY IF EXISTS "Allow authenticated access projects" ON projects;
DROP POLICY IF EXISTS "Allow authenticated access tasks" ON tasks;
DROP POLICY IF EXISTS "Users can only view their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete their own tasks" ON tasks;
DROP POLICY IF EXISTS "Allow authenticated access journal_entries" ON journal_entries;
DROP POLICY IF EXISTS "Allow authenticated access skills" ON skills;
DROP POLICY IF EXISTS "Allow authenticated access notes" ON notes;
DROP POLICY IF EXISTS "Allow authenticated access topic_nodes" ON topic_nodes;
DROP POLICY IF EXISTS "Allow authenticated access github_repos" ON github_repos;
DROP POLICY IF EXISTS "Allow authenticated access github_activity_logs" ON github_activity_logs;
DROP POLICY IF EXISTS "Allow authenticated access leetcode_profile_cache" ON leetcode_profile_cache;
DROP POLICY IF EXISTS "Allow authenticated access leetcode_submissions_log" ON leetcode_submissions_log;
DROP POLICY IF EXISTS "Allow authenticated access time_sessions" ON time_sessions;
DROP POLICY IF EXISTS "Allow authenticated access mistakes" ON mistakes;
DROP POLICY IF EXISTS "Allow authenticated access evidence_links" ON evidence_links;
DROP POLICY IF EXISTS "Allow authenticated access pending_ai_actions" ON pending_ai_actions;
DROP POLICY IF EXISTS "Allow authenticated access action_history" ON action_history;

-- Create access policies for single-user system (with strict user isolation on tasks)
CREATE POLICY "Allow authenticated access api_keys_config" ON api_keys_config FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access projects" ON projects FOR ALL TO authenticated USING (true);
CREATE POLICY "Users can only view their own tasks" ON tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tasks" ON tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tasks" ON tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow authenticated access journal_entries" ON journal_entries FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access skills" ON skills FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access notes" ON notes FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access topic_nodes" ON topic_nodes FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access github_repos" ON github_repos FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access github_activity_logs" ON github_activity_logs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access leetcode_profile_cache" ON leetcode_profile_cache FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access leetcode_submissions_log" ON leetcode_submissions_log FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access time_sessions" ON time_sessions FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access mistakes" ON mistakes FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access evidence_links" ON evidence_links FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access pending_ai_actions" ON pending_ai_actions FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access action_history" ON action_history FOR ALL TO authenticated USING (true);

