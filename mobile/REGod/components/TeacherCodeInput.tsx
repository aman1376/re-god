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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ApiService from '../src/services/api';

interface TeacherCodeInputProps {
  onSuccess: () => void;
  onCancel: () => void;
  userEmail: string;
}

export default function TeacherCodeInput({ onSuccess, onCancel, userEmail }: TeacherCodeInputProps) {
  const [teacherCode, setTeacherCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!teacherCode.trim()) {
      Alert.alert('Teacher Code Required', 'Please enter a teacher code to continue');
      return;
    }

    try {
      setLoading(true);
      const result = await ApiService.useTeacherCode(teacherCode.trim());
      
      if (result.success) {
        Alert.alert(
          'Success!',
          `You have been assigned to ${result.teacher_name || 'your teacher'}. You can now access the app.`,
          [{ text: 'Continue', onPress: onSuccess }]
        );
      } else {
        Alert.alert('Invalid Code', result.message);
      }
    } catch (error) {
      console.error('Error using teacher code:', error);
      Alert.alert('Error', 'Failed to verify teacher code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="school" size={60} color="#6B8E23" />
          <Text style={styles.title}>Teacher Assignment Required</Text>
          <Text style={styles.subtitle}>
            Welcome {userEmail}! To access the app, you need to be assigned to a teacher.
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Teacher Code</Text>
          <TextInput
            style={styles.input}
            value={teacherCode}
            onChangeText={setTeacherCode}
            placeholder="Enter your teacher's code"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
          />
          <Text style={styles.helpText}>
            Ask your teacher for the code to get started
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onCancel}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton, loading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#333',
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  submitButton: {
    backgroundColor: '#6B8E23',
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

