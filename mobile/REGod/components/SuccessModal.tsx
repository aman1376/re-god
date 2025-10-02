import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SuccessModalProps {
  visible: boolean;
  onContinue: () => void;
  title?: string;
  subtitle?: string;
  buttonText?: string;
}

const { width, height } = Dimensions.get('window');

export default function SuccessModal({ 
  visible, 
  onContinue, 
  title = "Nice work!",
  subtitle = "You've unlocked the next lesson!",
  buttonText = "Continue"
}: SuccessModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onContinue}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.content}>
            {/* Unlocked Padlock Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="lock-open" size={80} color="white" />
            </View>
            
            {/* Title */}
            <Text style={styles.title}>{title}</Text>
            
            {/* Subtitle */}
            <Text style={styles.subtitle}>{subtitle}</Text>
            
            {/* Continue Button */}
            <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
              <Text style={styles.continueButtonText}>{buttonText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Black translucent background
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.85,
    maxWidth: 400,
    backgroundColor: 'transparent',
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  iconContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  continueButton: {
    backgroundColor: '#6B8E23', // Green color matching app theme
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 150,
    alignItems: 'center',
  },
  continueButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

