import { CONFIG } from '../config/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase Storage Service
 * Handles all file uploads to Supabase storage buckets with structured folder hierarchy
 */

export type StorageBucket = 'videos' | 'courses' | 'avatars';

export interface UploadResult {
  path: string;
  publicUrl: string;
  bucket: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export class SupabaseStorageService {
  /**
   * Get the public URL for a file in Supabase storage
   */
  static getPublicUrl(bucket: StorageBucket, filePath: string): string {
    return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
  }

  /**
   * Upload a file to Supabase storage
   */
  private static async uploadFile(
    bucket: StorageBucket,
    filePath: string,
    fileUri: string,
    contentType: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    try {
      console.log(`[SupabaseStorage] Uploading to ${bucket}/${filePath}`);

      // Read the file as blob
      const response = await fetch(fileUri);
      const blob = await response.blob();

      // Create form data
      const formData = new FormData();
      formData.append('file', blob as any, filePath.split('/').pop());

      // Get auth token
      const token = await AsyncStorage.getItem('regod_access_token');
      
      // Upload to Supabase
      const uploadUrl = `${CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          ...(token && { 'apikey': CONFIG.SUPABASE_ANON_KEY }),
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Upload failed with status ${uploadResponse.status}`
        );
      }

      const publicUrl = this.getPublicUrl(bucket, filePath);

      console.log(`[SupabaseStorage] Upload successful: ${publicUrl}`);

      return {
        path: filePath,
        publicUrl,
        bucket,
      };
    } catch (error) {
      console.error('[SupabaseStorage] Upload error:', error);
      throw error;
    }
  }

  /**
   * Upload a user avatar to the avatars bucket
   */
  static async uploadAvatar(
    userId: string,
    imageUri: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const timestamp = Date.now();
    const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${userId}_${timestamp}.${extension}`;

    return this.uploadFile(
      'avatars',
      filePath,
      imageUri,
      `image/${extension}`,
      onProgress
    );
  }

  /**
   * Upload a course cover image
   */
  static async uploadCourseCover(
    courseId: number,
    imageUri: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `course_${courseId}/course_cover.${extension}`;

    return this.uploadFile(
      'courses',
      filePath,
      imageUri,
      `image/${extension}`,
      onProgress
    );
  }

  /**
   * Upload a chapter banner image
   */
  static async uploadChapterBanner(
    courseId: number,
    chapterId: number,
    imageUri: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `course_${courseId}/chapters/chapter_${chapterId}/chapter_banner.${extension}`;

    return this.uploadFile(
      'courses',
      filePath,
      imageUri,
      `image/${extension}`,
      onProgress
    );
  }

  /**
   * Upload a lesson/module thumbnail image
   */
  static async uploadLessonThumbnail(
    courseId: number,
    chapterId: number,
    lessonId: number,
    imageUri: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `course_${courseId}/chapters/chapter_${chapterId}/lessons/lesson_${lessonId}/lesson_thumbnail.${extension}`;

    return this.uploadFile(
      'courses',
      filePath,
      imageUri,
      `image/${extension}`,
      onProgress
    );
  }

  /**
   * Delete a file from Supabase storage
   */
  static async deleteFile(bucket: StorageBucket, filePath: string): Promise<void> {
    try {
      console.log(`[SupabaseStorage] Deleting ${bucket}/${filePath}`);

      const deleteUrl = `${CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY,
        },
      });

      if (!response.ok && response.status !== 404) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Delete failed with status ${response.status}`
        );
      }

      console.log(`[SupabaseStorage] Delete successful`);
    } catch (error) {
      console.error('[SupabaseStorage] Delete error:', error);
      throw error;
    }
  }

  /**
   * List files in a folder
   */
  static async listFiles(
    bucket: StorageBucket,
    folderPath: string = ''
  ): Promise<string[]> {
    try {
      console.log(`[SupabaseStorage] Listing files in ${bucket}/${folderPath}`);

      const listUrl = `${CONFIG.SUPABASE_URL}/storage/v1/object/list/${bucket}`;
      
      const response = await fetch(listUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix: folderPath,
          limit: 100,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `List failed with status ${response.status}`
        );
      }

      const files = await response.json();
      return files.map((file: any) => file.name);
    } catch (error) {
      console.error('[SupabaseStorage] List error:', error);
      throw error;
    }
  }

  /**
   * Check if Supabase is configured
   */
  static isConfigured(): boolean {
    return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  }

  /**
   * Validate image before upload
   */
  static validateImage(imageUri: string): { valid: boolean; error?: string } {
    const extension = imageUri.split('.').pop()?.toLowerCase();
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    if (!extension || !validExtensions.includes(extension)) {
      return {
        valid: false,
        error: 'Invalid image format. Supported formats: JPG, PNG, GIF, WEBP',
      };
    }

    return { valid: true };
  }
}

export default SupabaseStorageService;



