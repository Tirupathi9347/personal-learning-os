import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function checkRest() {
  console.log('Testing RPC SQL execution...');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf-8');
  
  // Try via rpc
  const { data, error } = await supabase.rpc('exec_sql', { sql: schemaSql });
  if (error) {
    console.log('RPC exec_sql not available:', error.message);
  } else {
    console.log('✅ Schema applied via RPC exec_sql!');
  }
}

checkRest();
