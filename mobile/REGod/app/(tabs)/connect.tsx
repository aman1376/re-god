import React, { useState, useEffect, useRef } from 'react';
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
    console.log('No valid avatar URL provided, using default avatar');
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

  // Check if user is admin or teacher
  const isAdminOrTeacher = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    loadConnections();

    // Initialize WebSocket for real-time updates
    if (user?.id && useWebSocket) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.id]);

  // Refresh connections when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('Connect screen focused - refreshing data');
      if (user?.id) {
        loadConnections('focus');
      }
    }, [user?.id])
  );

  const connectWebSocket = async () => {
    if (!user?.id) return;

    try {
      const ws = await ApiService.createWebSocketConnection(user.id);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Connect] WebSocket connected successfully');
        setIsConnected(true);
      };

      ws.onmessage = async (event) => {
        console.log('[Connect] WebSocket message received:', event.data);
        try {
          await ApiService.handleWebSocketMessage(
            event.data,
            async (message) => {
              // Handle new real-time message - refresh conversations to update unread counts
              console.log('[Connect] New message received, refreshing conversations:', message);
              try {
                await loadConnections('websocket');
                console.log('[Connect] Conversations refreshed successfully after new message');
              } catch (refreshError) {
                console.error('[Connect] Failed to refresh conversations after new message:', refreshError);
                // Fallback: try refreshing again after a short delay
                setTimeout(() => {
                  loadConnections('websocket-fallback').catch(console.error);
                }, 1000);
              }
            },
            (error) => {
              console.warn('[Connect] WebSocket message parsing error:', error);
            }
          );
        } catch (error) {
          console.error('[Connect] Error handling WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('[Connect] WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        console.warn('[Connect] WebSocket connection failed:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.warn('[Connect] WebSocket connection failed:', error);
    }
  };

  const loadConnections = async (source = 'manual') => {
    try {
      // Only show loading spinner for manual refreshes, not WebSocket updates
      if (source === 'manual' || source === 'focus') {
        setLoading(true);
      }
      setError(null);

      console.log(`Loading connections for user (${source}):`, user);
      console.log('User role:', user?.role);
      console.log('User ID:', user?.id);
      
      if (user?.role === 'student' || (!user?.role && user?.id)) {
        // For students, get assigned teacher (also handle cases where role might not be set)
        console.log('Fetching assigned teacher...');
        try {
          const teacherData = await ApiService.getAssignedTeacher();
          console.log('Teacher data received:', teacherData);
          setConversations([{
            id: teacherData.id || 'unknown',
            name: teacherData.name || 'Unknown',
            avatar_url: teacherData.avatar_url,
            lastMessage: teacherData.last_message || 'Start a conversation with your teacher',
            lastMessageTime: teacherData.last_message_time ? (() => {
              try {
                return new Date(teacherData.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              } catch (e) {
                return '';
              }
            })() : '',
            is_online: teacherData.is_online,
            unread_count: teacherData.unread_count
          }]);
          console.log(`[${source}] Conversations updated: 1 conversation (teacher)`);
        } catch (teacherError) {
          console.error('Error fetching assigned teacher:', teacherError);
          
          // Check if the error is about not having a teacher assigned
          const errorMessage = teacherError instanceof Error ? teacherError.message : String(teacherError);
          if (errorMessage.includes('No chat thread found') || errorMessage.includes('Students need to initiate conversations')) {
            // Student doesn't have a teacher assigned yet - show teacher code input
            console.log('Student needs teacher assignment, showing teacher code input');
            setError('You need to be assigned to a teacher to access courses and chat. Please enter your teacher code.');
            setShowTeacherCodeInput(true);
          } else {
            setError('Unable to load teacher information');
          }
        }
      } else if (isAdminOrTeacher) {
        // For admin/teacher, get assigned students (chat threads)
        console.log('Fetching assigned students for admin/teacher...');
        const studentsData = await ApiService.getAssignedStudents();
        console.log('Students data received:', studentsData);
        setConversations(studentsData.map(student => ({
          id: student.id || 'unknown',
          name: student.name || 'Unknown',
          avatar_url: student.avatar_url,
          lastMessage: student.last_message || 'No messages yet',
          lastMessageTime: student.last_message_time ? (() => {
            try {
              return new Date(student.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
              return '';
            }
          })() : '',
          is_online: student.is_online,
          unread_count: student.unread_count,
          thread_id: student.thread_id  // Add thread_id to the mapping
        })));
        console.log(`[${source}] Conversations updated:`, studentsData.length, 'conversations');
      } else {
        setError('Unable to determine user role');
      }
    } catch (err) {
      console.error(`[${source}] Error loading connections:`, err);
      if (err instanceof Error) {
        setError(`Failed to load connections: ${err.message}`);
      } else {
        setError('Failed to load connections');
      }
    } finally {
      setLoading(false);
      console.log(`[${source}] loadConnections completed`);
    }
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    // Early return if item is null/undefined
    if (!item) {
      console.log('Warning: renderConversationItem received null/undefined item');
      return null;
    }

    // Debug logging
    console.log('Rendering conversation item:', item);
    
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
            console.log('[Connect] Navigating to chat with params:', params);
            console.log('[Connect] Item data:', item);
            router.push({ pathname: '/chat' as any, params });
          } catch (error) {
            console.error('Error navigating to chat:', error);
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
                onError={(error) => {
                  console.log(`❌ Avatar image failed to load for "${safeItem.name}":`, safeItem.avatar_url);
                }}
                onLoad={() => {
                  if (safeItem.avatar_url && safeItem.avatar_url !== 'undefined') {
                    console.log(`✅ Avatar image loaded successfully for "${safeItem.name}"`);
                  }
                }}
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
  };

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
