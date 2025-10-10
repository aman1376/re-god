// Configuration constants for the app
export const CONFIG = {
  // Clerk Configuration
  CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_ZGl2aW5lLXVyY2hpbi04Mi5jbGVyay5hY2NvdW50cy5kZXYk',
  
  // API Configuration - Use environment variable or default to local
  API_BASE_URL: (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000/api'),
  
  // Supabase Configuration
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  SUPABASE_VIDEO_URL: process.env.EXPO_PUBLIC_SUPABASE_VIDEO_URL || '',
  
  // App Configuration
  APP_NAME: 'RE-God',
  VERSION: '1.0.0',
};

// Helper function to get full image URL
export const getImageUrl = (imageUrl: string | null): string | null => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  
  // Extract base URL from API_BASE_URL (remove /api suffix)
  const baseUrl = CONFIG.API_BASE_URL.replace('/api', '');
  return `${baseUrl}${imageUrl}`;
};

// Validation
if (!CONFIG.CLERK_PUBLISHABLE_KEY) {
  console.warn('Warning: CLERK_PUBLISHABLE_KEY is not set. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment variables.');
}

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  console.warn('Warning: Supabase configuration is incomplete. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment variables.');
}

if (!CONFIG.SUPABASE_VIDEO_URL) {
  console.warn('Warning: SUPABASE_VIDEO_URL is not set. Video caching will not work. Please set EXPO_PUBLIC_SUPABASE_VIDEO_URL in your environment variables.');
}
