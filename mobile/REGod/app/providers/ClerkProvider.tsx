import React from 'react';
import { ClerkProvider as ClerkProviderBase } from '@clerk/clerk-expo';
import { CONFIG } from '../config/constants';

if (!CONFIG.CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment variables.');
}

interface ClerkProviderProps {
  children: React.ReactNode;
}

export const ClerkProvider: React.FC<ClerkProviderProps> = ({ children }) => {
  return (
    <ClerkProviderBase
      publishableKey={CONFIG.CLERK_PUBLISHABLE_KEY}
      // Add any additional Clerk configuration here
    >
      {children}
    </ClerkProviderBase>
  );
};
