import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, FlatList, ImageSourcePropType, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import LessonIndexModal from '@/components/LessonIndexModal';
import MusicCard from '@/components/MusicCard';
import ApiService, { type Module, type Chapter } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { getImageUrl } from '../../src/config/constants';
import * as WebBrowser from 'expo-web-browser';

// Default placeholder image for fallback
const defaultChapterImage = require('@/assets/images/logo.png');

// Helper function to convert relative URLs to full URLs
const getImageUrlWithFallback = (imageUrl: string | null): any => {
  if (!imageUrl) return defaultChapterImage;
  const fullUrl = getImageUrl(imageUrl);
  return fullUrl ? { uri: fullUrl } : defaultChapterImage;
};

// Interfaces for data types
interface FavoriteLesson {
  id: string;
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
}

interface FavoriteMusic {
  id: string;
  title: string;
  artist: string;
}

// Placeholder data
const favoriteLessons: FavoriteLesson[] = [
  { id: '1', title: 'Forgiving', subtitle: 'Inventor of the Roundabout', image: require('@/assets/images/Forgiving-holly-mandarich-wZSFbidc640-unsplash.jpg') },
  { id: '2', title: 'Just / Fair', subtitle: 'Lesson Title', image: require('@/assets/images/JustFair-toni-minikus.jpg') },
  { id: '3', title: 'Chapter Title', subtitle: 'Lesson Title', image: require('@/assets/images/Humble-toni-minikus.jpg') },
  { id: '4', title: 'Chapter Title', subtitle: 'Lesson Title', image: require('@/assets/images/Patient-toni-minikus.jpg') },
  { id: '5', title: 'Chapter Title', subtitle: 'Lesson Title', image: require('@/assets/images/Powerful-toni-minikus.jpg') },
  { id: '6', title: 'Chapter Title', subtitle: 'Lesson Title', image: require('@/assets/images/Relational-tim-mossholder-H8_EKl5TgbM-unsplash.jpg') },
];

const favoriteMusic: FavoriteMusic[] = [
  { id: '1', title: 'Things We Leave Behind', artist: 'Michael Card' },
  { id: '2', title: 'Title of the Song', artist: 'Musician' },
];

