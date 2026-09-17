import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function testOperations() {
  console.log('--- TESTING TASK INSERT ---');
  const { data: insertedTask, error: insertErr } = await supabase
    .from('tasks')
    .insert({
      title: 'Diagnostic Test Task',
      description: 'Testing task creation and retrieval',
      priority: 'high',
      status: 'todo',
    })
    .select()
    .single();

  if (insertErr) {
    console.error('❌ Insert Task Error:', insertErr);
  } else {
    console.log('✅ Task Inserted Successfully:', insertedTask);
  }

  console.log('\n--- TESTING TASK SELECT ---');
  const { data: tasks, error: selectErr } = await supabase.from('tasks').select('*');
  if (selectErr) {
    console.error('❌ Select Task Error:', selectErr);
  } else {
    console.log(`✅ Tasks Fetched (${tasks.length} total):`, tasks);
  }
}

testOperations();
