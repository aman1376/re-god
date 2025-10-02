import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ApiService, { type Message as ApiMessage, type ChatResponse } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

// Interface for Message data
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: string;
}

export default function ChatScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(true);
  const [wsRetryCount, setWsRetryCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRetries = 3;

  useEffect(() => {
    loadChatHistory();
    if (user?.id) {
      // Try WebSocket first, but don't show errors to user
      if (useWebSocket) {
        // Small delay to avoid immediate connection errors
        const timer = setTimeout(() => {
          try {
            connectWebSocket(0); // Start with retry attempt 0
          } catch (error) {
            // Silently fall back to polling
            console.log('[Chat] WebSocket not available, using polling');
            setUseWebSocket(false);
          }
        }, 500);
        
        return () => clearTimeout(timer);
      } else {
        startPolling();
      }
    }
    
    return () => {
      if (wsRef.current) {
        // Clear any pending retry timer
        if ((wsRef.current as any).retryTimer) {
          clearTimeout((wsRef.current as any).retryTimer);
        }
        wsRef.current.close();
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [user?.id, useWebSocket]);

  const connectWebSocket = (retryAttempt: number = 0) => {
    if (!user?.id) return;
    
    try {
      const ws = ApiService.createWebSocketConnection(user.id);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('[Chat] WebSocket connected successfully');
        setIsConnected(true);
        setWsRetryCount(0); // Reset retry count on successful connection
      };
      
      ws.onmessage = (event) => {
        console.log('[Chat] WebSocket message received:', event.data);
        ApiService.handleWebSocketMessage(
          event.data,
          (message) => {
            // Handle new real-time message
            const newMessage: Message = {
              id: message.id,
              text: message.content,
              sender: message.sender_id === user.id ? 'user' : 'assistant',
              timestamp: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages(prev => [newMessage, ...prev]);
          },
          (error) => {
            console.warn('[Chat] WebSocket message parsing error:', error);
          }
        );
      };
      
      ws.onclose = (event) => {
        console.log('[Chat] WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Only attempt to reconnect if it wasn't a clean close and we haven't exceeded retries
        if (event.code !== 1000 && retryAttempt < maxRetries) {
          const nextRetry = retryAttempt + 1;
          console.log(`[Chat] Attempting to reconnect WebSocket... (${nextRetry}/${maxRetries})`);
          
          const retryTimer = setTimeout(() => {
            if (user?.id && useWebSocket) {
              setWsRetryCount(nextRetry);
              connectWebSocket(nextRetry);
            }
          }, 3000);
          
          // Store timer reference for cleanup if needed
          (wsRef.current as any).retryTimer = retryTimer;
        } else if (retryAttempt >= maxRetries) {
          console.log('[Chat] Max WebSocket retries reached, switching to polling');
          setUseWebSocket(false);
        }
      };
      
      ws.onerror = (error) => {
        // Reduce error noise - only log once per connection attempt
        if (ws.readyState === WebSocket.CONNECTING) {
          console.warn('[Chat] WebSocket connection failed, using polling instead');
          setIsConnected(false);
          
          // Fall back to polling after WebSocket fails
          setUseWebSocket(false);
        }
      };
    } catch (error) {
      console.warn('[Chat] WebSocket not available, using polling:', error);
      // Fall back to polling
      setUseWebSocket(false);
    }
  };

  const startPolling = () => {
    console.log('[Chat] Starting polling for real-time updates...');
    setIsConnected(true);
    
    // Poll for new messages every 3 seconds (less aggressive than 2s)
    pollingRef.current = setInterval(async () => {
      try {
        const chatHistory = await ApiService.getChatHistory();
        setMessages(chatHistory);
      } catch (error) {
        console.warn('[Chat] Polling error (will retry):', error);
        // Don't clear the interval on error, just log and continue
      }
    }, 3000);
  };

  const loadChatHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const chatHistory = await ApiService.getChatHistory();
      setMessages(chatHistory);
    } catch (err) {
      console.error('Error loading chat history:', err);
      // Initialize with empty array if no history
      setMessages([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender === 'user';
    return (
      <View style={[styles.messageContainer, isMe ? styles.myMessageContainer : styles.otherMessageContainer]}>
        <View style={[styles.messageBubble, isMe ? styles.myMessageBubble : styles.otherMessageBubble]}>
          <Text style={isMe ? styles.myMessageText : styles.otherMessageText}>{item.text}</Text>
        </View>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
      </View>
    );
  };

  const handleSend = async () => {
    if (inputText.trim().length === 0 || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputText;
    setInputText('');
    setLoading(true);

    try {
      const response: ChatResponse = await ApiService.sendChatMessage(messageText);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.message,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Error sending message:', err);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      
      // Remove the user message if sending failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
      setInputText(messageText);
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingHistory) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{name || 'Chat'}</Text>
          <View style={styles.connectionStatus}>
            <View style={[styles.connectionIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#FF9800' }]} />
            <Text style={styles.connectionText}>
              {isConnected ? (useWebSocket ? 'Live' : 'Synced') : 'Connecting...'}
            </Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          style={styles.messageList}
          inverted
        />
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask a question about the lesson..."
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="send" size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    backgroundColor: '#FBF9F4',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginRight: 8,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
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
  headerSpacer: {
    width: 40, // Same width as back button to center the title
  },
  flex: {
    flex: 1,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  messageContainer: {
    marginVertical: 5,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    padding: 15,
    borderRadius: 20,
  },
  myMessageBubble: {
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 5,
  },
  otherMessageBubble: {
    backgroundColor: 'white',
    borderBottomLeftRadius: 5,
  },
  myMessageText: {
    color: 'black',
  },
  otherMessageText: {
    color: 'black',
  },
  timestamp: {
    fontSize: 10,
    color: 'gray',
    marginTop: 2,
    marginHorizontal: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    backgroundColor: 'white',
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6B8E23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CCCCCC',
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
  loadingIndicator: {
    marginLeft: 10,
  },
});
