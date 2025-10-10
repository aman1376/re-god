import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import ApiService from '../src/services/api';

interface TeacherCodeInputProps {
  userEmail: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function TeacherCodeInput({ userEmail, onSuccess, onCancel }: TeacherCodeInputProps) {
  const [teacherCode, setTeacherCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!teacherCode.trim()) {
      Alert.alert('Error', 'Please enter a teacher code');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get user ID from AsyncStorage (stored during clerkExchange)
      const userDataString = await ApiService.getStoredUserData();
      console.log('TeacherCodeInput: Retrieved user data string:', userDataString);
      
      if (!userDataString) {
        Alert.alert('Error', 'User data not found. Please try signing in again.');
        setIsSubmitting(false);
        return;
      }

      const userData = JSON.parse(userDataString);
      console.log('TeacherCodeInput: Parsed user data:', userData);
      
      // Submit teacher code using the correct student endpoint
      const response = await fetch(`${await ApiService.base()}/use-teacher-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await ApiService.getStoredToken()}`
        },
        body: JSON.stringify({
          code: teacherCode.trim().toUpperCase(),
          user_data: userData  // Include user data in case token is not valid
        })
      });

      if (response.ok) {
        const data = await response.json();
        Alert.alert(
          'Success!',
          data.message || 'Teacher code accepted! You now have access to your teacher\'s courses.',
          [
            {
              text: 'Continue',
              onPress: () => {
                // Re-run clerk exchange to get new tokens
                handleTokenRefresh();
              }
            }
          ]
        );
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.detail || 'Invalid teacher code. Please check and try again.');
      }
    } catch (error) {
      console.error('Teacher code submission error:', error);
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTokenRefresh = async () => {
    try {
      // Re-run clerk exchange to get new JWT tokens
      await ApiService.clerkExchange(userEmail);
      onSuccess();
    } catch (error) {
      console.error('Token refresh error:', error);
      Alert.alert('Error', 'Failed to refresh authentication. Please try signing in again.');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView 
        style={styles.keyboardContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback>
          <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Teacher Access Required</Text>
          <Text style={styles.subtitle}>You're signed in as:</Text>
          <Text style={styles.email}>{userEmail}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Teacher Code</Text>
          <TextInput
            style={styles.input}
            value={teacherCode}
            onChangeText={(text) => setTeacherCode(text.toUpperCase())}
            placeholder="Enter your teacher code"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isSubmitting}
          />

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting || !teacherCode.trim()}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Teacher Code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Don't have a teacher code? Contact your administrator for access.
          </Text>
        </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  content: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(208, 216, 192, 0.95)',
    borderRadius: 20,
    padding: 24,
    // shadowColor: '#000',
    // shadowOffset: {
    //   width: 0,
    //   height: 10,
    // },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    backdropFilter: 'blur(10px)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    marginTop: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(204, 204, 204, 0.8)',
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.8,
  },
});