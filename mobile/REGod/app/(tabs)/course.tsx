import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ImageSourcePropType, ActivityIndicator, Modal, FlatList, Dimensions, Animated, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import CircularProgress from '@/components/ui/CircularProgress';
import LessonIndexModal from '@/components/LessonIndexModal';
import ApiService, { type Course, type Chapter, type Module, type DashboardResponse } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { getImageUrl } from '../../src/config/constants';
import CourseCarousel from '@/components/CourseCarousel';

const { width: screenWidth } = Dimensions.get('window');

// Interface for dashboard course data (different from Course interface)
interface DashboardCourse {
  course_id: number;
  course_title: string;
  description: string;
  thumbnail_url?: string;
  category: string;
  difficulty: string;
  progress_percentage: number;
  is_new: boolean;
  is_continue_available: boolean;
  overall_progress_percentage: number;
}

// Helper function to convert relative URLs to full URLs
const getImageUrlWithFallback = (imageUrl: string | null | undefined): any => {
  // Handle null, undefined, or empty strings
  if (!imageUrl || imageUrl === 'undefined' || imageUrl.trim() === '') {
    console.log('No valid image URL provided, using default image');
    return defaultCourseImage;
  }
  
  const fullUrl = getImageUrl(imageUrl);
  return fullUrl ? { uri: fullUrl } : defaultCourseImage;
};

// Default placeholder image for fallback
const defaultCourseImage = require('@/assets/images/Course Title Photo - The God You Can Love-toni-minikus.jpg');
const defaultChapterImage = require('@/assets/images/Best Teacher-toni-minikus.jpg');

// Types for lesson completion tracking
interface LessonProgress {
  moduleId: number;
  completed: boolean;
  quizCompleted?: boolean;
  reflectionCompleted?: boolean;
  lastAccessedAt: string;
}

interface ChapterCardProps {
  chapter: Chapter;
  onPress: () => void;
}

