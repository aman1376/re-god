import { useEffect } from 'react';
import { router } from 'expo-router';

export default function Index() {
  useEffect(() => {
    // Navigate to auth screen on app start
    router.replace('/auth');
  }, []);

  return null;
}





