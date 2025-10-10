// Utility functions for authentication
// This allows the API service to get fresh tokens without importing React hooks

let authContextInstance: any = null;

export const setAuthContext = (context: any) => {
  authContextInstance = context;
};

export const getFreshToken = async (): Promise<string | null> => {
  try {
    if (!authContextInstance?.ensureFreshToken) {
      console.log('Auth context not available, falling back to stored token');
      // Fallback to stored token
      if (typeof window !== 'undefined') {
        const storedToken = localStorage.getItem('clerk_session_token');
        console.log('Using stored token:', storedToken ? 'Present' : 'Missing');
        return storedToken;
      }
      return null;
    }
    
    console.log('Getting fresh token from auth context...');
    const freshToken = await authContextInstance.ensureFreshToken();
    console.log('Fresh token obtained:', freshToken ? 'Present' : 'Missing');
    return freshToken;
  } catch (error) {
    console.error('Error getting fresh token:', error);
    // Fallback to stored token
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('clerk_session_token');
      console.log('Fallback to stored token:', storedToken ? 'Present' : 'Missing');
      return storedToken;
    }
    return null;
  }
};