export default function CourseScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  
  // Check if user is admin or teacher
  const isAdminOrTeacher = user?.role === 'admin' || user?.role === 'teacher';
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterProgress, setChapterProgress] = useState<any[]>([]);
  const [detailedProgress, setDetailedProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());
  const [favoritedChapters, setFavoritedChapters] = useState<Set<number>>(new Set());
  const [currentCourseTitle, setCurrentCourseTitle] = useState<string>('');
  const [currentCourseIndex, setCurrentCourseIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: DashboardCourse, index: number | null }> }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentCourseIndex(viewableItems[0].index);
    }
  }).current;

  useEffect(() => {
    // Only load dashboard if user is authenticated and auth loading is complete
    if (isAuthenticated && !authLoading && user) {
      loadDashboard();
      loadFavoritedChapters();
    }
  }, [isAuthenticated, authLoading, user]);

  // Refresh progress when screen comes into focus (e.g., returning from a lesson)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && !authLoading) {
        console.log('Course screen focused, refreshing progress...');
        
        // Update dashboard progress to get latest progress percentages
        updateDashboardProgress();
        
        // Also refresh lesson progress and detailed progress for the current course
        const currentCourse = dashboard?.available_courses[currentCourseIndex];
        if (currentCourse) {
          console.log('Refreshing lesson progress for course:', currentCourse.course_id);
          loadLessonProgress(currentCourse.course_id);
          loadDetailedProgress(currentCourse.course_id);
        }
      }
    }, [isAuthenticated, authLoading, currentCourseIndex])
  );

  const loadFavoritedChapters = async () => {
    try {
      const favoritedChaptersData = await ApiService.getChapterFavorites();
      const chapterIds = new Set(favoritedChaptersData.map(ch => ch.chapter_id));
      setFavoritedChapters(chapterIds);
    } catch (error) {
      console.error('Error loading favorited chapters:', error);
    }
  };

  useEffect(() => {
    if (dashboard && dashboard.available_courses.length > 0) {
      const currentCourse = dashboard.available_courses[currentCourseIndex];
      if (currentCourse) {
        handleCoursePress(currentCourse.course_id);
      }
    }
  }, [currentCourseIndex, dashboard]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      // Double-check authentication before making API call
      const hasValidToken = await ApiService.getStoredToken();
      if (!hasValidToken) {
        console.log('No valid token found, skipping dashboard load');
        setLoading(false);
        return;
      }

      const dashboardData = await ApiService.getDashboard();
      console.log('Initial dashboard data:', {
        available_courses: dashboardData.available_courses?.map((course: DashboardCourse) => ({
          course_id: course.course_id,
          course_title: course.course_title,
          progress_percentage: course.progress_percentage,
          overall_progress_percentage: course.overall_progress_percentage
        }))
      });
      setDashboard(dashboardData);

      // Set the initial course index based on the last visited course
      if (dashboardData.last_visited_course && dashboardData.available_courses) {
        const initialIndex = dashboardData.available_courses.findIndex(
          (course: DashboardCourse) => course.course_id === dashboardData.last_visited_course?.course_id
        );
        if (initialIndex !== -1) {
          setCurrentCourseIndex(initialIndex);
        }
      }

      // If we have modules loaded, refresh the lesson progress for the current course
      if (modules.length > 0 && dashboardData.available_courses.length > 0) {
        const currentCourse = dashboardData.available_courses[currentCourseIndex];
        if (currentCourse) {
          await loadLessonProgress(currentCourse.course_id);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard';
      console.error('Error loading dashboard:', err);

      // If it's an authentication error, don't show error to user
      if (errorMessage.includes('Authentication expired') || errorMessage.includes('403')) {
        console.log('Authentication error in dashboard, will retry when auth is ready');
        setError(null);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLessonProgress = async (courseId: number) => {
    try {
      console.log('Loading lesson progress for course:', courseId);
      // Get module progress from the API
      const moduleProgress = await ApiService.getModuleProgress(courseId);
      console.log('Received module progress:', moduleProgress);
      
      const completedSet = new Set<number>();

      // Add completed modules to the set
      moduleProgress.forEach(progress => {
        if (progress.completed) {
          completedSet.add(progress.moduleId);
        }
      });

      setCompletedLessons(completedSet);
      console.log('Updated completed lessons:', { courseId, completedModules: Array.from(completedSet) });
    } catch (error) {
      console.error('Error loading lesson progress:', error);
      // Continue without progress data
    }
  };

  const loadDetailedProgress = async (courseId: number) => {
    try {
      console.log('Loading detailed progress for course:', courseId);
      const progress = await ApiService.getDetailedProgress(courseId);
      console.log('Received detailed progress:', JSON.stringify(progress, null, 2));
      setDetailedProgress(progress);
    } catch (error) {
      console.error('Error loading detailed progress:', error);
    }
  };

  const handleCoursePress = async (courseId: number) => {
    try {
      // Load chapters, modules, chapter progress, and detailed progress for the selected course
      const [courseChapters, courseModules, progressData, detailedProgressData] = await Promise.all([
        ApiService.getCourseChapters(courseId),
        ApiService.getCourseModules(courseId),
        ApiService.getChapterProgress(courseId),
        ApiService.getDetailedProgress(courseId)
      ]);
      
      setChapters(courseChapters);
      setModules(courseModules);
      setChapterProgress(progressData.chapters);
      setDetailedProgress(detailedProgressData);
      
      const course = dashboard?.available_courses.find(c => c.course_id === courseId);
      setCurrentCourseTitle(course?.course_title || `Course ${courseId}`);

      // Load lesson progress for this course
      await loadLessonProgress(courseId);
    } catch (err) {
      console.error('Error loading course chapters/modules:', err);
    }
  };

  const handleModulePress = async (module: Module) => {
    try {
      // console.log('handleModulePress called with module:', { id: module.id, title: module.title, course_id: module.course_id });
      
      // Record that user accessed this module
      await ApiService.updateCourseProgress(module.course_id, 0, module.id, 'visited');

      // Navigate to lesson - progress will be updated on completion
      router.push({
        pathname: '/lesson' as any,
        params: {
          moduleId: module.id.toString(),
          courseId: module.course_id.toString()
        }
      });
    } catch (err) {
      console.error('Error accessing lesson:', err);
      // Still allow navigation even if progress update fails
      router.push({
        pathname: '/lesson' as any,
        params: {
          moduleId: module.id.toString(),
          courseId: module.course_id.toString()
        }
      });
    }
  };

  const handleLessonCompleted = async (moduleId: number) => {
    setCompletedLessons(prev => new Set([...prev, moduleId]));
    
    // Update dashboard progress to reflect the completion
    await updateDashboardProgress();
    
    // Refresh lesson progress and detailed progress for current course
    if (dashboard?.available_courses[currentCourseIndex]) {
      const currentCourse = dashboard.available_courses[currentCourseIndex];
      await Promise.all([
        loadLessonProgress(currentCourse.course_id),
        loadDetailedProgress(currentCourse.course_id)
      ]);
    }
  };

  // Function to refresh progress without affecting carousel
  const refreshProgressOnly = async () => {
    if (dashboard?.available_courses[currentCourseIndex]) {
      const currentCourse = dashboard.available_courses[currentCourseIndex];
      await loadLessonProgress(currentCourse.course_id);
    }
  };

  // Function to update dashboard progress without full reload
  const updateDashboardProgress = async () => {
    try {
      const dashboardData = await ApiService.getDashboard();
      console.log('Updated dashboard data:', {
        available_courses: dashboardData.available_courses?.map((course: DashboardCourse) => ({
          course_id: course.course_id,
          course_title: course.course_title,
          progress_percentage: course.progress_percentage,
          overall_progress_percentage: course.overall_progress_percentage
        }))
      });
      setDashboard(dashboardData);
    } catch (error) {
      console.error('Error updating dashboard progress:', error);
    }
  };

  const toggleChapterFavorite = async (chapterId: number, event: any) => {
    event.stopPropagation(); // Prevent triggering the chapter card press
    
    try {
      const response = await ApiService.toggleChapterFavorite(chapterId);
      
      if (response.action === 'added') {
        setFavoritedChapters(prev => new Set([...prev, chapterId]));
        console.log('Added chapter to favorites:', chapterId);
      } else if (response.action === 'removed') {
        setFavoritedChapters(prev => {
          const newSet = new Set(prev);
          newSet.delete(chapterId);
          return newSet;
        });
        console.log('Removed chapter from favorites:', chapterId);
      }
    } catch (error) {
      console.error('Error toggling chapter favorite:', error);
    }
  };

  // Animated Heart Component
  const AnimatedHeart = ({ chapterId }: { chapterId: number }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const isFavorited = favoritedChapters.has(chapterId);

    const handlePress = (event: any) => {
      // Animate the heart
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();

      toggleChapterFavorite(chapterId, event);
    };

    return (
      <TouchableOpacity
        style={styles.heartIcon}
        onPress={handlePress}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Ionicons
            name={isFavorited ? "heart" : "heart-outline"}
            size={24}
            color={isFavorited ? "#FF6B6B" : "rgba(255, 255, 255, 0.8)"}
          />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const openLessonModal = (chapterId?: number) => {
    setSelectedChapterId(chapterId || null);
    setShowLessonModal(true);
  };

  const closeLessonModal = () => {
    setShowLessonModal(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Reload dashboard and course data
      await loadDashboard();
      await loadFavoritedChapters();
      
      // If we have a current course, reload its data too
      if (dashboard?.available_courses[currentCourseIndex]) {
        const currentCourse = dashboard.available_courses[currentCourseIndex];
        await handleCoursePress(currentCourse.course_id);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [dashboard, currentCourseIndex]);

  // Manual refresh function for progress updates
  const refreshProgress = useCallback(async () => {
    if (dashboard?.available_courses[currentCourseIndex]) {
      const currentCourse = dashboard.available_courses[currentCourseIndex];
      await loadLessonProgress(currentCourse.course_id);
    }
  }, [dashboard, currentCourseIndex]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>
            {authLoading ? 'Authenticating...' : 'Loading courses...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Don't render anything if user is not authenticated and auth is still loading
  if (!isAuthenticated && !user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>Please log in to view courses</Text>
        </View>
      </SafeAreaView>
    );
  }


  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        
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
  const availableCourses = dashboard?.available_courses || [];

  // Render admin/teacher view
  if (isAdminOrTeacher) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        
        <ScrollView 
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6B8E23"
              colors={["#6B8E23"]}
              title="Pull to refresh"
              titleColor="#6B8E23"
            />
          }
        >
          {/* Admin/Teacher Course Management */}
          <View style={styles.adminHeader}>
            <Text style={styles.adminTitle}>My Courses</Text>
            <Text style={styles.adminSubtitle}>Manage your uploaded courses and chapters</Text>
          </View>

          {/* Course Cards for Admin/Teacher */}
          {availableCourses.length > 0 && (
            <View style={styles.carouselSection}>
              <CourseCarousel
                courses={availableCourses}
                defaultImage={defaultCourseImage}
                onCourseChange={setCurrentCourseIndex}
              />
              {dashboard?.available_courses[currentCourseIndex] && (
                <View style={styles.courseDetails}>
                  <Text style={styles.courseTitle}>
                    {dashboard.available_courses[currentCourseIndex].course_title}
                  </Text>
                  <View style={styles.progressContainer}>
                    <CircularProgress
                      size={90}
                      strokeWidth={8}
                      progress={detailedProgress?.course_progress?.progress_percentage || dashboard.available_courses[currentCourseIndex].progress_percentage}
                      backgroundColor="#E8E8E8"
                      progressColor="#6B8E23"
                    />
                    <View style={styles.progressTextContainer}>
                      <Text style={styles.progressText}>
                        {`${Math.round(detailedProgress?.course_progress?.progress_percentage || dashboard.available_courses[currentCourseIndex].progress_percentage)}%`}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Chapters Section for Admin/Teacher */}
          <View style={styles.continueSection}>
            <Text style={styles.continueText}>Chapters</Text>
            <Text style={styles.continueSubtitle}>Manage course chapters and content</Text>
          </View>

          {/* Green Background Container */}
          <View style={styles.greenBackgroundContainer}>
            <View style={styles.availableCoursesSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
              >
                {chapterProgress.map((chapterProgress) => (
                  <TouchableOpacity
                    key={chapterProgress.chapter_id}
                    onPress={() => openLessonModal(chapterProgress.chapter_id)}
                  >
                    <View style={styles.chapterCard}>
                      <Image
                        source={getImageUrlWithFallback(chapterProgress.cover_image_url || null)}
                        style={styles.chapterImage}
                        onError={(error) => {
                          console.log(`❌ Chapter image failed to load for "${chapterProgress.chapter_title}":`, chapterProgress.cover_image_url);
                        }}
                        onLoad={() => {
                          if (chapterProgress.cover_image_url && chapterProgress.cover_image_url !== 'undefined') {
                            console.log(`✅ Chapter image loaded successfully for "${chapterProgress.chapter_title}"`);
                          }
                        }}
                      />
                      <View style={styles.chapterTextContainer}>
                        <Text style={styles.chapterTitle}>{chapterProgress.chapter_title}</Text>
                        <View style={styles.progressContainer}>
                          <View style={styles.progressContainer}>
                            <View 
                              style={[
                                styles.progressContainer, 
                                { width: `${chapterProgress.progress_percentage.toFixed(1)}%` }
                              ]} 
                            />
                          </View>
                        </View>
                        <View style={styles.lessonButton}>
                          <Text style={styles.lessonButtonText}>
                            Manage Content
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Footer with Green Background */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                App Development by Adventech in partnership with TBD...
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Lesson Index Modal */}
        <LessonIndexModal
          visible={showLessonModal}
          onClose={closeLessonModal}
          modules={selectedChapterId ? modules.filter(m => m.chapter_id === selectedChapterId) : modules}
          courseTitle={currentCourseTitle}
          onLessonPress={handleModulePress}
          completedLessons={completedLessons}
          progressPercentage={
            selectedChapterId 
              ? detailedProgress?.chapters?.find((c: any) => c.chapter_id === selectedChapterId)?.progress_percentage || 0
              : detailedProgress?.course_progress?.progress_percentage || 0
          }
          chapterTitle={selectedChapterId ? chapters.find((c: Chapter) => c.id === selectedChapterId)?.title || "Chapter" : "All Lessons"}
          showChapterProgress={!selectedChapterId}
          detailedProgress={detailedProgress}
        />
      </SafeAreaView>
    );
  }

  // Render student view (existing code)
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6B8E23"
            colors={["#6B8E23"]}
            title="Pull to refresh"
            titleColor="#6B8E23"
          />
        }
      >

        {/* Course Card Carousel */}
        {availableCourses.length > 0 && (
          <View style={styles.carouselSection}>
            <CourseCarousel
              courses={availableCourses}
              defaultImage={defaultCourseImage}
              onCourseChange={setCurrentCourseIndex}
            />
            {dashboard?.available_courses[currentCourseIndex] && (
                <View style={styles.courseDetails}>
                    <Text style={styles.courseTitle}>
                        {dashboard.available_courses[currentCourseIndex].course_title}
                    </Text>
                    <View style={styles.progressContainer}>
                        <CircularProgress
                            size={90}
                            strokeWidth={8}
                            progress={detailedProgress?.course_progress?.progress_percentage || dashboard.available_courses[currentCourseIndex].progress_percentage}
                            backgroundColor="#E8E8E8"
                            progressColor="#6B8E23"
                        />
                        <View style={styles.progressTextContainer}>
                            <Text style={styles.progressText}>
                                {`${Math.round(detailedProgress?.course_progress?.progress_percentage || dashboard.available_courses[currentCourseIndex].progress_percentage)}%`}
                            </Text>
                        </View>
                    </View>
                    {/* <Text style={styles.progressLabel}>
                        Course Progress ({detailedProgress?.course_progress?.completed_modules || 0}/{detailedProgress?.course_progress?.total_modules || 0} modules)
                    </Text> */}
                </View>
            )}
          </View>
        )}

        {/* Continue Section with Green Background */}
        <View style={styles.continueSection}>
          <Text style={styles.continueText}>Continue</Text>
          <Text style={styles.continueSubtitle}>Pick up where you left off</Text>
        </View>

        {/* Green Background Container */}
        <View style={styles.greenBackgroundContainer}>
          {/* Continue Chapter Card */}
          {chapterProgress.length > 0 && (
            <View style={styles.continueCardSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
              >
                {/* Show current chapter with module progress */}
                {(() => {
                  // Use detailed progress data if available, otherwise fall back to chapter progress
                  const currentChapter = detailedProgress?.current_chapter || chapterProgress.find(ch => !ch.is_completed) || chapterProgress[chapterProgress.length - 1];
                  const nextChapter = detailedProgress?.next_chapter;
                  
                  console.log('Continue card debug:', {
                    detailedProgress: detailedProgress,
                    currentChapter: currentChapter,
                    nextChapter: nextChapter,
                    chapterProgress: chapterProgress
                  });
                  
                  // If no chapter progress data, try to show continue card from dashboard data
                  if (!currentChapter && dashboard?.last_visited_course) {
                    const currentCourse = dashboard?.available_courses[currentCourseIndex];
                    const lastVisitedModule = (dashboard?.last_visited_course?.course_id === currentCourse?.course_id) 
                      ? dashboard?.last_visited_course?.last_visited_module_id 
                      : null;
                    
                    if (lastVisitedModule) {
                      const targetModule = modules.find(m => m.id === lastVisitedModule);
                      console.log('Fallback continue card - targetModule:', targetModule);
                      if (targetModule) {
                        return (
                          <TouchableOpacity
                            onPress={() => handleModulePress(targetModule)}
                            style={styles.continueCard}
                          >
                            <Image
                              source={getImageUrlWithFallback(dashboard.last_visited_course.thumbnail_url || null)}
                              style={styles.continueCardImage}
                            />
                            <View style={styles.continueCardOverlay} />
                            <View style={styles.continueCardContent}>
                              <View style={styles.continueProgressContainer}>
                                <CircularProgress
                                  size={50}
                                  strokeWidth={4}
                                  progress={dashboard.last_visited_course.overall_progress_percentage}
                                  backgroundColor="rgba(255, 255, 255, 0.45)"
                                  progressColor="#FFFFFF"
                                />
                                <Text style={styles.continueProgressText}>
                                  {dashboard.last_visited_course.overall_progress_percentage.toFixed(1)}%
                                </Text>
                              </View>
                              {/* <Text style={styles.continueCardTitle}>{dashboard.last_visited_course.course_title}</Text>
                              <Text style={styles.continueCardTitle}>
                                Continue: {targetModule.title}
                              </Text> */}
                            </View>
                          </TouchableOpacity>
                        );
                      }
                    }
                  }
                  
                  if (!currentChapter) return null;

                  // Get the last visited module from dashboard, but only if it's from the current course
                  const currentCourse = dashboard?.available_courses[currentCourseIndex];
                  const lastVisitedModule = (dashboard?.last_visited_course?.course_id === currentCourse?.course_id) 
                    ? dashboard?.last_visited_course?.last_visited_module_id 
                    : null;
                  
                  // console.log('Continue card debug:', {
                  //   currentCourseId: currentCourse?.course_id,
                  //   lastVisitedCourseId: dashboard?.last_visited_course?.course_id,
                  //   lastVisitedModule,
                  //   modules: modules.map(m => ({ id: m.id, title: m.title })),
                  //   currentChapter: currentChapter?.chapter_title,
                  //   nextModule: currentChapter?.next_module,
                  //   completedLessons: Array.from(completedLessons),
                  //   chapterProgress: chapterProgress.map(ch => ({ 
                  //     id: ch.chapter_id, 
                  //     title: ch.chapter_title, 
                  //     next_module: ch.next_module,
                  //     is_completed: ch.is_completed 
                  //   }))
                  // });
                  
                  // Determine which chapter to show and what module to target
                  const displayChapter = currentChapter?.is_completed && nextChapter ? nextChapter : currentChapter;
                  
                  console.log('Display chapter debug:', {
                    displayChapter: displayChapter,
                    currentChapter: currentChapter,
                    nextChapter: nextChapter,
                    isCurrentCompleted: currentChapter?.is_completed
                  });
                  // Find the next incomplete module in the current chapter (sorted by order)
                  const currentChapterModules = modules
                    .filter(m => m.chapter_id === displayChapter?.chapter_id)
                    .sort((a, b) => a.order - b.order);
                  const nextIncompleteModule = currentChapterModules.find(m => !completedLessons.has(m.id));
                  
                  // Use next incomplete module, or fallback to last visited if no incomplete modules
                  const targetModule = nextIncompleteModule || 
                    (lastVisitedModule ? modules.find(m => m.id === lastVisitedModule) : null) ||
                    modules.sort((a, b) => a.order - b.order).find(m => !completedLessons.has(m.id)); // Final fallback to any incomplete module
                  
                  console.log('Target module selection:', {
                    currentChapterModules: currentChapterModules.map(m => ({ id: m.id, title: m.title, completed: completedLessons.has(m.id) })),
                    nextIncompleteModule: nextIncompleteModule ? { id: nextIncompleteModule.id, title: nextIncompleteModule.title } : null,
                    lastVisitedModule,
                    targetModule: targetModule ? { id: targetModule.id, title: targetModule.title } : null
                  });
                  
                  // console.log('Target module:', targetModule);

                  return (
                    <TouchableOpacity
                      onPress={() => {
                        if (targetModule) {
                          handleModulePress(targetModule);
                        }
                      }}
                      style={styles.continueCard}
                    >
                      <Image
                        source={getImageUrlWithFallback(displayChapter?.cover_image_url || null)}
                        style={styles.continueCardImage}
                        onError={(error) => {
                          console.log(`❌ Continue card image failed to load for "${displayChapter?.chapter_title}":`, displayChapter?.cover_image_url);
                        }}
                        onLoad={() => {
                          if (displayChapter?.cover_image_url && displayChapter?.cover_image_url !== 'undefined') {
                            console.log(`✅ Continue card image loaded successfully for "${displayChapter?.chapter_title}"`);
                          }
                        }}
                      />
                      <View style={styles.continueCardOverlay} />
                      <View style={styles.continueCardContent}>
                        <View style={styles.continueProgressContainer}>
                          <CircularProgress
                            size={50}
                            strokeWidth={4}
                            progress={displayChapter?.progress_percentage || 0}
                            backgroundColor="rgba(255, 255, 255, 0.45)"
                            progressColor="#FFFFFF"
                          />
                          <Text style={styles.continueProgressText}>
                            {displayChapter?.progress_percentage?.toFixed(1) || 0}%
                          </Text>
                        </View>
                        <Text style={styles.continueCardTitle}>
                          {currentChapter?.is_completed && nextChapter ? `Next: ${nextChapter.chapter_title}` : displayChapter?.chapter_title}
                        </Text>
                        {/* {targetModule && (
                          <Text style={styles.continueCardTitle}>
                            {nextIncompleteModule ? 'Continue: ' : 'Start: '}{targetModule.title}
                          </Text>
                        )}
                        <Text style={styles.continueCardSubtitle}>
                          {displayChapter?.completed_modules || 0}/{displayChapter?.total_modules || 0} modules
                        </Text> */}
                      </View>
                    </TouchableOpacity>
                  );
                })()}
              </ScrollView>

              {/* Lesson Index under the continue card */}
              {/* <TouchableOpacity style={styles.lessonIndexButton} onPress={openLessonModal}>
                <Text style={styles.lessonIndexButtonText}>Lesson Index</Text>
                <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity> */}
            </View>
          )}

          {/* Available Courses with Green Background */}
          <View style={styles.continueSection}>
          <Text style={styles.continueText}>Chapters</Text>
        </View>
          <View style={styles.availableCoursesSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollViewContent}
            >
              {chapterProgress.map((chapterProgress) => (
                <TouchableOpacity
                  key={chapterProgress.chapter_id}
                  onPress={() => openLessonModal(chapterProgress.chapter_id)}
                >
                  <View style={styles.chapterCard}>
                    <Image
                      source={getImageUrlWithFallback(chapterProgress.cover_image_url || null)}
                      style={styles.chapterImage}
                      onError={(error) => {
                        console.log(`❌ Chapter image failed to load for "${chapterProgress.chapter_title}":`, chapterProgress.cover_image_url);
                      }}
                      onLoad={() => {
                        if (chapterProgress.cover_image_url && chapterProgress.cover_image_url !== 'undefined') {
                          console.log(`✅ Chapter image loaded successfully for "${chapterProgress.chapter_title}"`);
                        }
                      }}
                    />
                    {/* Heart Icon */}
                    <AnimatedHeart chapterId={chapterProgress.chapter_id} />
                    <View style={styles.chapterTextContainer}>
                      <Text style={styles.chapterTitle}>{chapterProgress.chapter_title}</Text>
                      <View style={styles.progressContainer}>
                        <View style={styles.progressContainer}>
                          <View 
                            style={[
                              styles.progressContainer, 
                              { width: `${chapterProgress.progress_percentage.toFixed(1)}%` }
                            ]} 
                          />
                        </View>
                        {/* <Text style={styles.progressText}>
                          {chapterProgress.completed_modules}/{chapterProgress.total_modules} modules
                        </Text> */}
                      </View>
                      <View style={styles.lessonButton}>
                        <Text style={styles.lessonButtonText}>
                          Lesson Index
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Footer with Green Background */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              App Development by Adventech in partnership with TBD...
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Lesson Index Modal */}
      <LessonIndexModal
        visible={showLessonModal}
        onClose={closeLessonModal}
        modules={selectedChapterId ? modules.filter(m => m.chapter_id === selectedChapterId) : modules}
        courseTitle={currentCourseTitle}
        onLessonPress={handleModulePress}
        completedLessons={completedLessons}
        progressPercentage={
          selectedChapterId 
            ? detailedProgress?.chapters?.find((c: any) => c.chapter_id === selectedChapterId)?.progress_percentage || 0
            : detailedProgress?.course_progress?.progress_percentage || 0
        }
        chapterTitle={selectedChapterId ? chapters.find((c: Chapter) => c.id === selectedChapterId)?.title || "Chapter" : "All Lessons"}
        showChapterProgress={!selectedChapterId} // Only show chapter progress when showing all chapters
        detailedProgress={detailedProgress}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
  carouselSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  courseDetails: {
    alignItems: 'center',
    marginTop: 20,
  },
  scrollView: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 25,
    textAlign: 'center',
    color: '#6B8E23',
    lineHeight: 30,
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 15,
  },
  progressTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    top: 35,
  },
  progressText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6B8E23',
  },
  progressLabel: {
    fontSize: 12,
    color: '#6B8E23',
    marginTop: 8,
    fontWeight: '500',
  },
  continueSection: {
    backgroundColor: '#56621c',
    paddingHorizontal: 20,
    paddingVertical: 25,
    marginTop: 30,
  },
  continueText: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  continueSubtitle: {
    color: 'white',
    fontSize: 16,
    opacity: 0.9,
  },
  greenBackgroundContainer: {
    backgroundColor: '#56621c', // Olive green background for everything below Continue
  },
  availableCoursesSection: {
    paddingHorizontal: 5,
    marginBottom: 50,
    alignItems: 'center', // Center align the course cards
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
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
  },
  chapterTitle: {
    fontSize: 40,
    fontWeight: '400',
    marginBottom: 10,
  },
  lessonButton: {
    backgroundColor: 'black',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
  },
  lessonButtonText: {
    color: 'white',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#56621c', // Green background to match design
  },
  footerText: {
    fontSize: 12,
    color: 'white', // White text on green background
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

  // Modal Styles
  continueCardSection: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: 'center', // Center align the cards
  },
  continueCard: {
    width: 300,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  continueCardImage: {
    width: '100%',
    height: '100%',
  },
  continueCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.51)',
  },
  continueCardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueProgressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  continueProgressText: {
    position: 'absolute',
    textAlign: 'center',
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  continueCardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  continueCardSubtitle: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.9,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Lesson Index Button
  lessonIndexButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
    marginHorizontal: 20,
    width: 280, // Same width as continue card for consistency
    alignSelf: 'center', // Center the button
  },
  lessonIndexButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  scrollViewContent: {
    alignItems: 'center', // Center align scroll view content
    justifyContent: 'center',
  },
  heartIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Admin/Teacher styles
  adminHeader: {
    paddingHorizontal: 20,
    paddingVertical: 30,
    alignItems: 'center',
  },
  adminTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginBottom: 8,
  },
  adminSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
