// Configuration constants for the app
export const CONFIG = {
  // Clerk Configuration
  CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_ZGl2aW5lLXVyY2hpbi04Mi5jbGVyay5hY2NvdW50cy5kZXYk',
  
  // API Configuration - Auto-switching between ngrok and local
  API_BASE_URL: (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://bf5773da486c.ngrok-free.app/api'),
  
  // App Configuration
  APP_NAME: 'RE-God',
  VERSION: '1.0.0',
};

// Validation
if (!CONFIG.CLERK_PUBLISHABLE_KEY) {
  console.warn('Warning: CLERK_PUBLISHABLE_KEY is not set. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment variables.');
}
