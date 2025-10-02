import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ApiService from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

// Interface for Conversation data
interface Conversation {
  id: string;
  name: string;
  avatar_url?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  is_online?: boolean;
}

export default function ConnectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Check if user is admin or teacher
  const isAdminOrTeacher = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Loading connections for user:', user?.role);
      
      if (user?.role === 'student') {
        // For students, get assigned teacher
        console.log('Fetching assigned teacher...');
        const teacherData = await ApiService.getAssignedTeacher();
        console.log('Teacher data received:', teacherData);
        setConversations([{
          id: teacherData.id,
          name: teacherData.name,
          avatar_url: teacherData.avatar_url,
          lastMessage: 'Start a conversation with your teacher',
          lastMessageTime: '',
          is_online: teacherData.is_online
        }]);
      } else if (isAdminOrTeacher) {
        // For admin/teacher, get assigned students (chat threads)
        console.log('Fetching assigned students for admin/teacher...');
        const studentsData = await ApiService.getAssignedStudents();
        console.log('Students data received:', studentsData);
        setConversations(studentsData.map(student => ({
          id: student.id,
          name: student.name,
          avatar_url: student.avatar_url,
          lastMessage: student.last_message || 'No messages yet',
          lastMessageTime: student.last_message_time || '',
          is_online: student.is_online
        })));
      } else {
        setError('Unable to determine user role');
      }
    } catch (err) {
      console.error('Error loading connections:', err);
      if (err instanceof Error) {
        setError(`Failed to load connections: ${err.message}`);
      } else {
        setError('Failed to load connections');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity 
      style={styles.conversationItem}
      onPress={() => router.push({ pathname: '/chat' as any, params: { name: item.name, id: item.id } })}
    >
      <View style={styles.avatarContainer}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.defaultAvatar]}>
            <Ionicons name="person" size={24} color="#666" />
          </View>
        )}
        {item.is_online && <View style={styles.onlineIndicator} />}
      </View>
      <View style={styles.conversationTextContainer}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName}>{item.name}</Text>
          {item.lastMessageTime && (
            <Text style={styles.conversationTime}>{item.lastMessageTime}</Text>
          )}
        </View>
        <Text style={styles.lastMessage} numberOfLines={2}>{item.lastMessage}</Text>
      </View>
    </TouchableOpacity>
  );

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
          <TouchableOpacity onPress={loadConnections}>
            <Ionicons name="refresh" size={28} color="black" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadConnections}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>
          {isAdminOrTeacher ? 'Student Chats' : 'Connect'}
        </Text>
        <TouchableOpacity onPress={loadConnections}>
          <Ionicons name="refresh" size={28} color="black" />
        </TouchableOpacity>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {user?.role === 'student' 
              ? 'No teacher assigned yet' 
              : isAdminOrTeacher 
                ? 'No students assigned yet'
                : 'No connections available'
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversationItem}
          keyExtractor={item => item.id}
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
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
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
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
