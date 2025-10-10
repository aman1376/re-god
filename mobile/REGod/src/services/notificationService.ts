import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  private static expoPushToken: string | null = null;

  static async initialize(): Promise<void> {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat-messages', {
          name: 'Chat Messages',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Try to get push token (only if projectId is available)
      const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
      if (projectId) {
        try {
          const token = await Notifications.getExpoPushTokenAsync({
            projectId: projectId,
          });
          
          this.expoPushToken = token.data;
          console.log('Expo push token:', this.expoPushToken);
        } catch (tokenError) {
          console.warn('Failed to get Expo push token (this is normal in development):', tokenError);
          // In development/Expo Go, push tokens may not be available
          // This is expected and not an error
        }
      } else {
        console.log('No project ID found - skipping push token generation (normal in development)');
      }

    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  }

  static getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  static async scheduleLocalNotification(
    title: string,
    body: string,
    data?: any
  ): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: null, // Show immediately
    });

    return notificationId;
  }

  static async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  static async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  // Set up notification listeners
  static setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ): void {
    // Listen for notifications received while app is foregrounded
    if (onNotificationReceived) {
      Notifications.addNotificationReceivedListener(onNotificationReceived);
    }

    // Listen for user interactions with notifications
    if (onNotificationResponse) {
      Notifications.addNotificationResponseReceivedListener(onNotificationResponse);
    }
  }

  // Remove notification listeners
  static removeNotificationListeners(): void {
    // Note: expo-notifications doesn't have removeAllNotificationListeners
    // Listeners are automatically cleaned up when components unmount
  }

  // Handle chat notification
  static async handleChatNotification(
    senderName: string,
    message: string,
    threadId: string
  ): Promise<void> {
    try {
      await this.scheduleLocalNotification(
        `New message from ${senderName}`,
        message,
        {
          type: 'chat',
          threadId,
          senderName,
        }
      );
    } catch (error) {
      console.error('Error handling chat notification:', error);
    }
  }

  // Get notification count
  static async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  // Set notification count
  static async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  // Clear all notifications
  static async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
  }
}