export default function FavoritesScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  
  // Check if user is admin or teacher
  const isAdminOrTeacher = user?.role === 'admin' || user?.role === 'teacher';
  const [favoritedChapters, setFavoritedChapters] = useState<any[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteMusic, setFavoriteMusic] = useState<any[]>([]);
  
  // Admin/Teacher responses state
  const [responses, setResponses] = useState<any[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responsesPage, setResponsesPage] = useState(1);
  const [hasMoreResponses, setHasMoreResponses] = useState(true);

  // Load data when screen comes into focus (when user navigates to this tab)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && !authLoading) {
        console.log('Favorites screen focused - refreshing data');
        if (isAdminOrTeacher) {
          loadResponses();
        } else {
          loadFavoritedChapters();
          loadFavoriteMusic();
        }
      }
    }, [isAuthenticated, authLoading, isAdminOrTeacher])
  );

  const loadFavoritedChapters = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      const favoritedChaptersData = await ApiService.getChapterFavorites();
      setFavoritedChapters(favoritedChaptersData);
    } catch (error) {
      console.error('Error loading favorited chapters:', error);
    } finally {
      if (!refreshing) {
        setLoading(false);
      }
    }
  };

  const loadFavoriteMusic = async () => {
    try {
      // Get all favorited chapters
      const favoritedChaptersData = await ApiService.getChapterFavorites();
      const musicItems: any[] = [];

      // For each favorited chapter, get its modules and extract music
      for (const chapter of favoritedChaptersData) {
        try {
          // Use course_id if available, otherwise skip this chapter
          const courseId = (chapter as any).course_id;
          if (!courseId) {
            console.warn(`Chapter ${chapter.chapter_id} missing course_id, skipping music extraction`);
            continue;
          }
          
          const modules = await ApiService.getCourseModules(courseId);
          const musicModules = modules.filter(module => module.music_selection);
          
          musicModules.forEach(module => {
            musicItems.push({
              id: `${chapter.chapter_id}-${module.id}`,
              title: module.music_selection,
              mediaUrl: module.media_url,
              chapterTitle: chapter.chapter_title,
              courseTitle: chapter.course_title,
              moduleId: module.id,
              courseId: courseId
            });
          });
        } catch (error) {
          console.error(`Error loading modules for chapter ${chapter.chapter_id}:`, error);
        }
      }

      setFavoriteMusic(musicItems);
    } catch (error) {
      console.error('Error loading favorite music:', error);
    }
  };

  const loadResponses = async (page: number = 1, reset: boolean = false) => {
    try {
      if (reset) {
        setResponsesPage(1);
        setHasMoreResponses(true);
        setResponsesLoading(true);
      } else if (page === 1) {
        setResponsesLoading(true);
      }

      // TODO: Implement API call to get quiz responses
      // For now, using mock data
      const mockResponses = [
        {
          id: 1,
          student_name: 'John Doe',
          course_title: 'The God You Can Love',
          chapter_title: 'Chapter 1',
          module_title: 'Introduction to Love',
          question: 'What does love mean to you?',
          answer: 'Love means caring for others and putting their needs before my own.',
          submitted_at: '2025-01-02T10:30:00Z',
          module_id: 1,
          course_id: 4
        },
        {
          id: 2,
          student_name: 'Jane Smith',
          course_title: 'The God You Can Love',
          chapter_title: 'Chapter 1',
          module_title: 'Understanding Grace',
          question: 'How has grace impacted your life?',
          answer: 'Grace has shown me that I am loved despite my mistakes.',
          submitted_at: '2025-01-02T11:15:00Z',
          module_id: 2,
          course_id: 4
        },
        {
          id: 3,
          student_name: 'Mike Johnson',
          course_title: 'The God You Can Love',
          chapter_title: 'Chapter 2',
          module_title: 'The Nature of God',
          question: 'True or False: God is always loving.',
          answer: 'True',
          submitted_at: '2025-01-02T12:00:00Z',
          module_id: 3,
          course_id: 4
        }
      ];

      if (reset || page === 1) {
        setResponses(mockResponses);
      } else {
        setResponses(prev => [...prev, ...mockResponses]);
      }

      // Simulate pagination - in real implementation, check if there are more pages
      setHasMoreResponses(page < 3); // Mock: 3 pages max
      setResponsesPage(page);
    } catch (error) {
      console.error('Error loading responses:', error);
    } finally {
      setResponsesLoading(false);
    }
  };

  const handleChapterPress = async (chapter: any) => {
    try {
      // Load modules for this chapter
      const courseModules = await ApiService.getCourseModules(chapter.course_id);
      setModules(courseModules);
      setSelectedChapter(chapter);
      setShowLessonModal(true);
    } catch (error) {
      console.error('Error loading chapter modules:', error);
    }
  };

  const handleModulePress = (module: Module) => {
    setShowLessonModal(false);
    router.push({
      pathname: '/lesson' as any,
      params: {
        moduleId: module.id.toString(),
        courseId: module.course_id.toString()
      }
    });
  };

  const loadMoreResponses = () => {
    if (!responsesLoading && hasMoreResponses) {
      loadResponses(responsesPage + 1, false);
    }
  };

  const onRefreshResponses = () => {
    loadResponses(1, true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      console.log('Manual refresh triggered');
      await loadFavoritedChapters();
      await loadFavoriteMusic();
    } catch (error) {
      console.error('Error refreshing favorites:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const renderChapterItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.chapterItem}
      onPress={() => handleChapterPress(item)}
    >
      <Image 
        source={getImageUrlWithFallback(item.cover_image_url)} 
        style={styles.chapterImage} 
      />
      <View style={styles.chapterTextContainer}>
        <Text style={styles.chapterTitle}>{item.chapter_title}</Text>
        <Text style={styles.chapterSubtitle}>{item.course_title}</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${item.progress_percentage.toFixed(2)}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {item.completed_modules}/{item.total_modules} modules
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={24} color="gray" />
    </TouchableOpacity>
  );

  const renderLessonItem = ({ item }: { item: FavoriteLesson }) => (
    <TouchableOpacity style={styles.lessonItem}>
      <Image source={item.image} style={styles.lessonImage} />
      <View style={styles.lessonTextContainer}>
        <Text style={styles.lessonTitle}>{item.title}</Text>
        <Text style={styles.lessonSubtitle}>{item.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="gray" />
    </TouchableOpacity>
  );

  const renderMusicItem = ({ item }: { item: FavoriteMusic }) => (
    <View style={styles.musicCard}>
      <View style={styles.musicTitleContainer}>
        <Text style={styles.musicTitle}>{item.title}</Text>
        <Ionicons name="heart" size={18} color="white" />
      </View>
      <Text style={styles.musicArtist}>{item.artist}</Text>
      <TouchableOpacity style={styles.musicButton}>
        <Ionicons name="musical-notes" size={16} color="white" />
        <Text style={styles.musicButtonText}>Music</Text>
      </TouchableOpacity>
    </View>
  );

  // Render admin/teacher responses view
  if (isAdminOrTeacher) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.adminHeader}>
          <Text style={styles.adminTitle}>Student Responses</Text>
          <Text style={styles.adminSubtitle}>Review quiz responses from your students</Text>
        </View>
        
        <FlatList
          data={responses}
          keyExtractor={(item, index) => `response-${item.id || index}`}
          renderItem={({ item }) => (
            <View style={styles.responseCard}>
              <View style={styles.responseHeader}>
                <Text style={styles.studentName}>{item.student_name}</Text>
                <Text style={styles.responseDate}>
                  {new Date(item.submitted_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.responseContent}>
                <Text style={styles.courseInfo}>
                  {item.course_title} - {item.chapter_title}
                </Text>
                <Text style={styles.moduleInfo}>{item.module_title}</Text>
                <Text style={styles.questionText}>Q: {item.question}</Text>
                <Text style={styles.answerText}>A: {item.answer}</Text>
              </View>
            </View>
          )}
          onEndReached={loadMoreResponses}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={responsesLoading}
              onRefresh={onRefreshResponses}
              tintColor="#6B8E23"
              colors={["#6B8E23"]}
              title="Pull to refresh"
              titleColor="#6B8E23"
            />
          }
          ListFooterComponent={() => 
            hasMoreResponses ? (
              <View style={styles.loadingMore}>
                <Text style={styles.loadingMoreText}>Loading more responses...</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>No responses yet</Text>
              <Text style={styles.emptyStateSubtext}>Student responses will appear here as they complete quizzes</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // Render student favorites view (existing code)
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
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
        contentContainerStyle={styles.scrollContent}
      >

        {/* Favorited Chapters Section */}
        <View style={styles.section}>
          {/* <Text style={styles.sectionTitle}>Favorited Chapters</Text> */}
          {loading ? (
            <Text style={styles.loadingText}>Loading favorited chapters...</Text>
          ) : favoritedChapters.length > 0 ? (
            <FlatList
              data={favoritedChapters}
              renderItem={renderChapterItem}
              keyExtractor={item => item.chapter_id.toString()}
              scrollEnabled={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>No favorited chapters yet</Text>
              <Text style={styles.emptyStateSubtext}>Tap the heart icon on chapter cards to add them to favorites</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Music Section - Fixed at bottom above tab bar */}
      {favoriteMusic.length > 0 && (
        <View style={styles.musicSection}>
          <Text style={styles.musicSectionTitle}>Music</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.musicScrollContent}
          >
            {favoriteMusic.map(item => (
              <View key={item.id} style={styles.musicItemContainer}>
                <MusicCard 
                  title={item.title}
                  mediaUrl={item.mediaUrl}
                  onPlay={() => {
                    WebBrowser.openBrowserAsync(item.mediaUrl);
                    // Handle play functionality
                  }}
                  style={styles.musicCard}
                />
                <Text style={styles.musicChapterTitle}>{item.chapterTitle}</Text>
                <Text style={styles.musicCourseTitle}>{item.courseTitle}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Lesson Modal */}
      <LessonIndexModal
        visible={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        modules={modules}
        courseTitle={selectedChapter?.course_title || ''}
        onLessonPress={handleModulePress}
        completedLessons={new Set()}
        progressPercentage={selectedChapter?.progress_percentage || 0}
        chapterTitle={selectedChapter?.chapter_title || 'Complete'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
  section: {
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  lessonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  lessonImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  lessonTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  lessonSubtitle: {
    fontSize: 14,
    color: 'gray',
    marginTop: 4,
  },
  musicList: {
    paddingRight: 20,
  },
  musicTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  musicTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  musicArtist: {
    color: 'white',
    fontSize: 14,
    marginTop: 5,
    marginBottom: 15,
  },
  musicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  musicButtonText: {
    color: 'white',
    marginLeft: 8,
  },
  // New styles for favorited chapters
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chapterImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 16,
  },
  chapterTextContainer: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  chapterSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6B8E23',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    minWidth: 60,
  },
  loadingText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Scroll content with bottom padding for music section
  scrollContent: {
    paddingBottom: 120, // Space for music section at bottom
  },
  // Music section styles - fixed at bottom
  musicSection: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    backgroundColor: '#f5f2ec',
    paddingTop: 15,
    // paddingBottom: 40,
    // borderTopWidth: 1,
    // borderTopColor: '#E8E8E8',
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: -2 },
    // shadowOpacity: 0.1,
    // shadowRadius: 4,
    elevation: 0,
  },
  musicSectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    paddingHorizontal: 20,
    color: '#333',
  },
  musicScrollContent: {
    paddingHorizontal: 10,
    gap: 1,
  },
  musicItemContainer: {
    width: 300,
    height: 150,
    marginRight: 15,
    // marginBottom: 2,
  },
  musicCard: {
    // marginBottom: 8,
    height: 150,
  },
  musicChapterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  musicCourseTitle: {
    fontSize: 12,
    color: '#666',
  },

  // Admin/Teacher responses styles
  adminHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#f5f2ec',
  },
  adminTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginBottom: 4,
  },
  adminSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  responseCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  responseDate: {
    fontSize: 12,
    color: '#666',
  },
  responseContent: {
    marginTop: 8,
  },
  courseInfo: {
    fontSize: 14,
    color: '#6B8E23',
    fontWeight: '600',
    marginBottom: 4,
  },
  moduleInfo: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  answerText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  loadingMore: {
    padding: 20,
    alignItems: 'center',
  },
  loadingMoreText: {
    color: '#666',
    fontSize: 14,
  },
});
