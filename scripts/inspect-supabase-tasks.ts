import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    envVars[key] = val;
  }
}

const url = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const serviceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const anonKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];


async function inspect() {
  console.log('Connecting to Supabase (READ-ONLY INSPECTION)...');
  console.log('URL:', url);

  const supabaseService = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const supabaseAnon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Fetch all tasks via service role (bypasses RLS)
  const { data: allTasks, error: tasksErr } = await supabaseService
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (tasksErr) {
    console.error('Error fetching tasks via service-role:', tasksErr);
    return;
  }

  console.log(`\n=== 1. Tasks Table Analysis (Total rows: ${allTasks?.length ?? 0}) ===`);

  if (allTasks && allTasks.length > 0) {
    console.log(`All ${allTasks.length} task rows in production:`);
    allTasks.forEach((t, i) => {
      console.log(`[Task ${i + 1}] ID: ${t.id} | Title: "${t.title}" | Status: ${t.status} | user_id: ${t.user_id} | idempotency_key: ${t.idempotency_key} | created_at: ${t.created_at}`);
    });

    const sample = allTasks[0];
    const hasUserIdCol = 'user_id' in sample;
    const hasIdempotencyKeyCol = 'idempotency_key' in sample;

    console.log(`\n- 'user_id' column present in table: ${hasUserIdCol}`);
    console.log(`- 'idempotency_key' column present in table: ${hasIdempotencyKeyCol}`);

    let nullUserIdCount = 0;
    let notNullUserIdCount = 0;
    const userIdCounts: Record<string, number> = {};

    for (const t of allTasks) {
      if (t.user_id === null || t.user_id === undefined) {
        nullUserIdCount++;
        userIdCounts['NULL'] = (userIdCounts['NULL'] || 0) + 1;
      } else {
        notNullUserIdCount++;
        const masked = `${String(t.user_id).substring(0, 8)}...`;
        userIdCounts[masked] = (userIdCounts[masked] || 0) + 1;
      }
    }

    console.log(`- Tasks where user_id IS NULL: ${nullUserIdCount}`);
    console.log(`- Tasks where user_id IS NOT NULL: ${notNullUserIdCount}`);
    console.log('- Tasks grouped by user_id:', userIdCounts);

    const withIdempotencyKey = allTasks.filter((t) => t.idempotency_key != null);
    console.log(`- Tasks with non-null idempotency_key: ${withIdempotencyKey.length}`);
  } else {
    console.log('Table tasks is currently EMPTY.');
    // Let's check table definition by attempting a dummy filter
    const { data: testCol, error: colErr } = await supabaseService
      .from('tasks')
      .select('id, user_id, idempotency_key')
      .limit(1);

    if (colErr) {
      console.log('Error querying id, user_id, idempotency_key:', colErr.message);
    } else {
      console.log('Columns id, user_id, idempotency_key are all queryable without error.');
    }
  }

  // 2. Test RLS status using Anon Client
  console.log('\n=== 2. RLS & Anonymous Access Inspection ===');
  const { data: anonData, error: anonErr } = await supabaseAnon
    .from('tasks')
    .select('id')
    .limit(5);

  if (anonErr) {
    console.log('Anon client query result: ERROR ->', anonErr.message, `(code: ${anonErr.code})`);
  } else {
    console.log(`Anon client query result: SUCCESS -> returned ${anonData?.length} rows (Anon can read? RLS may be allowing or disabled)`);
  }

  // 3. Try to check system catalogs if RPC or exposure exists
  console.log('\n=== 3. Schema Catalog Inspection (if accessible) ===');
  try {
    const { data: schemaData, error: schemaErr } = await supabaseService
      .rpc('get_schema_info')
      .select();
    if (schemaErr) {
      console.log('RPC get_schema_info not available (expected on standard Supabase setup).');
    } else {
      console.log('Schema info:', schemaData);
    }
  } catch (e) {}

  console.log('\nRead-only inspection completed.');
}

inspect().catch(console.error);
