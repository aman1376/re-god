import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ImageSourcePropType, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import CircularProgress from '@/components/ui/CircularProgress';
import ApiService, { type Course, type Module, type DashboardResponse } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// Helper function to convert relative URLs to full URLs
const getImageUrl = (imageUrl: string | null): any => {
  if (!imageUrl) return defaultChapterImage;
  if (imageUrl.startsWith('http')) return { uri: imageUrl };
  return { uri: `https://bf5773da486c.ngrok-free.app${imageUrl}` };
};

// Default placeholder image for fallback
const defaultCourseImage = require('@/assets/images/Course Title Photo - The God You Can Love-toni-minikus.jpg');
const defaultChapterImage = require('@/assets/images/Best Teacher-toni-minikus.jpg');

export default function CourseScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      loadDashboard();
    }
  }, [isAuthenticated, authLoading]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const dashboardData = await ApiService.getDashboard();
      setDashboard(dashboardData);
      
      // Load modules for the first course that has modules
      if (dashboardData.available_courses.length > 0) {
        // Find a course that has modules (prefer course 4 "The God You Can Love")
        const courseWithModules = dashboardData.available_courses.find((course: any) => course.course_id === 4) || 
                                 dashboardData.available_courses.find((course: any) => course.course_id === 3) ||
                                 dashboardData.available_courses[0];
        
        if (courseWithModules) {
          try {
            const courseModules = await ApiService.getCourseModules(courseWithModules.course_id);
            setModules(courseModules);
          } catch (moduleError) {
            console.log('No modules found for course', courseWithModules.course_id);
            setModules([]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCoursePress = async (courseId: number) => {
    try {
      const courseModules = await ApiService.getCourseModules(courseId);
      setModules(courseModules);
    } catch (err) {
      console.error('Error loading course modules:', err);
    }
  };

  const handleModulePress = async (module: Module) => {
    try {
      // Update progress when user accesses a module
      await ApiService.updateCourseProgress(module.course_id, 0, module.id);
    } catch (err) {
      console.error('Error updating progress:', err);
      // Continue even if progress update fails
    }
    
    // Navigate to lesson
    router.push({ 
      pathname: '/(tabs)/lesson' as any, 
      params: { 
        moduleId: module.id.toString(),
        courseId: module.course_id.toString()
      } 
    });
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>
            {authLoading ? 'Authenticating...' : 'Loading courses...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Please log in to view courses</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDashboard}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Use API data
  const currentCourse = dashboard?.last_visited_course;
  const availableCourses = dashboard?.available_courses || [];
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Course</Text>
          <TouchableOpacity>
            <Ionicons name="menu" size={28} color="black" />
          </TouchableOpacity>
        </View>

        {/* Course Card */}
        {currentCourse && (
          <View style={styles.courseCard}>
            <Image 
              source={currentCourse.thumbnail_url ? { uri: currentCourse.thumbnail_url } : defaultCourseImage} 
              style={styles.courseImage} 
            />
            <Text style={styles.courseTitle}>{currentCourse.course_title}</Text>
            {/* Progress Circle */}
            <View style={styles.progressContainer}>
              <CircularProgress
                size={100}
                strokeWidth={10}
                progress={currentCourse.overall_progress_percentage}
                backgroundColor="#E0E0E0"
                progressColor="#6B8E23"
              />
              <View style={styles.progressTextContainer}>
                <Text style={styles.progressText}>{currentCourse.overall_progress_percentage}%</Text>
              </View>
              <Text style={styles.progressLabel}>Course Progress</Text>
            </View>
          </View>
        )}

        {/* Continue Section */}
        <View style={styles.continueSection}>
          <Text style={styles.continueText}>Continue</Text>
          <Text style={styles.continueSubtitle}>Pick up where you left off</Text>
        </View>

        {/* Available Courses */}
        <View style={styles.chaptersSection}>
          <Text style={styles.chaptersTitle}>Available Courses</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {availableCourses.map((course) => (
              <TouchableOpacity 
                key={course.course_id}
                onPress={() => handleCoursePress(course.course_id)}
              >
                <View style={styles.chapterCard}>
                  <Image 
                    source={getImageUrl(course.thumbnail_url || null)} 
                    style={styles.chapterImage} 
                  />
                  <View style={styles.chapterTextContainer}>
                    <Text style={styles.chapterTitle}>{course.course_title}</Text>
                    <View style={styles.lessonButton}>
                      <Text style={styles.lessonButtonText}>
                        {course.is_new ? 'Start Course' : 'Continue'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Modules */}
        {modules.length > 0 && (
          <View style={styles.chaptersSection}>
            <Text style={styles.chaptersTitle}>Lessons</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {modules.map((module) => (
                <TouchableOpacity 
                  key={module.id}
                  onPress={() => handleModulePress(module)}
                >
                  <View style={styles.chapterCard}>
                    <Image 
                      source={getImageUrl(module.header_image_url || null)} 
                      style={styles.chapterImage} 
                    />
                    <View style={styles.chapterTextContainer}>
                      <Text style={styles.chapterTitle}>{module.title}</Text>
                      <View style={styles.lessonButton}>
                        <Text style={styles.lessonButtonText}>Start Lesson</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            App Development by Adventech in partnership with TBD...
          </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  courseCard: {
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 10,
  },
  courseImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
  },
  courseTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 10,
    textAlign: 'center',
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  progressTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  progressLabel: {
    fontSize: 14,
    color: 'gray',
    marginTop: 4,
  },
  continueSection: {
    backgroundColor: '#6B8E23', // Olive Drab
    padding: 20,
    marginVertical: 10,
  },
  continueText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  continueSubtitle: {
    color: 'white',
    fontSize: 14,
  },
  chaptersSection: {
    marginVertical: 10,
  },
  chaptersTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 20,
    marginBottom: 10,
  },
  chapterCard: {
    width: 250,
    height: 350,
    marginHorizontal: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  chapterImage: {
    width: '100%',
    height: '100%',
  },
  chapterTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
  },
  chapterTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  lessonButton: {
    backgroundColor: 'black',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  lessonButtonText: {
    color: 'white',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'gray',
    textAlign: 'center',
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
});
