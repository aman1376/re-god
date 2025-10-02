import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CircularProgress from '@/components/ui/CircularProgress';
import { type Module } from '../src/services/api';

interface LessonIndexModalProps {
  visible: boolean;
  onClose: () => void;
  modules: Module[];
  courseTitle: string;
  onLessonPress: (module: any) => void | Promise<void>;
  completedLessons: Set<number>;
  progressPercentage: number;
  chapterTitle?: string;
  showChapterProgress?: boolean; // New prop to control chapter progress section visibility
  detailedProgress?: {
    course_progress: {
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
    };
    chapters: Array<{
      chapter_id: number;
      chapter_title: string;
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
      is_completed: boolean;
    }>;
  };
}

export default function LessonIndexModal({
  visible,
  onClose,
  modules,
  courseTitle,
  onLessonPress,
  completedLessons,
  progressPercentage,
  chapterTitle,
  showChapterProgress = true,
  detailedProgress
}: LessonIndexModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.progressContainer}>
            <CircularProgress
              size={60}
              strokeWidth={6}
              progress={progressPercentage || 0}
              backgroundColor="#E8E8E8"
              progressColor="#6B8E23"
            />
            <Text style={styles.progressText}>{(progressPercentage || 0).toFixed(0)}%</Text>
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{chapterTitle || 'Complete'}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Chapter Progress Section */}
          {showChapterProgress && detailedProgress?.chapters && detailedProgress.chapters.length > 0 && (
            <View style={styles.chapterProgressSection}>
              <Text style={styles.sectionTitle}>Chapter Progress</Text>
              {detailedProgress.chapters.map((chapter, index) => (
                <View key={chapter.chapter_id} style={styles.chapterProgressItem}>
                  <View style={styles.chapterProgressHeader}>
                    <Text style={styles.chapterTitle}>{chapter.chapter_title}</Text>
                    <View style={styles.chapterProgressContainer}>
                      <CircularProgress
                        size={30}
                        strokeWidth={3}
                        progress={chapter.progress_percentage}
                        backgroundColor="#E8E8E8"
                        progressColor={chapter.is_completed ? "#6B8E23" : "#FFA500"}
                      />
                      <Text style={styles.chapterProgressText}>
                        {chapter.progress_percentage.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.chapterProgressDetails}>
                    {chapter.completed_modules}/{chapter.total_modules} modules completed
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Lessons Section */}
          <View style={styles.lessonsSection}>
            <Text style={styles.sectionTitle}>Lessons</Text>
            {modules.map((module, index) => {
              const isCompleted = completedLessons.has(module.id);
              const isLocked = index > 0 && !completedLessons.has(modules[index - 1]?.id);

              return (
                <TouchableOpacity
                  key={module.id}
                  style={[
                    styles.lessonItem,
                    isCompleted && styles.completedLesson,
                    isLocked && styles.lockedLesson
                  ]}
                  onPress={async () => {
                    if (!isLocked) {
                      console.log('Lesson pressed, calling onLessonPress and onClose');
                      await onLessonPress(module);
                      // Close modal after a small delay to ensure navigation happens
                      setTimeout(() => {
                        onClose();
                      }, 100);
                    }
                  }}
                  disabled={isLocked}
                >
                  <View style={styles.lessonContent}>
                    <View style={styles.lessonHeader}>
                      <Ionicons 
                        name={isLocked ? "lock-closed" : "lock-open"} 
                        size={16} 
                        color={isLocked ? "#999" : "#6B8E23"} 
                      />
                    </View>
                    <Text style={[
                      styles.lessonTitle,
                      isLocked && styles.lockedText
                    ]}>
                      {module.title}
                    </Text>
                    {module.description && (
                      <Text style={[
                        styles.lessonDescription,
                        isLocked && styles.lockedText
                      ]}>
                        {module.description}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  progressContainer: {
    position: 'relative',
    marginRight: 15,
  },
  progressText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -15 }, { translateY: -10 }],
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B8E23',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B8E23',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  lessonItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#6B8E23',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  completedLesson: {
    backgroundColor: '#F0F8F0',
    borderColor: '#6B8E23',
  },
  lockedLesson: {
    backgroundColor: '#F5F5F5',
    borderColor: '#CCC',
  },
  lessonContent: {
    flexDirection: 'row',
    flex: 1,
  },
  lessonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  lessonTitle: {
    flexDirection: 'row',
    fontSize: 16,
    fontWeight: '600',
    color: '#6B8E23',
    marginBottom: 4,
    paddingLeft: 10,
    textAlign: 'left',
  },
  lockedText: {
    color: '#999',
  },
  lessonDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  chapterProgressSection: {
    marginBottom: 20,
  },
  lessonsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginBottom: 15,
  },
  chapterProgressItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#6B8E23',
  },
  chapterProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  chapterProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chapterProgressText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginLeft: 8,
  },
  chapterProgressDetails: {
    fontSize: 12,
    color: '#666',
  },
});
