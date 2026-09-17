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

async function checkConnection() {
  console.log('Connecting to Supabase at:', url);
  
  const tables = ['api_keys_config', 'tasks', 'journal_entries', 'pending_ai_actions', 'action_history'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ Table '${table}': ${error.message} (Code: ${error.code})`);
    } else {
      console.log(`✅ Table '${table}': Accessible!`);
    }
  }
}

checkConnection();
