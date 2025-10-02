// Configuration constants for the app
export const CONFIG = {
  // Clerk Configuration
  CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_ZGl2aW5lLXVyY2hpbi04Mi5jbGVyay5hY2NvdW50cy5kZXYk',
  
  // API Configuration - Auto-switching between Cloudflare tunnel and local
  API_BASE_URL: (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://saint-bennett-attachment-quizzes.trycloudflare.com/api'),
  
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
