import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import TeacherCodeInput from '../components/TeacherCodeInput';

export default function TeacherCodeScreen() {
  const router = useRouter();
  const { user, checkTeacherAssignment, logout } = useAuth();
  const [checkingAssignment, setCheckingAssignment] = useState(true);

  useEffect(() => {
    checkTeacherAssignmentStatus();
  }, []);

  const checkTeacherAssignmentStatus = async () => {
    try {
      setCheckingAssignment(true);
      const hasTeacher = await checkTeacherAssignment();
      
      if (hasTeacher) {
        // User already has a teacher assigned, proceed to app
        router.replace('/(tabs)');
      } else {
        // User needs to enter teacher code
        setCheckingAssignment(false);
      }
    } catch (error) {
      console.error('Error checking teacher assignment:', error);
      setCheckingAssignment(false);
    }
  };

  const handleSuccess = () => {
    // Teacher code was successfully used, proceed to app
    router.replace('/(tabs)');
  };

  const handleCancel = async () => {
    // User cancelled, log them out
    try {
      await logout();
      router.replace('/auth');
    } catch (error) {
      console.error('Error during logout:', error);
      router.replace('/auth');
    }
  };

  if (checkingAssignment) {
    return (
      <View style={styles.loadingContainer}>
        {/* You can add a loading spinner here if needed */}
      </View>
    );
  }

  return (
    <TeacherCodeInput
      onSuccess={handleSuccess}
      onCancel={handleCancel}
      userEmail={user?.email || 'User'}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
});

