import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ApiService, { type Note } from '../src/services/api';

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNotes();
  }, []);

  // Refresh notes when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadNotes();
    }, [])
  );

  const loadNotes = async () => {
    try {
      console.log('Notes screen: Starting to load notes...');
      setLoading(true);
      setError(null);
      const notesData = await ApiService.getNotes();
      console.log('Notes screen: Received notes data:', notesData);
      setNotes(notesData);
    } catch (err) {
      console.error('Notes screen: Error loading notes:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load notes';
      
      // Check if it's an authentication error
      if (errorMessage.includes('Token verification failed') || 
          errorMessage.includes('401') || 
          errorMessage.includes('Unauthorized')) {
        setError('Please sign in again to view your notes');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNotePress = (note: Note) => {
    // Navigate to note detail or edit screen
    router.push({ pathname: '/new-note' as any, params: { noteId: note.id.toString() } });
  };

  const handleDeleteNote = async (noteId: number) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.deleteNote(noteId);
              setNotes(notes.filter(note => note.id !== noteId));
              Alert.alert('Success', 'Note deleted successfully');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete note');
              console.error('Error deleting note:', err);
            }
          },
        },
      ]
    );
  };

  const filteredNotes = notes.filter(note =>
    (note.content && note.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (note.title && note.title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderNoteItem = ({ item }: { item: Note }) => (
    <TouchableOpacity 
      style={styles.noteItem}
      onPress={() => handleNotePress(item)}
      onLongPress={() => handleDeleteNote(item.id)}
    >
      <View style={styles.noteIcon}>
        <Ionicons name="pencil" size={24} color="#8E8E93" />
      </View>
      <View style={styles.noteContent}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {new Date(item.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })} | {item.title || 'Note'}
        </Text>
        <Text style={styles.notePreview} numberOfLines={2}>
          {item.content}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#C7C7CC" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6B8E23" />
          <Text style={styles.loadingText}>Loading notes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadNotes}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notes</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="gray" style={styles.searchIcon} />
        <TextInput 
          placeholder="Search notes..." 
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredNotes}
        renderItem={renderNoteItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={64} color="gray" />
            <Text style={styles.emptyText}>No notes found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search term' : 'Start taking notes on your lessons'}
            </Text>
          </View>
        }
      />

      <View style={styles.fabContainer}>
        <TouchableOpacity 
          style={styles.fab}
          onPress={() => router.push('/new-note' as any)}
        >
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f2ec', // A slightly off-white color
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f2ec',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 120, // Space for the FAB
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  noteIcon: {
    marginRight: 16,
  },
  noteContent: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  notePreview: {
    fontSize: 14,
    color: 'gray',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
    backgroundColor: 'transparent',
  },
  fab: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
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
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'gray',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'gray',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
});
