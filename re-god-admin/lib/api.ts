const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';
const UPLOAD_BASE_URL = process.env.NEXT_PUBLIC_UPLOAD_BASE_URL || 'http://localhost:4000';

// Import auth utils for getting fresh tokens
import { getFreshToken } from './auth-utils';

interface LoginRequest {
  identifier: string;
  password: string;
}

interface LoginResponse {
  user_id: string;
  auth_token: string;
  refresh_token: string;
  user_data?: any;
}

interface TeacherInviteRequest {
  name: string;
  email: string;
  max_uses?: number;
  expires_in_days?: number;
  redirect_url?: string;
}

interface TeacherInviteResponse {
  teacher_user_id: string;
  teacher_email: string;
  teacher_name: string;
  teacher_code: string;
  invitation_link: string;
}

interface MyCodeResponse {
  teacher_user_id: string;
  teacher_code: string;
  is_active: boolean;
  use_count: number;
  max_uses: number;
  expires_at?: string | null;
}

interface AdminStats {
  total_users: number;
  total_teachers: number;
  total_students: number;
  total_courses: number;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
  is_active: boolean;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  is_active: boolean;
  enrolled_courses: number;
}

interface StudentAnalytics {
  student: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
    created_at: string;
  };
  stats: {
    time_spent_hours: number;
    avg_time_per_day_hours: number;
    finished_courses: number;
    total_courses: number;
    course_progress_percentage: number;
    completed_lessons: number;
    total_lessons: number;
    lesson_progress_percentage: number;
    completed_quizzes: number;
    quiz_progress_percentage: number;
  };
  time_series: Array<{
    date: string;
    hours: number;
  }>;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  age?: number;
  avatar_url?: string;
  church_admin_name?: string;
  home_church?: string;
  country?: string;
  city?: string;
  postal_code?: string;
  church_admin_cell_phone?: string;
  is_verified: boolean;
  onboarding_completed: boolean;
  created_at: string;
  last_login?: string;
  roles: string[];
}

interface UserProfileUpdate {
  name?: string;
  email?: string;
  phone?: string;
  age?: number;
  avatar_url?: string;
  church_admin_name?: string;
  home_church?: string;
  country?: string;
  city?: string;
  postal_code?: string;
  church_admin_cell_phone?: string;
}

interface AdminCourse {
  id: number;
  title: string;
  description?: string;
  thumbnail_url?: string;
  category?: string;
  difficulty?: string;
  total_modules: number;
  created_by: string;
  created_at: string;
}

interface AdminModule {
  id: number;
  course_id: number;
  title: string;
  description?: string;
  order: number;
  content?: string;
  key_verses?: string;
  lesson_study?: string;
  response_prompt?: string;
  music_selection?: string;
  further_study?: string;
  personal_experiences?: string;
  resources?: string;
  artwork?: string;
  header_image_url?: string;
  video_url?: string;
  audio_url?: string;
}

interface AdminChapter {
  id: number;
  course_id: number;
  title: string;
  cover_image_url?: string;
  order: number;
}

