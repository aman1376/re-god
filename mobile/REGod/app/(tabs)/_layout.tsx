import { Tabs, useRouter, useSegments } from 'expo-router';
import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '../../src/contexts/AuthContext';


export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { user } = useAuth();
  
  // Check if we're on the notes screen
  const isNotesScreen = segments.some(segment => segment === 'notes');
  
  // Check if user is teacher or admin
  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';

  return (
    <Tabs
    screenOptions={{
      tabBarActiveTintColor: '#1a1a1a',
      tabBarInactiveTintColor: '#4a4a4a',
      headerShown: false,
      tabBarButton: HapticTab,
      tabBarBackground: () => (
        <BlurView
          tint="light" // can be "light", "dark", or "default"
          intensity={80} // adjust blur strength
          style={{ flex: 1, borderTopWidth: 0 }}
        />
      ),
      tabBarStyle: {
        position: 'absolute',
        backgroundColor: 'transparent', // required for BlurView to show
        borderTopWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
        height: 85,
        paddingBottom: 25,
        paddingTop: 8,
      },
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
      },
    }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="course"
        options={{
          title: 'Course',
          tabBarIcon: ({ color }) => <Ionicons name="book-outline" size={26} color={color} />,
          href: isNotesScreen ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: isTeacherOrAdmin ? 'Responses' : 'Favorites',
          tabBarIcon: ({ color }) => (
            <Ionicons 
              name={isTeacherOrAdmin ? "clipboard-outline" : "heart-outline"} 
              size={26} 
              color={color} 
            />
          ),
          href: isNotesScreen ? null : undefined,
        }}
      />
       <Tabs.Screen
         name="add-note"
         options={{
           title: '',
           href: isNotesScreen ? undefined : null,
           tabBarButton: isNotesScreen ? () => (
             <TouchableOpacity
               onPress={() => router.push('/new-note')}
               style={{
                 position: 'absolute',
                 top: -20,
                 left: '50%',
                 marginLeft: -36,
                 justifyContent: 'center',
                 alignItems: 'center',
                 width: 72,
                 height: 72,
                 borderRadius: 36,
                 backgroundColor: 'black',
                 shadowColor: '#000',
                 shadowOffset: { width: 0, height: 4 },
                 shadowOpacity: 0.3,
                 shadowRadius: 4,
                 elevation: 8,
                 zIndex: 1000,
               }}
             >
               <Ionicons name="add" size={32} color="white" />
             </TouchableOpacity>
           ) : undefined,
         }}
       />
      <Tabs.Screen
        name="connect"
        options={{
          title: 'Connect',
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={26} color={color} />,
          href: isNotesScreen ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={26} color={color} />,
          href: isNotesScreen ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          href: null,
          title: 'Notes',
        }}
      />
    </Tabs>
  );
}