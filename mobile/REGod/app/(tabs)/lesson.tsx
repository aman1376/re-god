import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ApiService, { type Module } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function LessonScreen() {
  const { moduleId, courseId } = useLocalSearchParams<{ moduleId: string; courseId?: string }>();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (moduleId && isAuthenticated && !authLoading) {
      loadModule();
    }
  }, [moduleId, isAuthenticated, authLoading]);

  const loadModule = async () => {
    try {
      setLoading(true);
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      
      // Get all modules for the course and find the specific one
      const modules = await ApiService.getCourseModules(Number(courseId));
      const foundModule = modules.find(m => m.id === Number(moduleId));
      
      if (!foundModule) {
        throw new Error('Lesson not found');
      }
      
      // console.log('Found module:', foundModule);
      // console.log('Module header_image_url:', foundModule.header_image_url);
      setModule(foundModule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lesson');
      console.error('Error loading lesson:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResponsePress = () => {
    // TODO: Implement response functionality
    Alert.alert('Response', 'Response functionality will be implemented soon');
  };

  const handleActionPress = (action: string) => {
    if (!module) return;
    
    let content = '';
    switch (action) {
      case 'further_study':
        content = module.further_study || 'No further study content available';
        break;
      case 'personal_experiences':
        content = module.personal_experiences || 'No personal experiences content available';
        break;
      case 'resources':
        content = module.resources || 'No resources available';
        break;
      case 'artwork':
        content = module.artwork || 'No artwork available';
        break;
    }
    
    Alert.alert(action.replace('_', ' ').toUpperCase(), content);
  };

  // Helper function to convert relative URLs to full URLs
  const getImageUrl = (imageUrl: string | null): any => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http')) return { uri: imageUrl };
    const fullUrl = `https://bf5773da486c.ngrok-free.app${imageUrl}`;
    console.log('Generated image URL:', fullUrl);
    return { uri: fullUrl };
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>
            {authLoading ? 'Authenticating...' : 'Loading lesson...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Please log in to view lessons</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadModule}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!module) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Lesson not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header Image */}
        {module.header_image_url ? (
          <Image 
            source={getImageUrl(module.header_image_url)}
            style={styles.headerImage}
            onError={(error) => {
              console.log('Image loading error:', error);
            }}
            onLoad={() => {
              console.log('Image loaded successfully');
            }}
          />
        ) : (
          <View style={styles.headerPlaceholder}>
            <Ionicons name="image-outline" size={64} color="gray" />
            <Text style={styles.placeholderText}>No image available</Text>
          </View>
        )}
        
        <View style={styles.contentContainer}>
          {/* Title */}
          <Text style={styles.title}>{module.title}</Text>

          {/* Content */}
          {module.content && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Content</Text>
              <Text style={styles.contentText}>{module.content}</Text>
            </View>
          )}

          {/* Key Verses */}
          {module.key_verses && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key verses</Text>
              <View style={styles.keyVersesCard}>
                <Text style={styles.keyVersesText}>{module.key_verses}</Text>
                {module.key_verses_ref && (
                  <Text style={styles.keyVersesReference}>Reference: {module.key_verses_ref}</Text>
                )}
              </View>
            </View>
          )}

          {/* Lesson Study */}
          {module.lesson_study && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lesson study</Text>
              <Text style={styles.contentText}>{module.lesson_study}</Text>
              {module.lesson_study_ref && (
                <Text style={styles.referenceText}>Reference: {module.lesson_study_ref}</Text>
              )}
            </View>
          )}

          {/* Response Unlock */}
          {module.response_prompt && (
            <View style={styles.unlockSection}>
              <Ionicons name="lock-closed" size={32} color="gray" />
              <Text style={styles.unlockText}>Respond to unlock the next lesson</Text>
              <Text style={styles.promptText}>{module.response_prompt}</Text>
              <TouchableOpacity style={styles.responseButton} onPress={handleResponsePress}>
                <Text style={styles.responseButtonText}>Response</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Music Selection */}
          {module.music_selection && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Music selection</Text>
              <View style={styles.musicCard}>
                <View style={styles.musicContent}>
                  <Text style={styles.musicTitle}>{module.music_selection}</Text>
                  {module.media_url && (
                    <TouchableOpacity style={styles.playButton}>
                      <Ionicons name="play" size={16} color="white" />
                      <Text style={styles.playButtonText}>Play</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {module.further_study && (
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={() => handleActionPress('further_study')}
              >
                <Text style={styles.actionButtonText}>Further study</Text>
              </TouchableOpacity>
            )}
            {module.personal_experiences && (
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleActionPress('personal_experiences')}
              >
                <Text style={styles.actionButtonText}>Personal Experiences</Text>
              </TouchableOpacity>
            )}
            {module.resources && (
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleActionPress('resources')}
              >
                <Text style={styles.actionButtonText}>Resources</Text>
              </TouchableOpacity>
            )}
            {module.artwork && (
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleActionPress('artwork')}
              >
                <Text style={styles.actionButtonText}>Artwork</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF9F4',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6B8E23',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#6B8E23',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  headerImage: {
    width: '100%',
    height: 250,
  },
  headerPlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 8,
    fontSize: 14,
    color: 'gray',
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  contentText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  referenceText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  unlockSection: {
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginVertical: 20,
  },
  unlockText: {
    fontSize: 16,
    color: 'gray',
    textAlign: 'center',
    marginVertical: 10,
  },
  promptText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  responseButton: {
    backgroundColor: '#6B8E23',
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 20,
  },
  responseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  keyVersesCard: {
    backgroundColor: '#6B8E23',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  keyVersesText: {
    fontSize: 16,
    lineHeight: 24,
    color: 'white',
    marginBottom: 8,
  },
  keyVersesReference: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontStyle: 'italic',
  },
  musicCard: {
    backgroundColor: '#6B8E23',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  musicContent: {
    flex: 1,
  },
  musicTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
    marginBottom: 8,
  },
  playButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  playButtonText: {
    color: 'white',
    fontSize: 12,
    marginLeft: 4,
  },
  actionButtons: {
    marginTop: 20,
  },
  actionButton: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});