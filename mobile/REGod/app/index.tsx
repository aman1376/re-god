import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';

export default function Index() {
  const { isAuthenticated, loading, user, checkTeacherAssignment } = useAuth();
  const [checkingTeacher, setCheckingTeacher] = useState(false);

  useEffect(() => {
    console.log('Index useEffect triggered - isAuthenticated:', isAuthenticated, 'loading:', loading, 'user:', !!user);
    if (!loading) {
      if (isAuthenticated) {
        // User is authenticated, check if they have a teacher assigned
        checkTeacherAssignmentFlow();
      } else {
        // User is not authenticated, go to auth screen
        console.log('User is not authenticated, navigating to auth screen');
        try {
          router.replace('/auth');
          console.log('Navigation to auth screen initiated');
        } catch (error) {
          console.error('Navigation error:', error);
        }
      }
    }
  }, [isAuthenticated, loading, user]);

  const checkTeacherAssignmentFlow = async () => {
    try {
      setCheckingTeacher(true);
      console.log('Checking teacher assignment for authenticated user');
      
      const hasTeacher = await checkTeacherAssignment();
      
      if (hasTeacher) {
        // User has a teacher assigned, go to main app
        console.log('User has teacher assigned, navigating to main app');
        router.replace('/(tabs)/course');
      } else {
        // User needs to enter teacher code
        console.log('User needs teacher assignment, navigating to teacher code screen');
        router.replace('/teacher-code');
      }
    } catch (error) {
      console.error('Error checking teacher assignment:', error);
      // On error, assume they need teacher assignment
      router.replace('/teacher-code');
    } finally {
      setCheckingTeacher(false);
    }
  };

  // Show loading indicator while determining authentication state or checking teacher assignment
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f2ec' }}>
      <ActivityIndicator size="large" color="#6B8E23" />
    </View>
  );
}









