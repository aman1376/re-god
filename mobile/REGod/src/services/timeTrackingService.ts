import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './api';

const TIME_TRACKING_KEY = 'regod_time_tracking';
const LAST_SYNC_KEY = 'regod_last_time_sync';

interface TimeTrackingData {
  [date: string]: number; // date in YYYY-MM-DD format -> hours spent
}

export class TimeTrackingService {
  private static startTime: number | null = null;
  private static isTracking: boolean = false;

  /**
   * Start tracking time for the current session
   */
  static startTracking() {
    if (!this.isTracking) {
      this.startTime = Date.now();
      this.isTracking = true;
      console.log('[TIME_TRACKING] Started tracking at', new Date(this.startTime).toISOString());
    }
  }

  /**
   * Stop tracking time and save the accumulated time to AsyncStorage
   */
  static async stopTracking() {
    if (this.isTracking && this.startTime !== null) {
      const endTime = Date.now();
      const timeSpentSeconds = (endTime - this.startTime) / 1000;
      const timeSpentHours = timeSpentSeconds / 3600;

      console.log('[TIME_TRACKING] Stopped tracking. Time spent:', {
        seconds: timeSpentSeconds.toFixed(2),
        hours: timeSpentHours.toFixed(4)
      });

      // Save to AsyncStorage
      await this.saveTimeSpent(timeSpentHours);

      // Reset tracking state
      this.startTime = null;
      this.isTracking = false;
    }
  }

  /**
   * Save time spent to AsyncStorage for today's date
   */
  private static async saveTimeSpent(hours: number) {
    try {
      const today = this.getTodayDate();
      
      // Get existing time tracking data
      const data = await this.getTimeTrackingData();
      
      // Add to today's total
      data[today] = (data[today] || 0) + hours;
      
      // Save back to AsyncStorage
      await AsyncStorage.setItem(TIME_TRACKING_KEY, JSON.stringify(data));
      
      console.log('[TIME_TRACKING] Saved time data:', {
        date: today,
        totalHours: data[today].toFixed(4),
        addedHours: hours.toFixed(4)
      });
    } catch (error) {
      console.error('[TIME_TRACKING] Error saving time spent:', error);
    }
  }

  /**
   * Get all time tracking data from AsyncStorage
   */
  private static async getTimeTrackingData(): Promise<TimeTrackingData> {
    try {
      const dataStr = await AsyncStorage.getItem(TIME_TRACKING_KEY);
      if (dataStr) {
        return JSON.parse(dataStr);
      }
    } catch (error) {
      console.error('[TIME_TRACKING] Error reading time tracking data:', error);
    }
    return {};
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private static getTodayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get a specific date in YYYY-MM-DD format
   */
  private static getDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Sync today's accumulated time to the backend
   * This should be called daily (ideally at midnight or when app opens each day)
   */
  static async syncTodayData() {
    try {
      const today = this.getTodayDate();
      const data = await this.getTimeTrackingData();
      
      if (data[today] && data[today] > 0) {
        console.log('[TIME_TRACKING] Syncing data for', today, ':', data[today].toFixed(4), 'hours');
        
        // Send to backend
        await ApiService.updateTimeTracking(today, parseFloat(data[today].toFixed(2)));
        
        // Update last sync date
        await AsyncStorage.setItem(LAST_SYNC_KEY, today);
        
        console.log('[TIME_TRACKING] Successfully synced data to backend');
        return true;
      } else {
        console.log('[TIME_TRACKING] No data to sync for today');
        return false;
      }
    } catch (error) {
      console.error('[TIME_TRACKING] Error syncing time data:', error);
      return false;
    }
  }

  /**
   * Sync all unsaved data to the backend
   * This syncs any dates that haven't been synced yet
   */
  static async syncAllPendingData() {
    try {
      const data = await this.getTimeTrackingData();
      const lastSyncDate = await AsyncStorage.getItem(LAST_SYNC_KEY);
      
      let syncedCount = 0;
      for (const [date, hours] of Object.entries(data)) {
        // Only sync if hours > 0 and date is not in future
        if (hours > 0 && date <= this.getTodayDate()) {
          try {
            await ApiService.updateTimeTracking(date, parseFloat(hours.toFixed(2)));
            syncedCount++;
            console.log('[TIME_TRACKING] Synced', date, ':', hours.toFixed(4), 'hours');
          } catch (error) {
            console.error('[TIME_TRACKING] Failed to sync', date, ':', error);
          }
        }
      }
      
      if (syncedCount > 0) {
        await AsyncStorage.setItem(LAST_SYNC_KEY, this.getTodayDate());
        console.log('[TIME_TRACKING] Successfully synced', syncedCount, 'days of data');
      }
      
      return syncedCount > 0;
    } catch (error) {
      console.error('[TIME_TRACKING] Error syncing all pending data:', error);
      return false;
    }
  }

  /**
   * Check if we need to sync data (e.g., new day has started)
   */
  static async shouldSync(): Promise<boolean> {
    try {
      const lastSyncDate = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const today = this.getTodayDate();
      
      // Sync if we've never synced before or if it's a new day
      return !lastSyncDate || lastSyncDate !== today;
    } catch (error) {
      console.error('[TIME_TRACKING] Error checking sync status:', error);
      return false;
    }
  }

  /**
   * Clean up old data (older than 30 days) from AsyncStorage
   */
  static async cleanupOldData() {
    try {
      const data = await this.getTimeTrackingData();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = this.getDateString(thirtyDaysAgo);
      
      const cleanedData: TimeTrackingData = {};
      let removedCount = 0;
      
      for (const [date, hours] of Object.entries(data)) {
        if (date >= cutoffDate) {
          cleanedData[date] = hours;
        } else {
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        await AsyncStorage.setItem(TIME_TRACKING_KEY, JSON.stringify(cleanedData));
        console.log('[TIME_TRACKING] Cleaned up', removedCount, 'old date entries');
      }
    } catch (error) {
      console.error('[TIME_TRACKING] Error cleaning up old data:', error);
    }
  }

  /**
   * Get total time spent today (in hours)
   */
  static async getTodayTimeSpent(): Promise<number> {
    try {
      const data = await this.getTimeTrackingData();
      const today = this.getTodayDate();
      return data[today] || 0;
    } catch (error) {
      console.error('[TIME_TRACKING] Error getting today\'s time:', error);
      return 0;
    }
  }

  /**
   * Initialize time tracking on app start
   * This will sync pending data and clean up old entries
   */
  static async initialize() {
    try {
      console.log('[TIME_TRACKING] Initializing...');
      
      // Check if we should sync
      if (await this.shouldSync()) {
        await this.syncAllPendingData();
      }
      
      // Clean up old data
      await this.cleanupOldData();
      
      console.log('[TIME_TRACKING] Initialization complete');
    } catch (error) {
      console.error('[TIME_TRACKING] Initialization error:', error);
    }
  }
}

export default TimeTrackingService;

