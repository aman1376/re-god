import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Switch, StatusBar, ActivityIndicator, Modal, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/contexts/AuthContext';
import ApiService, { type Note } from '../../src/services/api';
// Optional import for notifications - fallback if not available
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.warn('expo-notifications not available:', error);
}

export default function MeScreen() {
  const router = useRouter();
  const { user, logout, loading: authLoading, refreshUserData } = useAuth();
  
  // Check if user is admin or teacher
  const isAdminOrTeacher = user?.role === 'admin' || user?.role === 'teacher';
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderTime, setReminderTime] = useState('7:00 AM');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [reminderDetails, setReminderDetails] = useState<any>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(7);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState('AM');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  // Admin/Teacher specific state
  const [teacherCode, setTeacherCode] = useState<string>('');

  useEffect(() => {
    const fetchRecentNotes = async () => {
      try {
        const notes = await ApiService.getNotes();
        setRecentNotes(notes.slice(0, 3));
      } catch (error) {
        console.error("Failed to fetch recent notes:", error);
      }
    };

    const fetchReminderDetails = async () => {
      try {
        if (!Notifications) {
          console.warn('Notifications not available');
          return;
        }
        // Check if there's a scheduled reminder
        const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
        if (scheduledNotifications.length > 0) {
          const reminder = scheduledNotifications[0];
          setReminderDetails(reminder);
          setRemindersEnabled(true);
        }
      } catch (error) {
        console.error("Failed to fetch reminder details:", error);
      }
    };

    const fetchUserProfile = async () => {
      try {
        // First try to use user data from auth context
        if (user && user.avatar_url) {
          const baseUrl = await ApiService.base();
          const staticBaseUrl = baseUrl.replace('/api', '');
          const fullAvatarUrl = user.avatar_url.startsWith('http') 
            ? user.avatar_url 
            : `${staticBaseUrl}${user.avatar_url}`;
          
          console.log('Setting profile image from auth context user data:', fullAvatarUrl);
          setProfileImage(fullAvatarUrl);
          return;
        }

        // Fallback: fetch profile data from API
        const profile = await ApiService.getProfile();
        console.log('Fetched profile data:', profile);
        if (profile && profile.avatar_url) {
          // Construct full URL for the avatar
          const baseUrl = await ApiService.base();
          const staticBaseUrl = baseUrl.replace('/api', '');
          const fullAvatarUrl = profile.avatar_url.startsWith('http') 
            ? profile.avatar_url 
            : `${staticBaseUrl}${profile.avatar_url}`;
          
          console.log('Setting profile image from API profile data:', fullAvatarUrl);
          setProfileImage(fullAvatarUrl);
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
      }
    };

    const fetchTeacherCode = async () => {
      try {
        if (isAdminOrTeacher) {
          const teacherCodeData = await ApiService.getTeacherCode();
          setTeacherCode(teacherCodeData.teacher_code);
        }
      } catch (error) {
        console.error("Failed to fetch teacher code:", error);
        // Fallback to empty string if API call fails
        setTeacherCode('');
      }
    };

    if (user) {
      console.log('User data in useEffect:', { 
        name: user.name, 
        email: user.email, 
        avatar_url: user.avatar_url,
        id: user.id 
      });
      // Clear API cache to ensure we use the correct URL
      ApiService.clearCache();
      
      if (isAdminOrTeacher) {
        fetchTeacherCode();
      } else {
        fetchRecentNotes();
        fetchReminderDetails();
      }
      
      fetchUserProfile();
    }
  }, [user, isAdminOrTeacher]);

  const handleReminderPress = () => {
    setReminderModalVisible(true);
  };

  const handleTimeChange = () => {
    const timeString = `${selectedHour}:${selectedMinute.toString().padStart(2, '0')} ${selectedPeriod}`;
    setReminderTime(timeString);
    setShowTimePicker(false);
  };

  const toggleTimePicker = () => {
    console.log('Time picker button pressed!');
    setShowTimePicker(!showTimePicker);
  };

  const handleDayToggle = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please grant camera roll permissions to select photos.');
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    Alert.alert(
      'Select Profile Picture',
      'Choose how you want to add your profile picture',
      [
        {
          text: 'Camera',
          onPress: () => openCamera(),
        },
        {
          text: 'Photo Library',
          onPress: () => openImageLibrary(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadProfileImage(result.assets[0].uri);
    }
  };

  const openImageLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadProfileImage(result.assets[0].uri);
    }
  };

  const uploadProfileImage = async (imageUri: string) => {
    setIsUploadingImage(true);
    try {
      // Upload the image to the server
      const uploadResult = await ApiService.uploadProfilePicture(imageUri);
      
      // Update local state with the server URL
      setProfileImage(uploadResult.public_url);
      
      // Refresh user data in auth context to get updated user info and avatar
      try {
        await refreshUserData();
        console.log('User data refreshed successfully after profile picture upload');
      } catch (refreshError) {
        console.warn('Failed to refresh user data:', refreshError);
        // Fallback: try to get profile data directly
        try {
          const profile = await ApiService.getProfile();
          if (profile && profile.avatar_url) {
            setProfileImage(profile.avatar_url);
          }
        } catch (profileError) {
          console.warn('Failed to refresh profile data:', profileError);
        }
      }
      
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading profile image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', `Failed to update profile picture: ${errorMessage}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and you will lose all your data, including courses, notes, and progress.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Show loading state (optional)
              await ApiService.deleteAccount();
              
              // Show success message
              Alert.alert(
                'Account Deleted',
                'Your account has been successfully deleted.',
                [
                  {
                    text: 'OK',
                    onPress: async () => {
                      // Clear tokens and logout
                      await logout();
                      // Navigate to auth screen
                      router.replace('/auth');
                    }
                  }
                ]
              );
            } catch (error) {
              console.error('Error deleting account:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              Alert.alert('Error', `Failed to delete account: ${errorMessage}`);
            }
          }
        }
      ]
    );
  };

  const handleSetReminder = async () => {
    try {
      if (!Notifications) {
        Alert.alert('Not Available', 'Notifications are not available in this environment. Please use a development build for full functionality.');
        setReminderModalVisible(false);
        return;
      }

      if (selectedDays.length === 0) {
        Alert.alert('Error', 'Please select at least one day for reminders');
        return;
      }

      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please enable notifications to set reminders.');
        return;
      }

      // Cancel existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

      // Extract hour and minute from selected time
      const [time, period] = reminderTime.split(' ');
      const [hour, minute] = time.split(':').map(Number);
      const hour24 = period === 'PM' && hour !== 12 ? hour + 12 : period === 'AM' && hour === 12 ? 0 : hour;

      // Schedule new notifications for selected days
      for (const day of selectedDays) {
        const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
        if (dayIndex !== -1) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Study Reminder',
              body: 'Time to study! Open the app to continue your learning journey.',
              sound: true,
            },
            trigger: {
              weekday: dayIndex === 0 ? 7 : dayIndex, // Sunday is 7 in expo-notifications
              hour: hour24,
              minute: minute,
              repeats: true,
            } as any,
          });
        }
      }

      setReminderDetails({ time: reminderTime, days: selectedDays });
      setReminderModalVisible(false);
      Alert.alert('Success', `Study reminders have been set for ${selectedDays.join(', ')} at ${reminderTime}!`);
    } catch (error) {
      console.error('Error setting reminder:', error);
      Alert.alert('Error', 'Failed to set reminder. Please try again.');
    }
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6B8E23" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={false}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarShadowContainer}>
              {user?.avatar_url || profileImage ? (
                <Image 
                  source={{ uri: (user?.avatar_url || profileImage)! }} 
                  style={styles.avatar}
                  onError={(error) => {
                    console.error('Image load error:', error);
                    console.error('Failed to load image URL:', user?.avatar_url || profileImage);
                  }}
                  onLoad={() => {
                    console.log('Image loaded successfully:', user?.avatar_url || profileImage);
                  }}
                />
              ) : (
                <View style={[styles.avatar, styles.defaultAvatar]}>
                  <Text style={styles.avatarInitials}>
                    {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'}
                  </Text>
                </View>
              )}
            </View>
            {isUploadingImage && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>
          <Text style={styles.name}>{user?.name || user?.email || 'User'}</Text>
          <TouchableOpacity 
            style={[styles.editProfileButton, isUploadingImage && styles.editProfileButtonDisabled]} 
            onPress={pickImage}
            disabled={isUploadingImage}
          >
            <Text style={styles.editProfileButtonText}>
              {isUploadingImage ? 'Uploading...' : 'Edit profile pic'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Menu Sections */}
        <View style={styles.menuContainer}>
          {isAdminOrTeacher ? (
            // Admin/Teacher menu
            <>
              {/* Teacher Code Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Teacher Information</Text>
                
                <View style={styles.teacherCodeItem}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="key-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Teacher Code</Text>
                  </View>
                  <View style={styles.teacherCodeContainer}>
                    <Text style={styles.teacherCodeText}>{teacherCode}</Text>
                    <TouchableOpacity 
                      style={styles.copyButton}
                      onPress={() => {
                        // TODO: Implement copy to clipboard
                        Alert.alert('Copied', 'Teacher code copied to clipboard');
                      }}
                    >
                      <Ionicons name="copy-outline" size={16} color="#6B8E23" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Management Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Management</Text>
                
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => router.push('/notes')}
                >
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="document-text-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Notes</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#95928d" />
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => router.push('/connect')}
                >
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="chatbubbles-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Student Chats</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#95928d" />
                </TouchableOpacity>
              </View>

              {/* Permissions */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Permissions</Text>
                
                <View style={styles.menuItem}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="notifications-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Notifications</Text>
                  </View>
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={setNotificationsEnabled}
                    trackColor={{ false: '#95928d', true: '#34C759' }}
                    thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
                  />
                </View>
              </View>
            </>
          ) : (
            // Student menu (existing code)
            <>
              {/* My Stuff */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>My stuff</Text>
                
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => router.push('/notes')}
                >
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="pencil-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Notes</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#95928d" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="share-social-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Share with friends</Text>
                  </View>
                  <Ionicons name="link-outline" size={20} color="#95928d" />
                </TouchableOpacity>
              </View>

              {/* Permissions */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Permissions</Text>
                
                <View style={styles.menuItem}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="notifications-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Notifications</Text>
                  </View>
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={setNotificationsEnabled}
                    trackColor={{ false: '#95928d', true: '#34C759' }}
                    thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
                  />
                </View>

                <TouchableOpacity style={styles.menuItem} onPress={handleReminderPress}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="time-outline" size={20} color="#95928d" />
                    <Text style={styles.menuItemText}>Reminders</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#95928d" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Additional Menu Items */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="person-outline" size={20} color="#95928d" />
                <Text style={styles.menuItemText}>About</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#95928d" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="help-circle-outline" size={20} color="#95928d" />
                <Text style={styles.menuItemText}>FAQ</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#95928d" />
            </TouchableOpacity>
          </View>

          {/* Logout Button */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.logoutButton} 
              onPress={async () => {
                try {
                  await logout();
                  // Navigation will be handled by the auth state change
                } catch (error) {
                  console.error('Logout error:', error);
                }
              }}
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.section}>
            <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAccount}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="trash-outline" size={20} color="#95928d" />
                <Text style={styles.menuItemText}>Delete Account</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Reminder Modal */}
      <Modal
        visible={reminderModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReminderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.clockIconContainer}>
                <Ionicons name="time" size={54} color="#FFFFFF" />
              </View>
              <Text style={styles.modalTitle}>When would you like to be reminded to study?</Text>
            </View>

            {/* Schedule Section */}
            <View style={styles.scheduleSection}>
              <Text style={styles.scheduleLabel}>SCHEDULE</Text>
              
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleText}>Time</Text>
                  <TouchableOpacity 
                    style={styles.timeButton} 
                    onPress={toggleTimePicker}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.timeButtonText}>{reminderTime}</Text>
                    <Ionicons name={showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#384513" />
                  </TouchableOpacity>
                </View>

                {/* Inline Time Picker */}
                {showTimePicker && (
                  <View style={styles.inlineTimePicker}>
                    <Text style={styles.timePickerTitle}>Select Time</Text>
                    
                    <View style={styles.timePickerRow}>
                      {/* Hour Picker */}
                      <View style={styles.timePickerColumn}>
                        <Text style={styles.timePickerLabel}>Hour</Text>
                        <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => (
                            <TouchableOpacity
                              key={hour}
                              style={[
                                styles.timePickerItem,
                                selectedHour === hour && styles.timePickerItemSelected
                              ]}
                              onPress={() => setSelectedHour(hour)}
                            >
                              <Text style={[
                                styles.timePickerItemText,
                                selectedHour === hour && styles.timePickerItemTextSelected
                              ]}>
                                {hour}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>

                      {/* Minute Picker */}
                      <View style={styles.timePickerColumn}>
                        <Text style={styles.timePickerLabel}>Minute</Text>
                        <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                          {Array.from({ length: 60 }, (_, i) => i).map(minute => (
                            <TouchableOpacity
                              key={minute}
                              style={[
                                styles.timePickerItem,
                                selectedMinute === minute && styles.timePickerItemSelected
                              ]}
                              onPress={() => setSelectedMinute(minute)}
                            >
                              <Text style={[
                                styles.timePickerItemText,
                                selectedMinute === minute && styles.timePickerItemTextSelected
                              ]}>
                                {minute.toString().padStart(2, '0')}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>

                      {/* Period Picker */}
                      <View style={styles.timePickerColumn}>
                        <Text style={styles.timePickerLabel}>Period</Text>
                        <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false}>
                          {['AM', 'PM'].map(period => (
                            <TouchableOpacity
                              key={period}
                              style={[
                                styles.timePickerItem,
                                selectedPeriod === period && styles.timePickerItemSelected
                              ]}
                              onPress={() => setSelectedPeriod(period)}
                            >
                              <Text style={[
                                styles.timePickerItemText,
                                selectedPeriod === period && styles.timePickerItemTextSelected
                              ]}>
                                {period}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.timePickerActions}>
                      <TouchableOpacity 
                        style={styles.timePickerCancelButton}
                        onPress={() => setShowTimePicker(false)}
                      >
                        <Text style={styles.timePickerCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.timePickerConfirmButton}
                        onPress={handleTimeChange}
                      >
                        <Text style={styles.timePickerConfirmText}>Confirm</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

              <View style={styles.scheduleRow}>
                <Text style={styles.scheduleText}>Repeat</Text>
                <Text style={styles.repeatText}>{selectedDays.length > 0 ? selectedDays.join(', ') : 'No days selected'}</Text>
              </View>

              {/* Day Selection */}
              <View style={styles.daySelection}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => {
                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const fullDayName = dayNames[index];
                  const isSelected = selectedDays.includes(fullDayName);
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
                      onPress={() => handleDayToggle(fullDayName)}
                    >
                      <Text style={[styles.dayButtonText, isSelected && styles.dayButtonTextSelected]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setReminderModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.setButton}
                onPress={handleSetReminder}
              >
                <Text style={styles.setButtonText}>Set</Text>
              </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  avatarShadowContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    // Border for guaranteed visibility
    borderWidth: 2,
    borderColor: '#D0D0D0',
    // More aggressive shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    // Android shadow
    elevation: 16,
    overflow: 'hidden',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  defaultAvatar: {
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#666',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 36,
    fontWeight: '400',
    color: '#1a1a1a',
    marginBottom: 15,
  },
  editProfileButton: {
    backgroundColor: '#bfc183',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 20,
  },
  editProfileButtonText: {
    color: '#747d55',
    fontSize: 14,
    fontWeight: '500',
  },
  editProfileButtonDisabled: {
    opacity: 0.6,
  },
  menuContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: '#f5f2ec',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 12,
    fontWeight: 'bold',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e5e2db',
    borderRadius: 8,
    padding: 15,
    marginBottom: 8,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#95928d',
    marginLeft: 12,
  },
  logoutButton: {
    backgroundColor: '#384513',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#f5f2ec',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#f5f2ec',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  clockIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4A5D23',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#384513',
    textAlign: 'center',
    marginTop: 12,
  },
  scheduleSection: {
    borderTopWidth: 1,
    borderTopColor: '#95928d',
    paddingTop: 20,
    marginBottom: 24,
  },
  scheduleLabel: {
    fontSize: 16,
    color: '#95928d',
    fontWeight: '600',
    marginBottom: 16,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  timeButtonText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  repeatText: {
    fontSize: 16,
    color: '#C7C7CC',
  },
  daySelection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#384513',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonSelected: {
    backgroundColor: '#384513',
  },
  dayButtonText: {
    fontSize: 16,
    color: '#384513',
    fontWeight: '600',
  },
  dayButtonTextSelected: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 24,
    padding: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  setButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 12,
    marginLeft: 8,
    alignItems: 'center',
  },
  setButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  // Time Picker Styles
  inlineTimePicker: {
    backgroundColor: '#f5f2ec',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e2db',
  },
  timePickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  timePickerContainer: {
    backgroundColor: '#f5f2ec',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  timePickerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 20,
  },
  timePickerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  timePickerColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  timePickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#95928d',
    marginBottom: 12,
  },
  timePickerScroll: {
    maxHeight: 120,
    width: '100%',
  },
  timePickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 2,
    alignItems: 'center',
  },
  timePickerItemSelected: {
    backgroundColor: '#384513',
  },
  timePickerItemText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  timePickerItemTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timePickerCancelButton: {
    flex: 1,
    backgroundColor: '#e5e2db',
    borderRadius: 24,
    padding: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  timePickerCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#95928d',
  },
  timePickerConfirmButton: {
    flex: 1,
    backgroundColor: '#384513',
    borderRadius: 24,
    padding: 12,
    marginLeft: 8,
    alignItems: 'center',
  },
  timePickerConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Admin/Teacher specific styles
  teacherCodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 8,
  },
  teacherCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f2ec',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  teacherCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B8E23',
    marginRight: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyButton: {
    padding: 4,
  },
});
