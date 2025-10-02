const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://saint-bennett-attachment-quizzes.trycloudflare.com/api';

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
    const token = localStorage.getItem('admin_access_token');
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
      throw new Error(errorMessage);
    }
    
    return data;
  }

  private static async makeAuthenticatedRequest<T>(
    url: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const headers = this.getAuthHeaders();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle authentication errors with token refresh
      if ((response.status === 401 || response.status === 403) && retryCount === 0) {
        console.log('Admin token expired, attempting refresh...');
        try {
          await this.refreshToken();
          console.log('Admin token refreshed, retrying request...');
          return this.makeAuthenticatedRequest<T>(url, options, 1);
        } catch (refreshError) {
          console.error('Admin token refresh failed:', refreshError);
          // Clear tokens and redirect to login
          this.logout();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          throw new Error('Session expired. Please login again.');
        }
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
    localStorage.setItem('admin_access_token', data.auth_token);
    localStorage.setItem('admin_refresh_token', data.refresh_token);
    localStorage.setItem('admin_user_id', data.user_id);
    localStorage.setItem('isAuthenticated', 'true');
    
    return data;
  }

  static async logout() {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user_id');
    localStorage.removeItem('isAuthenticated');
  }

  static async refreshToken(): Promise<string> {
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
    localStorage.setItem('admin_access_token', data.auth_token);
    localStorage.setItem('admin_refresh_token', data.refresh_token);
    
    return data.auth_token;
  }

  // Admin endpoints
  static async getAdminStats(): Promise<AdminStats> {
    return this.makeAuthenticatedRequest<AdminStats>(`${API_BASE_URL}/admin/stats`, {
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

  static async getMyTeacherCode(): Promise<MyCodeResponse> {
    const response = await fetch(`${API_BASE_URL}/admin/my-code`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(response);
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

  // Utility
  static isAuthenticated(): boolean {
    const token = localStorage.getItem('admin_access_token');
    const isAuth = localStorage.getItem('isAuthenticated');
    return !!(token && isAuth);
  }

  static async getCurrentUser() {
    const userId = localStorage.getItem('admin_user_id');
    if (!userId) return null;
    
    // For now, return basic user info from stored data
    return {
      id: userId,
      email: localStorage.getItem('admin_user_email') || 'admin@church.com',
      role: 'admin'
    };
  }
}

export default AdminApiService;
export type { LoginRequest, LoginResponse, TeacherInviteRequest, TeacherInviteResponse, AdminStats, Teacher, MyCodeResponse };
