import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';

export default function AddNoteScreen() {
  const router = useRouter();
  
  // This screen should never be displayed as it's just a tab button
  // The actual functionality is handled by the tab button in _layout.tsx
  // which navigates to /new-note
  
  React.useEffect(() => {
    // Redirect to new-note if somehow this screen is accessed
    router.replace('/new-note');
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Redirecting to new note...</Text>
    </View>
  );
}



