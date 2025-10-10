/**
 * Supabase Storage Service for Admin Portal
 * Handles file uploads to Supabase storage buckets with structured folder hierarchy
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
  private static SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  private static SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  /**
   * Check if Supabase is configured
   */
  static isConfigured(): boolean {
    return !!(this.SUPABASE_URL && this.SUPABASE_ANON_KEY);
  }

  /**
   * Get the public URL for a file in Supabase storage
   */
  static getPublicUrl(bucket: StorageBucket, filePath: string): string {
    return `${this.SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
  }

  /**
   * Upload a file to Supabase storage
   */
  private static async uploadFile(
    bucket: StorageBucket,
    filePath: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    try {
      console.log(`[SupabaseStorage] Uploading to ${bucket}/${filePath}`);

      // Create form data
      const formData = new FormData();
      formData.append('file', file, filePath.split('/').pop());

      // Upload to Supabase
      const uploadUrl = `${this.SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
          'apikey': this.SUPABASE_ANON_KEY,
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
   * Upload a course cover image
   */
  static async uploadCourseCover(
    courseId: number,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `course_${courseId}/course_cover.${extension}`;

    return this.uploadFile('courses', filePath, file, onProgress);
  }

  /**
   * Upload a chapter banner image
   */
  static async uploadChapterBanner(
    courseId: number,
    chapterId: number,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `course_${courseId}/chapters/chapter_${chapterId}/chapter_banner.${extension}`;

    return this.uploadFile('courses', filePath, file, onProgress);
  }

  /**
   * Upload a lesson/module thumbnail image
   */
  static async uploadLessonThumbnail(
    courseId: number,
    chapterId: number,
    lessonId: number,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `course_${courseId}/chapters/chapter_${chapterId}/lessons/lesson_${lessonId}/lesson_thumbnail.${extension}`;

    return this.uploadFile('courses', filePath, file, onProgress);
  }

  /**
   * Upload a user avatar image
   */
  static async uploadAvatar(
    userId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `user_${userId}/avatar_${Date.now()}.${extension}`;

    return this.uploadFile('avatars', filePath, file, onProgress);
  }

  /**
   * Delete a file from Supabase storage
   */
  static async deleteFile(bucket: StorageBucket, filePath: string): Promise<void> {
    try {
      console.log(`[SupabaseStorage] Deleting ${bucket}/${filePath}`);

      const deleteUrl = `${this.SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
          'apikey': this.SUPABASE_ANON_KEY,
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
   * Extract file path from Supabase public URL
   */
  static extractFilePathFromUrl(publicUrl: string, bucket: StorageBucket): string | null {
    try {
      const url = new URL(publicUrl);
      const pathMatch = url.pathname.match(`/storage/v1/object/public/${bucket}/(.+)`);
      return pathMatch ? pathMatch[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Validate image before upload
   */
  static validateImage(file: File): { valid: boolean; error?: string } {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    if (!extension || !validExtensions.includes(extension)) {
      return {
        valid: false,
        error: 'Invalid image format. Supported formats: JPG, PNG, GIF, WEBP',
      };
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size must be less than 5MB',
      };
    }

    return { valid: true };
  }
}

export default SupabaseStorageService;



