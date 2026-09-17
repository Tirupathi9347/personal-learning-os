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

async function testPhase2Crud() {
  console.log('--- TESTING PROJECT INSERT ---');
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .insert({
      title: 'Diagnostic Test Project',
      slug: 'diagnostic-test-project',
      description: 'Testing project creation',
      status: 'active',
    })
    .select()
    .single();

  if (projErr) {
    console.error('❌ Insert Project Error:', projErr);
  } else {
    console.log('✅ Project Inserted Successfully:', project);
  }

  console.log('\n--- TESTING NOTE INSERT ---');
  const { data: note, error: noteErr } = await supabase
    .from('notes')
    .insert({
      title: 'Diagnostic Test Note',
      content: 'Testing note content creation',
      category: 'Computer Vision',
      tags: ['test', 'diagnostic'],
    })
    .select()
    .single();

  if (noteErr) {
    console.error('❌ Insert Note Error:', noteErr);
  } else {
    console.log('✅ Note Inserted Successfully:', note);
  }

  console.log('\n--- TESTING SKILL INSERT ---');
  const { data: skill, error: skillErr } = await supabase
    .from('skills')
    .insert({
      name: 'Diagnostic Skill',
      category: 'Machine Learning',
      proficiency_level: 3,
      target_level: 5,
    })
    .select()
    .single();

  if (skillErr) {
    console.error('❌ Insert Skill Error:', skillErr);
  } else {
    console.log('✅ Skill Inserted Successfully:', skill);
  }
}

testPhase2Crud();
