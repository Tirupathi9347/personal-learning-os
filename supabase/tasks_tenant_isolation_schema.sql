-- Personal Learning OS: Tasks Tenant Isolation & RLS Security Hardening (M-2)
-- Replaces permissive USING (true) policy with strict tenant isolation (auth.uid() = user_id).

-- 1. Ensure user_id column exists on tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Ensure RLS is enabled on tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 3. Safely drop previous permissive or legacy policies
DROP POLICY IF EXISTS "Allow authenticated access tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can only view their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can insert their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.tasks;

-- 4. Create granular user-isolated RLS policies for authenticated users
CREATE POLICY "Users can only view their own tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
