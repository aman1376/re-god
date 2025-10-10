/**
 * Setup Validation Script
 * Run this to validate your Supabase configuration
 * 
 * Usage:
 * npx ts-node scripts/validate-setup.ts
 */

import { CONFIG } from '../src/config/constants';

console.log('\n🔍 Validating RE-God Setup...\n');

// Validation checks
const checks = {
  clerkKey: {
    name: 'Clerk Publishable Key',
    value: CONFIG.CLERK_PUBLISHABLE_KEY,
    valid: !!CONFIG.CLERK_PUBLISHABLE_KEY && CONFIG.CLERK_PUBLISHABLE_KEY.length > 20,
  },
  apiBaseUrl: {
    name: 'API Base URL',
    value: CONFIG.API_BASE_URL,
    valid: !!CONFIG.API_BASE_URL && CONFIG.API_BASE_URL.includes('http'),
  },
  supabaseUrl: {
    name: 'Supabase URL',
    value: CONFIG.SUPABASE_URL,
    valid: !!CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL.includes('supabase.co'),
  },
  supabaseKey: {
    name: 'Supabase Anon Key',
    value: CONFIG.SUPABASE_ANON_KEY,
    valid: !!CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_ANON_KEY.length > 20,
  },
  supabaseVideoUrl: {
    name: 'Supabase Video URL',
    value: CONFIG.SUPABASE_VIDEO_URL,
    valid: !!CONFIG.SUPABASE_VIDEO_URL && CONFIG.SUPABASE_VIDEO_URL.includes('supabase.co') && CONFIG.SUPABASE_VIDEO_URL.includes('videos'),
  },
};

let allValid = true;

console.log('📋 Configuration Check:\n');

Object.entries(checks).forEach(([key, check]) => {
  const status = check.valid ? '✅' : '❌';
  const displayValue = check.value 
    ? (check.value.length > 50 ? check.value.substring(0, 50) + '...' : check.value)
    : '(not set)';
  
  console.log(`${status} ${check.name}`);
  console.log(`   ${displayValue}\n`);
  
  if (!check.valid) {
    allValid = false;
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (allValid) {
  console.log('✅ All configuration checks passed!\n');
  console.log('Next steps:');
  console.log('1. Upload your auth video to Supabase videos bucket');
  console.log('2. Run: npm start');
  console.log('3. Test the app on your device/simulator\n');
} else {
  console.log('❌ Some configuration checks failed!\n');
  console.log('Please:');
  console.log('1. Copy env.example to .env');
  console.log('2. Fill in the missing values');
  console.log('3. Follow SUPABASE_SETUP_GUIDE.md for detailed instructions\n');
}

// Export for use in other scripts
export { checks };