class AdminApiService {
  private static getAuthHeaders(): Record<string, string> {
    // Check for backend JWT token first (preferred for API calls)
    let backendToken = null;
    let clerkToken = null;
    
    if (typeof window !== 'undefined') {
      backendToken = localStorage.getItem('admin_access_token');
      clerkToken = localStorage.getItem('clerk_session_token');
    }
    
    // Prefer backend token over Clerk token for API calls
    const token = backendToken || clerkToken;
    
    return {
      'Content-Type': 'application/json',
      'cloudflare-skip-browser-warning': 'true',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }


  private static async handleResponse(response: Response) {
    const data = await response.json();
    
    if (!response.ok) {
      const errorMessage = data.error?.message || data.detail || data.message || 'Request failed';
      // Create a structured error object that matches what the frontend expects
      const error = new Error(errorMessage);
      (error as any).detail = data.detail;
      (error as any).message = errorMessage;
      (error as any).error = data.error;
      throw error;
    }
    
    return data;
  }

  private static async makeAuthenticatedRequest<T>(
    url: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    // Check if token is stale and refresh if needed
    if (typeof window !== 'undefined') {
      const tokenTimestamp = localStorage.getItem('clerk_token_timestamp');
      const now = Date.now();
      const tokenAge = tokenTimestamp ? now - parseInt(tokenTimestamp) : Infinity;
      
      // Refresh token if it's older than 5 minutes (300000 ms)
      if (tokenAge > 300000 || !localStorage.getItem('clerk_session_token')) {
        console.log('🔄 Token is stale or missing, refreshing...');
        try {
          const freshToken = await getFreshToken();
          if (freshToken) {
            console.log('✅ Token refreshed successfully');
          }
        } catch (error) {
          console.log('⚠️ Failed to refresh token:', error);
        }
      }
    }
    
    // Get the best available token
    const headers = this.getAuthHeaders();
    
    // Log token information for debugging
    const authHeader = headers.Authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      console.log('🔍 API Request Debug:', {
        url,
        hasToken: !!token,
        tokenLength: token?.length || 0,
        tokenPreview: token ? `${token.substring(0, 20)}...` : 'none'
      });
    } else {
      console.log('🔍 API Request Debug (No Token):', {
        url,
        hasToken: false
      });
    }
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        console.log('❌ Authentication error detected');
        
        // Try to refresh token once before giving up
        if (retryCount === 0) {
          console.log('🔄 Attempting to refresh token and retry...');
          try {
            const freshToken = await getFreshToken();
            if (freshToken) {
              console.log('✅ Token refreshed, retrying request...');
              return this.makeAuthenticatedRequest<T>(url, options, retryCount + 1);
            }
          } catch (error) {
            console.log('⚠️ Token refresh failed:', error);
          }
        }
        
        console.log('❌ Authentication failed, clearing tokens and redirecting to sign-in');
        
        // Clear all tokens
        if (typeof window !== 'undefined') {
          localStorage.removeItem('clerk_session_token');
          localStorage.removeItem('clerk_token_timestamp');
          localStorage.removeItem('admin_access_token');
          localStorage.removeItem('admin_refresh_token');
          localStorage.removeItem('isAuthenticated');
        }
        
        // Redirect to sign-in
        if (typeof window !== 'undefined') {
          window.location.href = '/sign-in';
        }
        
        throw new Error('Session expired. Please login again.');
      }

