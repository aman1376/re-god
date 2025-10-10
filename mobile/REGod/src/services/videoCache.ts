import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config/constants';

const VIDEO_CACHE_KEY = 'auth_video_cached';
const VIDEO_CACHE_VERSION_KEY = 'auth_video_version';
const VIDEO_FILE_NAME = 'auth-video.mp4';
const CURRENT_VIDEO_VERSION = '1.0'; // Increment this when you update the video

export class VideoCacheService {
  private static videoUri: string | null = null;

  /**
   * Get the local file path for the cached video
   */
  private static getLocalVideoPath(): string {
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
    return `${cacheDir}${VIDEO_FILE_NAME}`;
  }

  /**
   * Check if video is already cached and up-to-date
   */
  static async isCached(): Promise<boolean> {
    try {
      const isCached = await AsyncStorage.getItem(VIDEO_CACHE_KEY);
      const cachedVersion = await AsyncStorage.getItem(VIDEO_CACHE_VERSION_KEY);
      const localPath = this.getLocalVideoPath();
      
      // Check if file exists and version matches
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      
      return (
        isCached === 'true' && 
        cachedVersion === CURRENT_VIDEO_VERSION && 
        fileInfo.exists
      );
    } catch (error) {
      console.error('[VideoCache] Error checking video cache:', error);
      return false;
    }
  }

  /**
   * Download and cache the video from Supabase
   */
  static async downloadAndCache(
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const localPath = this.getLocalVideoPath();
      
      console.log('[VideoCache] Starting video download...');
      console.log('[VideoCache] Supabase URL:', CONFIG.SUPABASE_VIDEO_URL);
      console.log('[VideoCache] Local path:', localPath);

      // Check if already cached
      const cached = await this.isCached();
      if (cached) {
        console.log('[VideoCache] Video already cached, using local version');
        this.videoUri = localPath;
        return localPath;
      }

      // Delete old video if it exists
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      }

      // Download with progress tracking
      const downloadResumable = FileSystem.createDownloadResumable(
        CONFIG.SUPABASE_VIDEO_URL,
        localPath,
        {},
        (downloadProgress) => {
          const progress = 
            downloadProgress.totalBytesWritten / 
            downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(progress);
          console.log(
            `[VideoCache] Download progress: ${(progress * 100).toFixed(2)}%`
          );
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (!result) {
        throw new Error('Video download failed');
      }

      console.log('[VideoCache] Video downloaded successfully');
      
      // Mark as cached with version
      await AsyncStorage.setItem(VIDEO_CACHE_KEY, 'true');
      await AsyncStorage.setItem(VIDEO_CACHE_VERSION_KEY, CURRENT_VIDEO_VERSION);
      
      this.videoUri = result.uri;
      return result.uri;
    } catch (error) {
      console.error('[VideoCache] Error downloading video:', error);
      
      // Clean up on error
      await AsyncStorage.removeItem(VIDEO_CACHE_KEY);
      await AsyncStorage.removeItem(VIDEO_CACHE_VERSION_KEY);
      
      throw error;
    }
  }

  /**
   * Get the cached video URI (download if not cached)
   */
  static async getCachedVideoUri(
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // If already loaded in memory, return it
    if (this.videoUri) {
      const fileInfo = await FileSystem.getInfoAsync(this.videoUri);
      if (fileInfo.exists) {
        return this.videoUri;
      }
    }

    const localPath = this.getLocalVideoPath();
    
    // Check if cached
    const cached = await this.isCached();
    if (cached) {
      this.videoUri = localPath;
      return localPath;
    }

    // Download if not cached
    return this.downloadAndCache(onProgress);
  }

  /**
   * Clear the video cache
   */
  static async clearCache(): Promise<void> {
    try {
      const localPath = this.getLocalVideoPath();
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      }
      
      await AsyncStorage.removeItem(VIDEO_CACHE_KEY);
      await AsyncStorage.removeItem(VIDEO_CACHE_VERSION_KEY);
      this.videoUri = null;
      
      console.log('[VideoCache] Cache cleared successfully');
    } catch (error) {
      console.error('[VideoCache] Error clearing cache:', error);
      throw error;
    }
  }

  /**
   * Get cache size in MB
   */
  static async getCacheSize(): Promise<number> {
    try {
      const localPath = this.getLocalVideoPath();
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      
      if (fileInfo.exists && 'size' in fileInfo) {
        return fileInfo.size / (1024 * 1024); // Convert to MB
      }
      
      return 0;
    } catch (error) {
      console.error('[VideoCache] Error getting cache size:', error);
      return 0;
    }
  }

  /**
   * Preload video on app startup (call this in your app initialization)
   */
  static async preloadVideo(onProgress?: (progress: number) => void): Promise<void> {
    try {
      console.log('[VideoCache] Preloading video...');
      await this.getCachedVideoUri(onProgress);
      console.log('[VideoCache] Video preloaded successfully');
    } catch (error) {
      console.error('[VideoCache] Error preloading video:', error);
      // Don't throw - allow app to continue even if video preload fails
    }
  }
}

export default VideoCacheService;

