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

async function setupUser() {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  
  if (listErr) {
    console.error('Error listing users:', listErr.message);
    return;
  }

  console.log('Existing users count:', users.length);

  const defaultEmail = 'user@example.com';
  const defaultPassword = 'Password123!';

  const existing = users.find((u) => u.email === defaultEmail);

  if (!existing) {
    console.log(`Creating user: ${defaultEmail}...`);
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: defaultEmail,
      password: defaultPassword,
      email_confirm: true,
    });

    if (createErr) {
      console.error('Error creating user:', createErr.message);
    } else {
      console.log(`✅ User created successfully! ID: ${newUser.user?.id}`);
    }
  } else {
    console.log(`✅ User already exists: ${defaultEmail}`);
  }
}

setupUser();
