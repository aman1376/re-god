/**
 * Supabase Configuration Validator for Admin Portal
 * Run this to validate your Supabase setup
 * 
 * Usage:
 * npx ts-node scripts/validate-supabase.ts
 */

console.log('\n🔍 Validating Admin Portal Supabase Configuration...\n');

// Load environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

// Validation checks
const checks = {
  apiBaseUrl: {
    name: 'API Base URL',
    value: API_BASE_URL,
    valid: !!API_BASE_URL && API_BASE_URL.includes('http'),
    required: true,
  },
  clerkKey: {
    name: 'Clerk Publishable Key',
    value: CLERK_KEY,
    valid: !!CLERK_KEY && CLERK_KEY.length > 20,
    required: true,
  },
  supabaseUrl: {
    name: 'Supabase URL',
    value: SUPABASE_URL,
    valid: !!SUPABASE_URL && SUPABASE_URL.includes('supabase.co'),
    required: false,
  },
  supabaseKey: {
    name: 'Supabase Anon Key',
    value: SUPABASE_ANON_KEY,
    valid: !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20,
    required: false,
  },
};

let hasRequired = true;
let hasSupabase = true;

console.log('📋 Configuration Check:\n');

Object.entries(checks).forEach(([key, check]) => {
  const status = check.valid ? '✅' : (check.required ? '❌' : '⚠️');
  const displayValue = check.value 
    ? (check.value.length > 50 ? check.value.substring(0, 50) + '...' : check.value)
    : '(not set)';
  const requiredLabel = check.required ? ' [REQUIRED]' : ' [OPTIONAL]';
  
  console.log(`${status} ${check.name}${requiredLabel}`);
  console.log(`   ${displayValue}\n`);
  
  if (!check.valid && check.required) {
    hasRequired = false;
  }
  
  if (!check.valid && !check.required) {
    hasSupabase = false;
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (hasRequired && hasSupabase) {
  console.log('✅ Perfect! All configurations are set!\n');
  console.log('Your admin portal will:');
  console.log('  ✓ Upload images to Supabase');
  console.log('  ✓ Use structured folder hierarchy');
  console.log('  ✓ Fall back to local if Supabase fails\n');
  console.log('Next: npm run dev\n');
} else if (hasRequired && !hasSupabase) {
  console.log('⚠️  Required config OK, Supabase not configured\n');
  console.log('Your admin portal will:');
  console.log('  ✓ Work normally with local backend storage');
  console.log('  ✗ Not use Supabase cloud storage\n');
  console.log('To enable Supabase:');
  console.log('  1. Follow SUPABASE_SETUP_GUIDE.md');
  console.log('  2. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.log('  3. Restart: npm run dev\n');
} else {
  console.log('❌ Missing required configuration!\n');
  console.log('Please:');
  console.log('  1. Copy env.example to .env');
  console.log('  2. Fill in the required values');
  console.log('  3. See ENVIRONMENT_SETUP_COMPLETE.md for help\n');
}

// Additional connectivity tests (if configured)
if (hasRequired && hasSupabase) {
  console.log('🔄 Testing Supabase connectivity...\n');
  
  fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
    }
  })
    .then(res => {
      if (res.ok || res.status === 404) {
        console.log('✅ Supabase is reachable!\n');
      } else {
        console.log(`⚠️  Supabase responded with status ${res.status}\n`);
      }
    })
    .catch(err => {
      console.log('❌ Could not reach Supabase:', err.message);
      console.log('   This is OK if you\'re offline or Supabase is down.');
      console.log('   The system will automatically fall back to local storage.\n');
    });
}



