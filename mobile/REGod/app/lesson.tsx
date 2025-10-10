import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, StatusBar} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MusicCard from '@/components/MusicCard';
import SuccessModal from '@/components/SuccessModal';
import ApiService, { type Module } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { getImageUrl } from '../src/config/constants';
import * as WebBrowser from 'expo-web-browser';

// Types for quiz and reflection functionality
interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'reflection' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer?: string;
  required: boolean;
}

interface QuizResponse {
  questionId: string;
  question: string;
  answer: string;
  type: QuizQuestion['type'];
}

interface ResponseModalProps {
  visible: boolean;
  onClose: () => void;
  questions: QuizQuestion[];
  onSubmit: (responses: QuizResponse[]) => void;
  title: string;
}

export default function LessonScreen() {
  const { moduleId, courseId } = useLocalSearchParams<{ moduleId: string; courseId?: string }>();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [reflectionText, setReflectionText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [nextModule, setNextModule] = useState<Module | null>(null);
  
  // Teacher/Admin management states
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // Content modal states
  const [showContentModal, setShowContentModal] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [quizScore, setQuizScore] = useState<number | null>(null);
  
  // Check if user is teacher or admin
  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';
  
  // Debug logging
  console.log('Lesson Screen Debug:', {
    user: user,
    userRole: user?.role,
    isTeacherOrAdmin: isTeacherOrAdmin,
    courseId: courseId,
    moduleId: module?.id
  });

  // Response Modal Component
  function ResponseModal({ visible, onClose, questions, onSubmit, title }: ResponseModalProps) {
    const [currentResponses, setCurrentResponses] = useState<QuizResponse[]>([]);
    const [currentReflection, setCurrentReflection] = useState('');
    const currentQuestion = questions[currentQuestionIndex];

    const handleAnswerSelect = (answer: string) => {
      const newResponse: QuizResponse = {
        questionId: currentQuestion.id,
        question: currentQuestion.question,
        answer,
        type: currentQuestion.type
      };

      setCurrentResponses(prev => {
        const filtered = prev.filter(r => r.questionId !== currentQuestion.id);
        return [...filtered, newResponse];
      });
    };

    const handleNext = () => {
      // Save current response before moving to next question
      if (currentQuestion.type === 'reflection' && currentReflection.trim()) {
        const newResponse: QuizResponse = {
          questionId: currentQuestion.id,
          question: currentQuestion.question,
          answer: currentReflection,
          type: currentQuestion.type
        };
        setCurrentResponses(prev => {
          const filtered = prev.filter(r => r.questionId !== currentQuestion.id);
          return [...filtered, newResponse];
        });
      }
      
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        // Clear reflection text for next question
        setCurrentReflection('');
      } else {
        onSubmit(currentResponses);
      }
    };

    const handlePrevious = () => {
      if (currentQuestionIndex > 0) {
        setCurrentQuestionIndex(prev => prev - 1);
      }
    };

    const canProceed = () => {
      if (!currentQuestion.required) return true;
      const response = currentResponses.find(r => r.questionId === currentQuestion.id);
      
      // For reflection questions, check if there's text in the reflection input
      if (currentQuestion.type === 'reflection') {
        return currentReflection.trim().length > 0;
      }
      
      // For other question types, check if there's a response
      return response && response.answer.trim().length > 0;
    };

    if (!currentQuestion) return null;

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={responseModalStyles.container}>
          <View style={responseModalStyles.header}>
            <Text style={responseModalStyles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={responseModalStyles.closeButton}>
              <Ionicons name="close" size={24} color="black" />
            </TouchableOpacity>
          </View>

          <View style={responseModalStyles.progressContainer}>
            <Text style={responseModalStyles.progressText}>
              {currentQuestionIndex + 1} of {questions.length}
            </Text>
            <View style={responseModalStyles.progressBar}>
              <View style={[responseModalStyles.progressFill, { width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }]} />
            </View>
          </View>

          <ScrollView style={responseModalStyles.content}>
            <View style={responseModalStyles.questionContainer}>
              <Text style={responseModalStyles.questionTitle}>{currentQuestion.question}</Text>

              {currentQuestion.type === 'reflection' && (
                <TextInput
                  style={responseModalStyles.reflectionInput}
                  multiline
                  placeholder="Write your reflection here..."
                  value={currentReflection || currentResponses.find(r => r.questionId === currentQuestion.id)?.answer || ''}
                  onChangeText={setCurrentReflection}
                  textAlignVertical="top"
                />
              )}

              {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
                <View style={responseModalStyles.optionsContainer}>
                  {currentQuestion.options.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        responseModalStyles.option,
                        currentResponses.find(r => r.questionId === currentQuestion.id)?.answer === option &&
                        responseModalStyles.selectedOption
                      ]}
                      onPress={() => handleAnswerSelect(option)}
                    >
                      <Text style={responseModalStyles.optionText}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {currentQuestion.type === 'true_false' && (
                <View style={responseModalStyles.optionsContainer}>
                  {['True', 'False'].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        responseModalStyles.option,
                        currentResponses.find(r => r.questionId === currentQuestion.id)?.answer === option &&
                        responseModalStyles.selectedOption
                      ]}
                      onPress={() => handleAnswerSelect(option)}
                    >
                      <Text style={responseModalStyles.optionText}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {currentQuestion.type === 'short_answer' && (
                <TextInput
                  style={responseModalStyles.shortAnswerInput}
                  placeholder="Enter your answer..."
                  value={currentResponses.find(r => r.questionId === currentQuestion.id)?.answer || ''}
                  onChangeText={(text) => handleAnswerSelect(text)}
                />
              )}
            </View>
          </ScrollView>

          <View style={responseModalStyles.footer}>
            <TouchableOpacity
              style={[responseModalStyles.navButton, responseModalStyles.previousButton]}
              onPress={handlePrevious}
              disabled={currentQuestionIndex === 0}
            >
              <Text style={responseModalStyles.previousButtonText}>Previous</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                responseModalStyles.navButton,
                responseModalStyles.nextButton,
                !canProceed() && responseModalStyles.disabledButton
              ]}
              onPress={handleNext}
              disabled={!canProceed()}
            >
              <Text style={responseModalStyles.nextButtonText}>
                {currentQuestionIndex === questions.length - 1 ? 'Submit' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

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

      // Find the next module in the sequence
      const sortedModules = modules.sort((a, b) => a.order - b.order);
      const currentIndex = sortedModules.findIndex(m => m.id === Number(moduleId));
      const nextModule = currentIndex < sortedModules.length - 1 ? sortedModules[currentIndex + 1] : null;

      setModule(foundModule);
      setNextModule(nextModule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lesson');
      console.error('Error loading lesson:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuizPress = () => {
    if (!module?.quiz) {
      Alert.alert('No Quiz Available', 'This lesson does not have a quiz.');
      return;
    }

    // Parse the quiz data to create quiz questions
    const questions = parseQuizData(module.quiz);
    if (questions.length === 0) {
      Alert.alert('Quiz Error', 'Unable to load quiz questions.');
      return;
    }

    setShowResponseModal(true);
    setCurrentQuestionIndex(0);
    setResponses([]);
  };

  const parseQuizData = (quizData: any): QuizQuestion[] => {
    if (!quizData || !quizData.questions) {
      return [];
    }

    return quizData.questions.map((q: any, index: number) => {
      let type: QuizQuestion['type'] = 'multiple_choice';
      
      if (q.type === 'true_false') {
        type = 'true_false';
      } else if (q.type === 'short_answer' || q.type === 'text') {
        type = 'short_answer';
      } else if (q.type === 'reflection') {
        type = 'reflection';
      }

      return {
        id: `q${q.id || index + 1}`,
        type,
        question: q.question,
        options: q.options || undefined,
        correctAnswer: q.correct_answer?.toString(),
        required: true
      };
    });
  };

  const handleResponseSubmit = async (submittedResponses: QuizResponse[]) => {
    try {
      setShowResponseModal(false);

      // Calculate score based on true/false and MCQ questions only
      const questions = parseQuizData(module?.quiz);
      const scorableQuestions = questions.filter(q => q.type === 'true_false' || q.type === 'multiple_choice');
      const totalScorableQuestions = scorableQuestions.length;
      
      let correctAnswers = 0;
      
      if (totalScorableQuestions > 0) {
        scorableQuestions.forEach(question => {
          const response = submittedResponses.find(r => r.questionId === question.id);
          if (response && response.answer === question.correctAnswer) {
            correctAnswers++;
          }
        });
      }
      
      const scorePercentage = totalScorableQuestions > 0 ? Math.round((correctAnswers / totalScorableQuestions) * 100) : 0;
      
      console.log('Quiz Score Calculation:', {
        totalScorableQuestions,
        correctAnswers,
        scorePercentage,
        submittedResponses,
        questions: scorableQuestions.map(q => ({
          id: q.id,
          type: q.type,
          question: q.question,
          correctAnswer: q.correctAnswer,
          userAnswer: submittedResponses.find(r => r.questionId === q.id)?.answer
        }))
      });

      // Save quiz responses to backend
      if (module && courseId) {
        // Mark lesson as completed with quiz responses
        await ApiService.completeLesson(
          parseInt(courseId),
          parseInt(moduleId),
          submittedResponses
        );

        // Update course progress - let backend calculate the correct percentage
        // based on total modules in the course
        await ApiService.updateCourseProgress(
          parseInt(courseId),
          null, // Let backend calculate progress percentage
          parseInt(moduleId),
          'completed'
        );
      }

      // Show success modal with score
      setShowSuccessModal(true);
      setQuizScore(scorePercentage);
    } catch (error) {
      console.error('Error submitting quiz responses:', error);
      Alert.alert('Error', 'Failed to submit quiz responses. Please try again.');
    }
  };

  const handleActionPress = (action: string) => {
    if (!module) return;

    let content = '';
    let title = '';
    switch (action) {
      case 'further_study':
        content = module.further_study || 'No further study content available';
        title = 'Further Study';
        break;
      case 'personal_experiences':
        content = module.personal_experiences || 'No personal experiences content available';
        title = 'Personal Experiences';
        break;
      case 'resources':
        content = module.resources || 'No resources available';
        title = 'Resources';
        break;
      case 'artwork':
        content = module.artwork || 'No artwork available';
        title = 'Artwork';
        break;
    }

    setModalTitle(title);
    setModalContent(content);
    setShowContentModal(true);
  };

  // Teacher/Admin management functions
  const handleEditField = (field: string) => {
    if (!module || !isTeacherOrAdmin) return;
    
    let currentValue = '';
    switch (field) {
      case 'title':
        currentValue = module.title || '';
        break;
      case 'description':
        currentValue = module.description || '';
        break;
      case 'further_study':
        currentValue = module.further_study || '';
        break;
      case 'personal_experiences':
        currentValue = module.personal_experiences || '';
        break;
      case 'resources':
        currentValue = module.resources || '';
        break;
      case 'artwork':
        currentValue = module.artwork || '';
        break;
    }
    
    setEditingField(field);
    setEditText(currentValue);
    setShowManagementModal(true);
  };

  const handleSaveEdit = async () => {
    if (!module || !editingField || !courseId) return;
    
    try {
      // Create update data object with only the field being edited
      const updateData: Partial<Module> = {};
      
      switch (editingField) {
        case 'title':
          updateData.title = editText;
          break;
        case 'description':
          updateData.content = editText;
          break;
        case 'further_study':
          updateData.further_study = editText;
          break;
        case 'personal_experiences':
          updateData.personal_experiences = editText;
          break;
        case 'resources':
          updateData.resources = editText;
          break;
        case 'artwork':
          updateData.artwork = editText;
          break;
      }
      
      // Call API to update module
      const updatedModule = await ApiService.updateModule(parseInt(courseId), module.id, updateData);
      
      // Update local state with the response
      setModule(updatedModule);
      
      Alert.alert('Success', 'Content updated successfully!');
      setShowManagementModal(false);
      setEditingField(null);
      setEditText('');
    } catch (error) {
      console.error('Error updating content:', error);
      Alert.alert('Error', 'Failed to update content. Please try again.');
    }
  };

  const handleDeleteModule = async () => {
    if (!module || !isTeacherOrAdmin || !courseId) return;
    
    Alert.alert(
      'Delete Module',
      'Are you sure you want to delete this module? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Call API to delete module
              await ApiService.deleteModule(parseInt(courseId), module.id);
              
              Alert.alert('Success', 'Module deleted successfully!');
              router.back();
            } catch (error) {
              console.error('Error deleting module:', error);
              Alert.alert('Error', 'Failed to delete module. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleSuccessContinue = () => {
    setShowSuccessModal(false);

    if (nextModule && courseId) {
      // Navigate to next module
      router.push(`/lesson?moduleId=${nextModule.id}&courseId=${courseId}`);
    } else {
      // No next module, go back to course screen
      router.replace('/(tabs)/course');
    }
  };

  // Helper function to convert relative URLs to full URLs
  const getImageUrlWithFallback = (imageUrl: string | null): any => {
    if (!imageUrl) return null;
    const fullUrl = getImageUrl(imageUrl);
    console.log('Generated image URL:', fullUrl);
    return fullUrl ? { uri: fullUrl } : null;
  };

  if (authLoading || loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>
            {authLoading ? 'Authenticating...' : 'Loading lesson...'}
          </Text>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Please log in to view lessons</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadModule}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!module) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Course</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Lesson not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              // Fallback to course screen if no previous screen
              router.replace('/(tabs)/course');
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Course</Text>
        {isTeacherOrAdmin ? (
          <View style={styles.managementButtons}>
            <TouchableOpacity
              style={styles.managementButton}
              onPress={() => handleEditField('title')}
            >
              <Ionicons name="create-outline" size={24} color="#6B8E23" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.managementButton}
              onPress={handleDeleteModule}
            >
              <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Header Image */}
        {module.header_image_url ? (
          <View style={styles.headerImageContainer}>
            <Image
              source={getImageUrlWithFallback(module.header_image_url)}
              style={styles.headerImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.imageOverlay}
            />
            <Text style={styles.imageTitle}>{module.title}</Text>
          </View>
        ) : (
          <View style={styles.headerPlaceholder}>
            <Ionicons name="image-outline" size={64} color="gray" />
            <Text style={styles.placeholderText}>No image available</Text>
          </View>
        )}

        <View style={styles.contentContainer}>

          {/* Content */}
          {module.content && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Content</Text>
                {isTeacherOrAdmin && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditField('description')}
                  >
                    <Ionicons name="create-outline" size={20} color="#6B8E23" />
                  </TouchableOpacity>
                )}
              </View>
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

          {/* Quiz Section - Only show unlock message for students */}
          {module.quiz && !isTeacherOrAdmin && (
            <View style={styles.unlockSection}>
              <Ionicons name="lock-closed" size={32} color="gray" />
              <Text style={styles.unlockText}>Complete the quiz to unlock the next lesson</Text>
              <TouchableOpacity style={styles.responseButton} onPress={handleQuizPress}>
                <Text style={styles.responseButtonText}>Start Quiz</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Quiz Section for Teachers/Admins - Direct access */}
          {module.quiz && isTeacherOrAdmin && (
            <View style={styles.teacherQuizSection}>
              <Text style={styles.teacherQuizText}>Quiz Available</Text>
              <TouchableOpacity style={styles.responseButton} onPress={handleQuizPress}>
                <Text style={styles.responseButtonText}>View Quiz</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Music Selection */}
          {module.music_selection && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Music selection</Text>
              <MusicCard
                title={module.music_selection}
                mediaUrl={module.media_url}
                onPlay={() => {
                  // Handle play functionality
                  // console.log('Playing music:', module.media_url);
                  if (module?.media_url) {
                    WebBrowser.openBrowserAsync(module.media_url).catch((error) => {
                      console.error('Failed to open browser:', error);
                    });
                  }
                }}
              />
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {/* Show button if content exists OR user is teacher/admin */}
            {(module.further_study || isTeacherOrAdmin) && (
              <View style={styles.actionButtonContainer}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleActionPress('further_study')}
                >
                  <Text style={styles.actionButtonText}>Further Study</Text>
                </TouchableOpacity>
                {isTeacherOrAdmin && (
                  <TouchableOpacity
                    style={styles.actionEditButton}
                    onPress={() => handleEditField('further_study')}
                  >
                    <Ionicons name="create-outline" size={16} color="#6B8E23" />
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {(module.personal_experiences || isTeacherOrAdmin) && (
              <View style={styles.actionButtonContainer}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleActionPress('personal_experiences')}
                >
                  <Text style={styles.actionButtonText}>Personal Experiences</Text>
                </TouchableOpacity>
                {isTeacherOrAdmin && (
                  <TouchableOpacity
                    style={styles.actionEditButton}
                    onPress={() => handleEditField('personal_experiences')}
                  >
                    <Ionicons name="create-outline" size={16} color="#6B8E23" />
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {(module.resources || isTeacherOrAdmin) && (
              <View style={styles.actionButtonContainer}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleActionPress('resources')}
                >
                  <Text style={styles.actionButtonText}>Resources</Text>
                </TouchableOpacity>
                {isTeacherOrAdmin && (
                  <TouchableOpacity
                    style={styles.actionEditButton}
                    onPress={() => handleEditField('resources')}
                  >
                    <Ionicons name="create-outline" size={16} color="#6B8E23" />
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {(module.artwork || isTeacherOrAdmin) && (
              <View style={styles.actionButtonContainer}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleActionPress('artwork')}
                >
                  <Text style={styles.actionButtonText}>Artwork</Text>
                </TouchableOpacity>
                {isTeacherOrAdmin && (
                  <TouchableOpacity
                    style={styles.actionEditButton}
                    onPress={() => handleEditField('artwork')}
                  >
                    <Ionicons name="create-outline" size={16} color="#6B8E23" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Quiz Modal */}
      {module?.quiz && (
        <ResponseModal
          visible={showResponseModal}
          onClose={() => setShowResponseModal(false)}
          questions={parseQuizData(module.quiz)}
          title="Lesson Quiz"
          onSubmit={handleResponseSubmit}
        />
      )}

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        onContinue={handleSuccessContinue}
        title="Nice work!"
        subtitle={nextModule ? "You've unlocked the next lesson!" : "You've completed this lesson!"}
        buttonText="Continue"
        score={quizScore}
      />

      {/* Content Modal */}
      <Modal
        visible={showContentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowContentModal(false)}
      >
        <View style={styles.contentModalOverlay}>
          <View style={styles.contentModal}>
            <View style={styles.contentModalHeader}>
              <Text style={styles.contentModalTitle}>{modalTitle}</Text>
              <TouchableOpacity
                style={styles.contentModalCloseButton}
                onPress={() => setShowContentModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.contentModalBody}>
              <Text style={styles.contentModalText}>
                {modalContent || 'No content available'}
              </Text>
              {/* Temporary debug info */}
              {/* <Text style={[styles.contentModalText, { fontSize: 12, color: '#999', marginTop: 20, fontStyle: 'italic' }]}>
                Debug Info:{'\n'}
                Title: "{modalTitle}"{'\n'}
                Content: "{modalContent}"{'\n'}
                Content Length: {modalContent?.length || 0}
              </Text> */}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Management Modal for Teachers/Admins */}
      <Modal
        visible={showManagementModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Edit {editingField?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowManagementModal(false);
                setEditingField(null);
                setEditText('');
              }}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <TextInput
              style={styles.modalTextInput}
              value={editText}
              onChangeText={setEditText}
              placeholder={`Enter ${editingField?.replace('_', ' ')}...`}
              multiline
              textAlignVertical="top"
            />
          </View>
          
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setShowManagementModal(false);
                setEditingField(null);
                setEditText('');
              }}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSaveEdit}
            >
              <Text style={styles.modalSaveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50, // Account for status bar
    paddingBottom: 15,
    backgroundColor: '#f5f2ec', // Light translucent background
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  headerImageContainer: {
    position: 'relative',
    width: '100%',
    height: 250,
  },
  headerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%', // fade only bottom half
  },
  imageTitle: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },

  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40, // Same width as back button to center the title
  },
  managementButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  managementButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  editButton: {
    padding: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(106, 142, 35, 0.1)',
  },
  actionButtonContainer: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionEditButton: {
    marginLeft: 10,
    padding: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(106, 142, 35, 0.1)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalTextInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 15,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  modalCancelButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 8,
    backgroundColor: '#6B8E23',
  },
  modalSaveButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
    paddingTop: 100, // Account for header height
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
    color: '#ffffff',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#56621c',
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
  teacherQuizSection: {
    backgroundColor: '#F0F8F0',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginVertical: 20,
    borderWidth: 1,
    borderColor: '#6B8E23',
  },
  teacherQuizText: {
    fontSize: 16,
    color: '#6B8E23',
    textAlign: 'center',
    marginVertical: 10,
    fontWeight: '500',
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
    backgroundColor: '#56621c',
    borderRadius: 5,
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
  actionButtons: {
    marginTop: 20,
  },
  actionButton: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    marginBottom: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  contentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    maxHeight: '85%',
    minHeight: '40%',
    width: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  contentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  contentModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  contentModalCloseButton: {
    padding: 5,
  },
  contentModalBody: {
    flex: 1,
  },
  contentModalText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#555',
  },
});

// Response Modal Styles
const responseModalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6B8E23',
    borderRadius: 2,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  questionContainer: {
    flex: 1,
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 24,
    lineHeight: 28,
  },
  reflectionInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  shortAnswerInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 16,
    backgroundColor: 'white',
  },
  selectedOption: {
    borderColor: '#6B8E23',
    backgroundColor: '#F0F8F0',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: 'white',
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  previousButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 10,
  },
  nextButton: {
    backgroundColor: '#6B8E23',
    marginLeft: 10,
  },
  disabledButton: {
    backgroundColor: '#CCC',
  },
  previousButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});