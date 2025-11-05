import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import ApiService from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import TeacherCodeInput from '../../components/TeacherCodeInput';
import { getImageUrl } from '../../src/config/constants';

// Interface for Conversation data
interface Conversation {
  id: string;
  name: string;
  avatar_url?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  is_online?: boolean;
  unread_count?: number;
  thread_id?: number;
}

// Helper function to convert relative URLs to full URLs for avatars
const getAvatarUrlWithFallback = (avatarUrl: string | null | undefined): any => {
  // Handle null, undefined, or empty strings
  if (!avatarUrl || avatarUrl === 'undefined' || avatarUrl.trim() === '') {
    return null; // Return null to show default avatar initials
  }
  
  const fullUrl = getImageUrl(avatarUrl);
  return fullUrl ? { uri: fullUrl } : null;
};

export default function ConnectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTeacherCodeInput, setShowTeacherCodeInput] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const lastLoadTimeRef = useRef(0);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasDataRef = useRef(false);
  const CACHE_DURATION = 5000; // 5 seconds cache

  // Check if user is admin or teacher
  const isAdminOrTeacher = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Optimized focus effect with caching
  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id || !isMountedRef.current) return;
      
      const now = Date.now();
      // Only reload if cache expired or no data
      if (!hasDataRef.current || (now - lastLoadTimeRef.current) > CACHE_DURATION) {
        loadConnections('focus');
      }
    }, [user?.id])
  );

  // Initialize WebSocket separately (doesn't need to reload on every focus)
  useEffect(() => {
    if (user?.id && useWebSocket) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.id, useWebSocket]);

  const connectWebSocket = async () => {
    if (!user?.id || wsRef.current) return;

    try {
      const ws = await ApiService.createWebSocketConnection(user.id);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMountedRef.current) {
          setIsConnected(true);
        }
      };

      ws.onmessage = async (event) => {
        if (!isMountedRef.current) return;
        
        try {
          await ApiService.handleWebSocketMessage(
            event.data,
            async (message) => {
              // Only refresh if component is still mounted and cache expired
              const now = Date.now();
              if (isMountedRef.current && (now - lastLoadTimeRef.current) > 2000) {
                await loadConnections('websocket');
                lastLoadTimeRef.current = Date.now();
              }
            },
            () => {} // Silent error handling
          );
        } catch (error) {
          // Silent error handling for better performance
        }
      };

      ws.onclose = (event) => {
        if (isMountedRef.current) {
          setIsConnected(false);
          wsRef.current = null;
        }
      };

      ws.onerror = () => {
        if (isMountedRef.current) {
          setIsConnected(false);
          wsRef.current = null;
        }
      };
    } catch (error) {
      // Silent error handling
      if (isMountedRef.current) {
        setIsConnected(false);
      }
    }
  };

  // Optimized date formatting helper
  const formatTime = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const loadConnections = async (source = 'manual') => {
    if (!isMountedRef.current || !user?.id) return;
    
    try {
      // Only show loading spinner for manual refreshes, not WebSocket updates
      if (source === 'manual' || source === 'focus') {
        setLoading(true);
      }
      setError(null);

      if (user?.role === 'student' || (!user?.role && user?.id)) {
        // For students, get assigned teacher
        try {
          const teacherData = await ApiService.getAssignedTeacher();
          if (!isMountedRef.current) return;
          
          setConversations([{
            id: teacherData.id || 'unknown',
            name: teacherData.name || 'Unknown',
            avatar_url: teacherData.avatar_url,
            lastMessage: teacherData.last_message || 'Start a conversation with your teacher',
            lastMessageTime: formatTime(teacherData.last_message_time),
            is_online: teacherData.is_online,
            unread_count: teacherData.unread_count
          }]);
          lastLoadTimeRef.current = Date.now();
          hasDataRef.current = true;
        } catch (teacherError) {
          if (!isMountedRef.current) return;
          
          const errorMessage = teacherError instanceof Error ? teacherError.message : String(teacherError);
          if (errorMessage.includes('No chat thread found') || errorMessage.includes('Students need to initiate conversations')) {
            setError('You need to be assigned to a teacher to access courses and chat. Please enter your teacher code.');
            setShowTeacherCodeInput(true);
          } else {
            setError('Unable to load teacher information');
          }
        }
      } else if (isAdminOrTeacher) {
        // For admin/teacher, get assigned students
        const studentsData = await ApiService.getAssignedStudents();
        if (!isMountedRef.current) return;
        
        setConversations(studentsData.map(student => ({
          id: student.id || 'unknown',
          name: student.name || 'Unknown',
          avatar_url: student.avatar_url,
          lastMessage: student.last_message || 'No messages yet',
          lastMessageTime: formatTime(student.last_message_time),
          is_online: student.is_online,
          unread_count: student.unread_count,
          thread_id: student.thread_id
        })));
        lastLoadTimeRef.current = Date.now();
        hasDataRef.current = true;
      } else {
        setError('Unable to determine user role');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      
      if (err instanceof Error) {
        setError(`Failed to load connections: ${err.message}`);
      } else {
        setError('Failed to load connections');
      }
    } finally {
      if (isMountedRef.current) {
        // Use timeout to prevent rapid state updates
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }, 100);
      }
    }
  };

  const renderConversationItem = useCallback(({ item }: { item: Conversation }) => {
    // Early return if item is null/undefined
    if (!item) return null;

    // Safety checks for all required fields
    const safeItem = {
      id: String(item.id || 'unknown'),
      name: String(item.name || 'Unknown'),
      avatar_url: item.avatar_url || null,
      lastMessage: String(item.lastMessage || ''),
      lastMessageTime: String(item.lastMessageTime || ''),
      is_online: Boolean(item.is_online),
      unread_count: Number(item.unread_count || 0)
    };

    // Generate avatar initials safely
    const getInitials = (name: string): string => {
      if (!name || typeof name !== 'string') return '??';
      try {
        const words = name.trim().split(' ');
        const initials = words.map(word => word.charAt(0)).join('').toUpperCase();
        return initials.slice(0, 2) || '??';
      } catch {
        return '??';
      }
    };

    return (
      <TouchableOpacity 
        style={styles.conversationItem}
        onPress={() => {
          try {
            const params = { name: safeItem.name, thread_id: String(item.thread_id || '') };
            router.push({ pathname: '/chat' as any, params });
          } catch (error) {
            // Silent error handling
          }
        }}
      >
        <View style={styles.avatarContainer}>
          {(() => {
            const avatarSource = getAvatarUrlWithFallback(safeItem.avatar_url);
            return avatarSource ? (
              <Image 
                source={avatarSource} 
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.defaultAvatar]}>
                <Text style={styles.avatarInitials}>
                  {getInitials(safeItem.name)}
                </Text>
              </View>
            );
          })()}
          {safeItem.is_online === true && <View style={styles.onlineIndicator} />}
          {safeItem.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {safeItem.unread_count > 99 ? '99+' : String(safeItem.unread_count)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.conversationTextContainer}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName}>{safeItem.name}</Text>
            {safeItem.lastMessageTime && safeItem.lastMessageTime.length > 0 && (
              <Text style={styles.conversationTime}>{safeItem.lastMessageTime}</Text>
            )}
          </View>
          <Text style={styles.lastMessage} numberOfLines={2}>{safeItem.lastMessage}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>
            {isAdminOrTeacher ? 'Student Chats' : 'Connect'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>Loading connections...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>
            {isAdminOrTeacher ? 'Student Chats' : 'Connect'}
          </Text>
          <TouchableOpacity onPress={() => loadConnections('manual')}>
            <Ionicons name="refresh" size={28} color="black" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          {showTeacherCodeInput ? (
            <TouchableOpacity style={styles.teacherCodeButton} onPress={() => setShowTeacherCodeInput(true)}>
              <Text style={styles.teacherCodeButtonText}>Enter Teacher Code</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.retryButton} onPress={() => loadConnections('manual')}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {isAdminOrTeacher ? 'Student Chats' : 'Connect'}
          </Text>
          <View style={styles.connectionStatus}>
            <View style={[styles.connectionIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }]} />
            <Text style={styles.connectionText}>
              {isConnected ? 'Live' : 'Connecting...'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => loadConnections('manual')}>
          <Ionicons name="refresh" size={28} color="black" />
        </TouchableOpacity>
      </View>

      {!conversations || conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {user?.role === 'student' 
              ? 'No teacher assigned yet' 
              : isAdminOrTeacher 
                ? 'No students assigned yet'
                : 'No connections available'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations || []}
          renderItem={renderConversationItem}
          keyExtractor={(item, index) => item?.id || `conversation-${index}`}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
          updateCellsBatchingPeriod={50}
        />
      )}

      {/* Teacher Code Input Modal */}
      {showTeacherCodeInput && user && (
        <TeacherCodeInput
          userEmail={user.email}
          onSuccess={() => {
            setShowTeacherCodeInput(false);
            setError(null);
            // Reload connections after successful teacher code entry
            loadConnections();
          }}
          onCancel={() => {
            setShowTeacherCodeInput(false);
            // Keep the error message so user knows they still need to enter teacher code
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ec',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  headerSpacer: {
    width: 28, // Same width as the menu icon to balance the layout
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  connectionText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  defaultAvatar: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: 'white',
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  conversationTextContainer: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  conversationTime: {
    fontSize: 12,
    color: 'gray',
  },
  lastMessage: {
    fontSize: 14,
    color: 'gray',
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
  teacherCodeButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  teacherCodeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