      // Handle other errors
      const errorMessage = data.error?.message || data.detail || data.message || `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return data;
  }

  // Authentication
  static async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'cloudflare-skip-browser-warning': 'true'
      },
      body: JSON.stringify(credentials),
    });

    const data = await this.handleResponse(response);
    
    // Store tokens
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_access_token', data.auth_token);
      localStorage.setItem('admin_refresh_token', data.refresh_token);
      localStorage.setItem('admin_user_id', data.user_id);
      localStorage.setItem('isAuthenticated', 'true');
    }
    
    return data;
  }

  static async logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('admin_user_id');
      localStorage.removeItem('isAuthenticated');
    }
  }

  static async refreshToken(): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error('No refresh token available');
    }
    
    const refreshToken = localStorage.getItem('admin_refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await this.handleResponse(response);
    
    // Update stored tokens
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_access_token', data.auth_token);
      localStorage.setItem('admin_refresh_token', data.refresh_token);
    }
    
    return data.auth_token;
  }

  // Admin endpoints
  static async getAdminStats(): Promise<AdminStats> {
    return this.makeAuthenticatedRequest<AdminStats>(`${API_BASE_URL}/admin/stats`, {
      method: 'GET',
    });
  }

  static async getTeacherStats(): Promise<{my_courses: number, assigned_students: number}> {
    return this.makeAuthenticatedRequest<{my_courses: number, assigned_students: number}>(`${API_BASE_URL}/admin/teacher-stats`, {
      method: 'GET',
    });
  }

  static async getMyStudents(): Promise<Array<{id: string, name: string, email: string, assigned_at: string}>> {
    return this.makeAuthenticatedRequest<Array<{id: string, name: string, email: string, assigned_at: string}>>(`${API_BASE_URL}/admin/my-students`, {
      method: 'GET',
    });
  }

  static async getTeachersDirectory(): Promise<Teacher[]> {
    const response = await fetch(`${API_BASE_URL}/admin/teachers`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    
    return this.handleResponse(response);
  }

  static async inviteTeacher(inviteData: TeacherInviteRequest): Promise<TeacherInviteResponse> {
    const response = await fetch(`${API_BASE_URL}/admin/teachers/invite`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(inviteData),
    });
    
    return this.handleResponse(response);
  }

  static async validateTeacherCode(teacherCode: string, clerkUserId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/teachers/validate-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cloudflare-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        teacher_code: teacherCode,
        clerk_user_id: clerkUserId
      }),
    });
    
    return this.handleResponse(response);
  }

  static async getMyTeacherCode(): Promise<MyCodeResponse> {
    const response = await fetch(`${API_BASE_URL}/admin/my-code`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  // Student endpoints
  static async getStudentsDirectory(): Promise<Student[]> {
    return this.makeAuthenticatedRequest<Student[]>(`${API_BASE_URL}/admin/students`, {
      method: 'GET',
    });
  }

  static async getStudentAnalytics(studentId: string): Promise<StudentAnalytics> {
    return this.makeAuthenticatedRequest<StudentAnalytics>(`${API_BASE_URL}/admin/students/${studentId}/analytics`, {
      method: 'GET',
    });
  }

  static async deleteStudent(studentId: string): Promise<{ message: string }> {
    return this.makeAuthenticatedRequest<{ message: string }>(`${API_BASE_URL}/admin/users/${studentId}`, {
      method: 'DELETE',
    });
  }

  // Profile endpoints
  static async getUserProfile(): Promise<UserProfile> {
    return this.makeAuthenticatedRequest<UserProfile>(`${API_BASE_URL}/user/profile`, {
      method: 'GET',
    });
  }

  static async updateUserProfile(profileData: UserProfileUpdate): Promise<UserProfile> {
    return this.makeAuthenticatedRequest<UserProfile>(`${API_BASE_URL}/user/profile`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  // Upload methods (multipart/form-data)
  static async uploadAvatar(file: File): Promise<{ success: boolean; message: string; avatar_url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    // Get auth headers without Content-Type (let browser set it for multipart/form-data)
    const headers = this.getAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(`${API_BASE_URL}/upload/avatar`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to upload avatar');
    }

    return response.json();
  }

  static async uploadCourseCover(file: File, courseId: number): Promise<{ success: boolean; message: string; cover_url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_id', courseId.toString());

    // Get auth headers without Content-Type (let browser set it for multipart/form-data)
    const headers = this.getAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(`${API_BASE_URL}/upload/course-cover`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to upload course cover');
    }

    return response.json();
  }

  static async uploadChapterThumbnail(file: File, courseId: number, chapterId: number): Promise<{ success: boolean; message: string; thumbnail_url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_id', courseId.toString());
    formData.append('chapter_id', chapterId.toString());

    // Get auth headers without Content-Type (let browser set it for multipart/form-data)
    const headers = this.getAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(`${API_BASE_URL}/upload/chapter-thumbnail`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to upload chapter thumbnail');
    }

    return response.json();
  }

  static async uploadLessonImage(file: File, courseId: number, chapterId: number, lessonId: number): Promise<{ success: boolean; message: string; image_url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_id', courseId.toString());
    formData.append('chapter_id', chapterId.toString());
    formData.append('lesson_id', lessonId.toString());

    // Get auth headers without Content-Type (let browser set it for multipart/form-data)
    const headers = this.getAuthHeaders();
    delete headers['Content-Type'];

    const response = await fetch(`${API_BASE_URL}/upload/lesson-image`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to upload lesson image');
    }

    return response.json();
  }

  // Uploads
  static async presignS3Upload(filename: string, contentType: string) {
    const response = await fetch(`${API_BASE_URL}/uploads/s3/presign`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ filename, content_type: contentType }),
    });
    return this.handleResponse(response);
  }

  static async uploadLocal(file: File) {
    const form = new FormData();
    form.append('file', file);
    const headers = this.getAuthHeaders();
    delete headers['Content-Type']; // Let browser set multipart boundary
    const response = await fetch(`${API_BASE_URL}/uploads/local`, {
      method: 'POST',
      headers,
      body: form,
    });
    return this.handleResponse(response);
  }

  // Helper function to get full upload URL (supports both Supabase and local URLs)
  static getUploadUrl(path: string): string {
    if (!path) return '';
    // If path already includes the full URL, return as is (Supabase URLs)
    if (path.startsWith('http')) return path;
    // If path starts with /uploads, prepend the upload base URL (local uploads)
    if (path.startsWith('/uploads')) return `${UPLOAD_BASE_URL}${path}`;
    // Otherwise, assume it's a relative path and prepend /uploads
    return `${UPLOAD_BASE_URL}/uploads/${path}`;
  }




  /**
   * Generic hybrid upload method
   * Tries Supabase first, falls back to local backend
   * Use this for general uploads when you don't need structured paths
   */
  static async uploadFile(file: File): Promise<{ path: string; url: string }> {
    // For now, just use local upload for generic files
    // You can extend this to use Supabase buckets as needed
    const uploadResult = await this.uploadLocal(file);
    return { path: uploadResult.path, url: this.getUploadUrl(uploadResult.path) };
  }

  // Courses (admin/teacher)
  static async getCourses(): Promise<AdminCourse[]> {
    return this.makeAuthenticatedRequest<AdminCourse[]>(`${API_BASE_URL}/courses`, {
      method: 'GET',
    });
  }

  static async createCourse(payload: Partial<AdminCourse>): Promise<AdminCourse> {
    const response = await fetch(`${API_BASE_URL}/courses`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(response);
  }

  static async createModule(courseId: number, payload: Partial<AdminModule>): Promise<AdminModule> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/modules`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(response);
  }

  static async getChapters(courseId: number): Promise<AdminChapter[]> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/chapters`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  static async createChapter(courseId: number, payload: Partial<AdminChapter>): Promise<AdminChapter> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/chapters`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(response);
  }

  static async getModules(courseId: number): Promise<AdminModule[]> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/modules`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  static async updateCourse(courseId: number, payload: Partial<AdminCourse>): Promise<AdminCourse> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(response);
  }

  static async updateChapter(courseId: number, chapterId: number, payload: Partial<AdminChapter> & { quiz?: any }): Promise<AdminChapter> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/chapters/${chapterId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(response);
  }

  static async updateModule(courseId: number, moduleId: number, payload: Partial<AdminModule>): Promise<AdminModule> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/modules/${moduleId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(response);
  }

  static async deleteModule(courseId: number, moduleId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/modules/${moduleId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  static async getModuleQuizResponses(courseId: number, moduleId: number): Promise<{ has_responses: boolean; response_count: number }> {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/modules/${moduleId}/quiz-responses`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  // Utility
  static isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    
    const clerkToken = localStorage.getItem('clerk_session_token');
    const adminToken = localStorage.getItem('admin_access_token');
    const isAuth = localStorage.getItem('isAuthenticated');
    return !!((clerkToken || adminToken) && isAuth);
  }

  static setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_access_token', token);
      localStorage.setItem('isAuthenticated', 'true');
    }
  }

  static async getCurrentUser() {
    try {
      // Try to get user from backend first
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (response.ok) {
        const userData = await response.json();
        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.roles[0] || 'student',
          verified: userData.is_verified,
          clerk_user_id: userData.id, // Backend user ID
          avatar_url: userData.avatar_url,
          roles: userData.roles || ['student'],
          permissions: userData.permissions || [] // Use actual permissions from backend
        };
      }
    } catch (error) {
      console.error('Failed to get user from backend:', error);
    }

    // Fallback to localStorage data
    if (typeof window === 'undefined') return null;
    
    const userId = localStorage.getItem('admin_user_id');
    if (!userId) return null;
    
    // Return comprehensive user info matching the User interface
    return {
      id: userId,
      email: localStorage.getItem('admin_user_email') || 'admin@church.com',
      name: localStorage.getItem('admin_user_name') || 'Admin User',
      role: 'teacher',
      verified: true,
      clerk_user_id: userId,
      avatar_url: localStorage.getItem('admin_user_avatar') || undefined,
      roles: ['teacher'],
      permissions: ['admin:all']
    };
  }
}

export default AdminApiService;
export type { LoginRequest, LoginResponse, TeacherInviteRequest, TeacherInviteResponse, AdminStats, Teacher, Student, StudentAnalytics, UserProfile, UserProfileUpdate, MyCodeResponse };
