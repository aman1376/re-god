import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config/constants';
import { Platform } from 'react-native';
import { clampRGBA } from 'react-native-reanimated/lib/typescript/Colors';

// Dynamic API base URL with auto-switch (Cloudflare tunnel/local)
class ApiBaseUrlResolver {
  private static baseUrl: string | null = null;
  private static readonly storageKey = 'regod_api_base_url';

  private static normalizeRoot(root: string): string {
    return root.trim().replace(/\/$/, '');
  }

  private static async probeRoot(root: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${this.normalizeRoot(root)}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  static async ensure(): Promise<string> {
    if (this.baseUrl) return this.baseUrl;

    // 1) Use cached value if it still responds
    try {
      const cached = await AsyncStorage.getItem(this.storageKey);
      if (cached && (await this.probeRoot(cached.replace(/\/api$/, '')))) {
        this.baseUrl = this.normalizeRoot(cached);
        return this.baseUrl;
      }
    } catch {}

    // 2) Use CONFIG.API_BASE_URL if reachable
    if (CONFIG.API_BASE_URL) {
      const root = CONFIG.API_BASE_URL.trim().replace(/\/api$/, '');
      if (await this.probeRoot(root)) {
        this.baseUrl = this.normalizeRoot(CONFIG.API_BASE_URL);
        await AsyncStorage.setItem(this.storageKey, this.baseUrl);
        return this.baseUrl;
      }
    }

    // 3) Try common local roots in order
    const candidates: string[] = [];
    // Android emulator host
    candidates.push('http://10.0.2.2:4000');
    // iOS simulator / web
    candidates.push('http://localhost:4000');
    candidates.push('http://127.0.0.1:4000');

    for (const root of candidates) {
      if (await this.probeRoot(root)) {
        this.baseUrl = `${this.normalizeRoot(root)}/api`;
        await AsyncStorage.setItem(this.storageKey, this.baseUrl);
        return this.baseUrl;
      }
    }

    // 4) Fallback to provided CONFIG even if not reachable
    this.baseUrl = this.normalizeRoot(CONFIG.API_BASE_URL || 'http://10.0.2.2:4000/api');
    return this.baseUrl;
  }
}

// Types and Interfaces
interface RegisterData {
  email: string;
  password: string;
  name: string;
  teacher_code?: string; 
}

interface LoginData {
  identifier: string;
  password: string;
}

export interface AuthResponse {
  user_id: string;
  auth_token: string | null;
  refresh_token: string | null;
  user_data?: any;
  requires_verification?: boolean;
  requires_teacher_code?: boolean;
  message?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  verified: boolean;
  phone?: string;
  avatar_url?: string;
  requiresTeacherCode?: boolean;
}

interface Course {
  id: number;
  title: string;
  description: string;
  thumbnail_url?: string;
  category: string;
  difficulty: string;
  is_active: boolean;
  created_by: string;
}

interface Chapter {
  id: number;
  course_id: number;
  title: string;
  cover_image_url?: string;
  order: number;
  is_active: boolean;
  quiz?: any;
}

interface Module {
  id: number;
  course_id: number;
  chapter_id?: number;
  title: string;
  description?: string;
  content?: string;
  key_verses?: string;
  key_verses_ref?: string;
  key_verses_json?: any;
  lesson_study?: string;
  lesson_study_ref?: string;
  response_prompt?: string;
  music_selection?: string;
  further_study?: string;
  further_study_json?: any;
  personal_experiences?: string;
  resources?: string;
  resources_json?: any;
  artwork?: string;
  header_image_url?: string;
  media_url?: string;
  quiz?: any;
  order: number;
  is_active: boolean;
}

interface Note {
  id: number;
  user_id: string;
  title?: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface DashboardResponse {
  user: User;
  last_visited_course?: {
    course_id: number;
    course_title: string;
    thumbnail_url?: string;
    last_visited_module_id?: number;
    last_visited_module_title?: string;
    overall_progress_percentage: number;
    continue_url: string;
  };
  available_courses: Array<{
    course_id: number;
    course_title: string;
    description: string;
    thumbnail_url?: string;
    category: string;
    difficulty: string;
    progress_percentage: number;
    is_new: boolean;
    is_continue_available: boolean;
  }>;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  course_id?: number;
  module_id?: number;
}

interface ChatResponse {
  message: string;
  suggestions?: string[];
}

class ApiService {
  private static clerkExchangeInProgress: boolean = false;
  
  static async base(): Promise<string> {
    const baseUrl = await ApiBaseUrlResolver.ensure();
    console.log('[API] Using base URL:', baseUrl);
    return baseUrl;
  }

  // Method to clear cached URL and force re-detection
  static async clearCache(): Promise<void> {
    await AsyncStorage.removeItem('regod_api_base_url');
    ApiBaseUrlResolver['baseUrl'] = null;
    console.log('[API] Cache cleared, will re-detect URL on next request');
  }
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    // Try access token first, fallback to Clerk session token
    let token = await AsyncStorage.getItem('regod_access_token');
    
    if (!token) {
      token = await AsyncStorage.getItem('clerk_session_token');
    }

    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }




  // Wrapper function to make authenticated requests with automatic token refresh
  static async makeAuthenticatedRequest<T>(
    url: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${await this.base()}${url}`, {
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
          console.log('Token expired, attempting refresh...');
          try {
            const refreshed = await this.refreshTokenIfNeeded();
            if (refreshed) {
              console.log('Token refreshed, retrying request...');
              return this.makeAuthenticatedRequest<T>(url, options, 1);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
          }
          
          // If refresh failed, try to re-authenticate with Clerk
          try {
            console.log('Attempting to re-authenticate with Clerk...');
            // Get user email from stored data for re-authentication
            const storedUserData = await AsyncStorage.getItem('regod_user_data');
            if (storedUserData) {
              const userData = JSON.parse(storedUserData);
              const clerkRefreshed = await this.clerkExchange(userData.email || '');
              if (clerkRefreshed) {
                console.log('Clerk re-authentication successful, retrying request...');
                return this.makeAuthenticatedRequest<T>(url, options, 1);
              }
            }
          } catch (clerkError) {
            console.error('Clerk re-authentication failed:', clerkError);
          }
          
          // Only clear tokens if absolutely necessary, otherwise keep session alive
          const tokensCleared = await this.clearTokensIfNecessary();
          if (tokensCleared) {
            console.log('All authentication tokens cleared, user will need to re-login');
          } else {
            console.log('Authentication failed but keeping session alive for retry');
          }
          
          // Return empty data instead of throwing error to prevent app crashes
          if (url.includes('/user/notes')) {
            return [] as T; // Return empty array for notes
          }
          return null as T; // Return null for other requests
        }

        // Handle other errors
        console.error('API Error Response:', {
          status: response.status,
          data: data,
          url: response.url
        });
        // Handle validation errors with more detail
        if (response.status === 422 && data.detail) {
          const validationErrors = Array.isArray(data.detail) 
            ? data.detail.map((err: any) => `${err.loc?.join('.')}: ${err.msg}`).join(', ')
            : data.detail;
          throw new Error(`Validation Error: ${validationErrors}`);
        }
        
        const errorMessage = data.error?.message || data.detail || data.message || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      // If it's an authentication error and we haven't retried yet, try to recover
      if (retryCount === 0 && (error instanceof Error && error.message.includes('Token verification failed'))) {
        console.log('Token verification failed, attempting recovery...');
        try {
          const refreshed = await this.refreshTokenIfNeeded();
          if (refreshed) {
            console.log('Token refreshed after error, retrying request...');
            return this.makeAuthenticatedRequest<T>(url, options, 1);
          }
        } catch (refreshError) {
          console.error('Token refresh failed after error:', refreshError);
        }
        
        // Try Clerk re-authentication
        try {
          console.log('Attempting Clerk re-authentication after error...');
          const storedUserData = await AsyncStorage.getItem('regod_user_data');
          if (storedUserData) {
            const userData = JSON.parse(storedUserData);
            const clerkRefreshed = await this.clerkExchange(userData.email || '');
            if (clerkRefreshed) {
              console.log('Clerk re-authentication successful after error, retrying request...');
              return this.makeAuthenticatedRequest<T>(url, options, 1);
            }
          }
        } catch (clerkError) {
          console.error('Clerk re-authentication failed after error:', clerkError);
        }
        
        // If all recovery attempts failed, only clear tokens if absolutely necessary
        const tokensCleared = await this.clearTokensIfNecessary();
        if (tokensCleared) {
          console.log('All recovery attempts failed and tokens cleared, user will need to re-login');
        } else {
          console.log('All recovery attempts failed but keeping session alive for retry');
        }
        
        if (url.includes('/user/notes')) {
          return [] as T;
        }
        return null as T;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  private static async handleResponse(response: Response) {
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || `Request failed with status ${response.status}`;

      console.error('API Error:', {
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      throw new Error(errorMessage);
    }

    return data;
  }

  // Authentication endpoints
  static async checkUser(identifier: string) {
    const response = await fetch(`${await this.base()}/auth/check-user`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({ identifier }),
    });
    
    return this.handleResponse(response);
  }

  static async register(userData: RegisterData): Promise<AuthResponse> {
  const response = await fetch(`${await this.base()}/auth/register`, {
    method: 'POST',
    headers: await this.getAuthHeaders(),
    body: JSON.stringify(userData),
  });
  
  const data = await this.handleResponse(response);
  
  // Store tokens
  await AsyncStorage.setItem('regod_access_token', data.auth_token);
  await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
  
  return data;
}

  static async login(loginData: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${await this.base()}/auth/login`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(loginData),
    });
    
    const data = await this.handleResponse(response);

    // Persist user for immediate UI usage if present
    if (data && data.id) {
      const normalizedUser: User = {
        id: String(data.id),
        email: data.email ?? '',
        name: data.name ?? '',
        role: Array.isArray(data.roles) && data.roles.length ? data.roles[0] : (data.role ?? 'student'),
        verified: data.is_verified ?? data.verified ?? false,
      };
      try { await AsyncStorage.setItem('regod_user_data', JSON.stringify(normalizedUser)); } catch {}
    }
    
    // Store tokens
    await AsyncStorage.setItem('regod_access_token', data.auth_token);
    await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
    
    return data;
  }

  // Clerk session exchange
  static async clerkExchange(identifier: string, retryCount = 0): Promise<AuthResponse> {
    console.log(`[ApiService] clerkExchange called for ${identifier} (attempt ${retryCount + 1})`);
    
    // Prevent multiple simultaneous clerkExchange calls - atomic check and set
    if (retryCount === 0) {
      if (this.clerkExchangeInProgress) {
        console.log('[ApiService] clerkExchange already in progress, waiting...');
        // Wait for the current exchange to complete
        while (this.clerkExchangeInProgress) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        // After waiting, check if we now have valid tokens
        const existingToken = await AsyncStorage.getItem('regod_access_token');
        if (existingToken) {
          console.log('[ApiService] Found existing token after waiting, skipping exchange');
          const userData = await AsyncStorage.getItem('regod_user_data');
          if (userData) {
            const parsedUserData = JSON.parse(userData);
            return {
              auth_token: existingToken,
              refresh_token: await AsyncStorage.getItem('regod_refresh_token') || '',
              user_data: parsedUserData,
              user_id: parsedUserData.id || ''
            };
          }
        }
      }
      
      // Set the lock atomically
      this.clerkExchangeInProgress = true;
      console.log('[ApiService] Lock acquired for clerkExchange');
    }
    
    try {
      // Get the Clerk token specifically for this exchange
      let clerkToken = await AsyncStorage.getItem('clerk_session_token');
      
      // Debug logging to help troubleshoot
      console.log(`[ApiService] Looking for Clerk token (attempt ${retryCount + 1}):`, {
        hasToken: !!clerkToken,
        tokenLength: clerkToken?.length || 0,
        identifier,
        retryCount
      });
    
    // If no token and we haven't retried, wait a bit and try again
    if (!clerkToken && retryCount < 3) {
      console.log(`No Clerk token found, retrying in 500ms... (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return this.clerkExchange(identifier, retryCount + 1);
    }
    
    if (!clerkToken) {
      console.error('[ApiService] No Clerk token available after all retries');
      throw new Error('No Clerk token available for exchange after retries');
    }

    console.log('Clerk token found, proceeding with exchange...');
    
    const response = await fetch(`${await this.base()}/auth/clerk-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clerkToken}`,
        'cloudflare-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ identifier }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 409 && errorData.message?.includes('Session already exists')) {
        console.log('Session already exists, checking for existing tokens...');
        // Check if we already have valid tokens
        const existingToken = await AsyncStorage.getItem('regod_access_token');
        const existingRefreshToken = await AsyncStorage.getItem('regod_refresh_token');
        const existingUserData = await AsyncStorage.getItem('regod_user_data');
        
        if (existingToken && existingRefreshToken && existingUserData) {
          console.log('Found existing valid tokens, returning them');
          const parsedUserData = JSON.parse(existingUserData);
          return {
            auth_token: existingToken,
            refresh_token: existingRefreshToken,
            user_data: parsedUserData,
            user_id: parsedUserData.id || ''
          };
        }
      }
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await this.handleResponse(response);
    
    // Only store tokens if they exist (not null/undefined)
    if (data.auth_token) {
      await AsyncStorage.setItem('regod_access_token', data.auth_token);
    }
    if (data.refresh_token) {
      await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
    }
    
    return data;
    } finally {
      // Always clear the lock when done
      if (retryCount === 0) {
        this.clerkExchangeInProgress = false;
        console.log('[ApiService] Lock released for clerkExchange');
      }
    }
  }

  static async verify(identifier: string, verificationCode: string) {
    const response = await fetch(`${await this.base()}/auth/verify`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({
        identifier,
        verification_code: verificationCode,
      }),
    });
    
    return this.handleResponse(response);
  }

  static async logout() {
    await AsyncStorage.removeItem('regod_access_token');
    await AsyncStorage.removeItem('regod_refresh_token');
  }

  // User endpoints
  static async getDashboard() {
    const raw = await this.makeAuthenticatedRequest<any>('/user/dashboard');
    // Normalize backend shapes (main.py vs ORM router)
    const normalizeCourse = (c: any) => ({
      course_id: c.course_id ?? c.id,
      course_title: c.course_title ?? c.title ?? 'Course',
      description: c.description ?? '',
      thumbnail_url: c.thumbnail_url ?? undefined,
      category: c.category ?? 'General',
      difficulty: c.difficulty ?? 'Beginner',
      progress_percentage: c.progress_percentage ?? 0,
      overall_progress_percentage: c.overall_progress_percentage ?? c.progress_percentage ?? 0,
      is_new: c.is_new ?? false,
      is_continue_available: c.is_continue_available ?? (c.progress_percentage ? c.progress_percentage > 0 : false),
    });
    const normalizedUser = (() => {
      const u = raw.user || {};
      return {
        id: u.id ?? '',
        email: u.email ?? '',
        name: u.name ?? '',
        role: Array.isArray(u.roles) && u.roles.length ? u.roles[0] : (u.role ?? 'student'),
        verified: u.is_verified ?? u.verified ?? false,
      } as User;
    })();
    const normalized = {
      user: normalizedUser,
      last_visited_course: raw.last_visited_course
        ? {
            course_id: raw.last_visited_course.course_id,
            course_title: raw.last_visited_course.course_title ?? raw.last_visited_course.title ?? 'Course',
            thumbnail_url: raw.last_visited_course.thumbnail_url,
            last_visited_module_id: raw.last_visited_course.last_visited_module_id,
            last_visited_module_title: raw.last_visited_course.last_visited_module_title,
            overall_progress_percentage:
              raw.last_visited_course.overall_progress_percentage ?? raw.last_visited_course.progress_percentage ?? 0,
            continue_url: raw.last_visited_course.continue_url ?? '',
          }
        : undefined,
      available_courses: Array.isArray(raw.available_courses) ? raw.available_courses.map(normalizeCourse) : [],
    };
    return normalized;
  }

  static async getProfile() {
    return this.makeAuthenticatedRequest<any>('/auth/me');
  }

  // Social auth
  static async socialAuth(provider: string, accessToken: string): Promise<AuthResponse> {
    const response = await fetch(`${await this.base()}/auth/social`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({
        provider,
        access_token: accessToken,
      }),
    });
    
    const data = await this.handleResponse(response);
    
    // Store tokens if provided
    if (data.auth_token) {
      await AsyncStorage.setItem('regod_access_token', data.auth_token);
      await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
    }
    
    return data;
  }

  // Course endpoints
  static async getCourses(): Promise<Course[]> {
    return this.makeAuthenticatedRequest<Course[]>('/courses');
  }

  static async getCourseModules(courseId: number): Promise<Module[]> {
    return this.makeAuthenticatedRequest<Module[]>(`/courses/${courseId}/modules`);
  }

  static async updateModule(courseId: number, moduleId: number, moduleData: Partial<Module>): Promise<Module> {
    return this.makeAuthenticatedRequest<Module>(`/courses/${courseId}/modules/${moduleId}`, {
      method: 'PUT',
      body: JSON.stringify(moduleData),
    });
  }

  static async deleteModule(courseId: number, moduleId: number): Promise<{ message: string }> {
    return this.makeAuthenticatedRequest<{ message: string }>(`/courses/${courseId}/modules/${moduleId}`, {
      method: 'DELETE',
    });
  }

  static async getCourseChapters(courseId: number): Promise<Chapter[]> {
    return this.makeAuthenticatedRequest<Chapter[]>(`/courses/${courseId}/chapters`);
  }

  static async getChapterProgress(courseId: number): Promise<{
    course_id: number;
    chapters: Array<{
      chapter_id: number;
      chapter_title: string;
      cover_image_url?: string;
      order: number;
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
      is_completed: boolean;
      next_module?: {
        id: number;
        title: string;
        description?: string;
        header_image_url?: string;
      };
    }>;
  }> {
    return this.makeAuthenticatedRequest(`/courses/${courseId}/chapter-progress`);
  }

  static async updateCourseProgress(courseId: number, progressPercentage: number | null, lastVisitedModuleId?: number, status: 'visited' | 'completed' = 'visited') {
    // Always try to update progress, even without module ID for overall progress
    const requestBody: any = {
      course_id: String(courseId),
      module_id: lastVisitedModuleId ? String(lastVisitedModuleId) : null,
      status,
    };
    
    // Only include progress_percentage if provided (let backend calculate if null)
    if (progressPercentage !== null) {
      requestBody.progress_percentage = progressPercentage;
    }
    
    return this.makeAuthenticatedRequest('/learn/progress', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  static async getModuleProgress(courseId: number): Promise<{ moduleId: number; completed: boolean }[]> {
    const response = await this.makeAuthenticatedRequest(`/courses/${courseId}/module-progress`) as { modules?: { moduleId: number; completed: boolean }[] };
    return response.modules || [];
  }

  static async getDetailedProgress(courseId: number): Promise<{
    course_id: number;
    course_progress: {
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
    };
    current_chapter: {
      chapter_id: number;
      chapter_title: string;
      cover_image_url: string;
      order: number;
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
      is_completed: boolean;
    } | null;
    next_chapter: {
      chapter_id: number;
      chapter_title: string;
      cover_image_url: string;
      order: number;
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
      is_completed: boolean;
    } | null;
    chapters: Array<{
      chapter_id: number;
      chapter_title: string;
      cover_image_url: string;
      order: number;
      total_modules: number;
      completed_modules: number;
      progress_percentage: number;
      is_completed: boolean;
    }>;
  }> {
    const response = await this.makeAuthenticatedRequest(`/courses/${courseId}/detailed-progress`) as {
      course_id: number;
      course_progress: {
        total_modules: number;
        completed_modules: number;
        progress_percentage: number;
      };
      current_chapter: {
        chapter_id: number;
        chapter_title: string;
        cover_image_url: string;
        order: number;
        total_modules: number;
        completed_modules: number;
        progress_percentage: number;
        is_completed: boolean;
      } | null;
      next_chapter: {
        chapter_id: number;
        chapter_title: string;
        cover_image_url: string;
        order: number;
        total_modules: number;
        completed_modules: number;
        progress_percentage: number;
        is_completed: boolean;
      } | null;
      chapters: Array<{
        chapter_id: number;
        chapter_title: string;
        cover_image_url: string;
        order: number;
        total_modules: number;
        completed_modules: number;
        progress_percentage: number;
        is_completed: boolean;
      }>;
    };
    return response;
  }

  // New endpoint for marking lessons as completed with responses
  static async completeLesson(courseId: number, moduleId: number, responses: any[]) {
    return this.makeAuthenticatedRequest('/learn/complete-lesson', {
      method: 'POST',
      body: JSON.stringify({
        course_id: String(courseId),
        module_id: String(moduleId),
        responses,
        completed_at: new Date().toISOString(),
      }),
    });
  }

  // Notes endpoints
  static async getNotes(): Promise<Note[]> {
    try {
      const data = await this.makeAuthenticatedRequest<any>('/user/notes');
      // Backend returns { notes: [{ note_content, course_title, created_at }] }
      const notes = (data || []) as any[];
      console.log('Notes fetched:', notes);
      return notes.map((n, idx) => ({
        id: n.id || Number(new Date(n.created_at).getTime() || idx),
        user_id: n.user_id || '',
        title: n.title,
        content: n.content,
        created_at: n.created_at,
        updated_at: n.updated_at || n.created_at,
      }));
      
    } catch (error) {
      console.error('Error fetching notes:', error);
      return []; // Return empty array on error
    }
  }

  static async createNote(title: string, content: string): Promise<Note> {
    try {
      const data = await this.makeAuthenticatedRequest<Note>('/user/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          content: content,
        }),
      });
      return data;
    } catch (error) {
      console.error('Error creating note:', error);
      // If backend not implemented, synthesize local note
      const now = new Date().toISOString();
      return {
        id: Number(new Date(now).getTime()),
        user_id: '',
        title: title,
        content: content,
        created_at: now,
        updated_at: now,
      };
    }
  }

  static async updateNote(noteId: number, title: string, content: string): Promise<Note> {
    try {
      const data = await this.makeAuthenticatedRequest<Note>(`/user/notes/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          content: content,
        }),
      });
      return data;
    } catch (error) {
      console.error('Error updating note:', error);
      const now = new Date().toISOString();
      return {
        id: noteId,
        user_id: '',
        title: title,
        content: content,
        created_at: now,
        updated_at: now,
      };
    }
  }

  static async deleteNote(noteId: number) {
    try {
      return await this.makeAuthenticatedRequest(`/user/notes/${noteId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error deleting note:', error);
      // Fallback: treat as deleted locally
      return { success: true };
    }
  }

  // Chat endpoints (match backend /api/connect/*)
  static async sendChatMessage(message: string, threadId?: string): Promise<void> {
    let thread_id: string;
    
    if (threadId) {
      // Use the provided thread ID
      thread_id = threadId;
      console.log('[API] sendChatMessage using provided thread_id:', thread_id);
    } else {
      // Fallback to getting thread from getOrCreateThread (for backward compatibility)
      const thread = await this.getOrCreateThread();
      thread_id = thread.thread_id;
      console.log('[API] sendChatMessage using fallback thread_id:', thread_id);
    }
    
    await this.makeAuthenticatedRequest<any>('/connect/thread/messages', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: thread_id,
        content: message,
      }),
    });
    // No return value needed - this just saves the message for the teacher
  }

  static async getChatHistory(threadId?: string): Promise<Message[]> {
    let thread_id: string;
    
    console.log('[API] getChatHistory called with threadId:', threadId);
    
    if (threadId) {
      // Use the provided thread ID
      thread_id = threadId;
      console.log('[API] Using provided thread_id:', thread_id);
    } else {
      // Fallback to getting thread from getOrCreateThread (for backward compatibility)
      const thread = await this.getOrCreateThread();
      thread_id = thread.thread_id;
      console.log('[API] Using fallback thread_id from getOrCreateThread:', thread_id);
    }
    
    const url = `/connect/thread/messages?thread_id=${encodeURIComponent(thread_id)}`;
    console.log('[API] Making request to:', url);
    
    const data = await this.makeAuthenticatedRequest<any>(url);
    // Backend returns array directly, not wrapped in messages property
    const list = Array.isArray(data) ? data : (data.messages || []);
    console.log('[Chat] Raw messages from backend for thread_id:', thread_id, 'messages:', list);
    
    return list.map((msg: any, idx: number) => {
      // Determine sender based on sender_type
      // 'user' = student sending message, 'teacher' = teacher responding
      const isUserMessage = msg.sender_type === 'user' || msg.sender_type === 'student';
      const sender = isUserMessage ? 'user' : 'assistant';
      
      console.log(`[Chat] Message ${idx}: sender_type=${msg.sender_type}, sender_name=${msg.sender_name}, mapped_to=${sender}, content="${msg.content}"`);
      
      return {
        id: String(msg.id || idx),
        text: msg.content,
        sender,
        timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });
  }

  private static async getOrCreateThread(): Promise<{ thread_id: string; recipient_name?: string; unread_count?: number }> {
    const data = await this.makeAuthenticatedRequest<any>('/connect/thread');
    // Backend returns 'id', but we need 'thread_id' for compatibility
    return {
      thread_id: String(data.id),
      recipient_name: data.recipient_name,
      unread_count: data.unread_count
    };
  }

  // Favourites endpoints (spelling per backend)
  static async getFavorites(): Promise<any[]> {
    return this.makeAuthenticatedRequest<any[]>('/user/favourites');
  }

  static async toggleFavorite(lessonId: number) {
    return this.makeAuthenticatedRequest(`/user/favourites/${lessonId}`, {
      method: 'POST',
    });
  }

  static async removeFromFavorites(favoriteId: number) {
    return this.makeAuthenticatedRequest(`/user/favourites/${favoriteId}`, {
      method: 'DELETE',
    });
  }

  // Profile endpoints
  static async updateProfile(updateData: Partial<User>) {
    return this.makeAuthenticatedRequest('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  // Time Tracking Methods
  static async updateTimeTracking(date: string, hours: number) {
    return this.makeAuthenticatedRequest('/user/time-tracking', {
      method: 'POST',
      body: JSON.stringify({ date, hours }),
    });
  }

  static async uploadProfilePicture(imageUri: string): Promise<{ path: string; public_url: string }> {
    // Use Supabase storage if configured
    const SupabaseStorage = await import('./supabaseStorage').then(m => m.default);
    if (SupabaseStorage.isConfigured()) {
      try {
        const userData = await AsyncStorage.getItem('regod_user_data');
        if (userData) {
          const user = JSON.parse(userData);
          const result = await SupabaseStorage.uploadAvatar(user.id, imageUri);
          
          // Update user profile with new avatar URL
          await this.updateProfile({ avatar_url: result.publicUrl });
          
          return {
            path: result.path,
            public_url: result.publicUrl,
          };
        }
      } catch (error) {
        console.error('[UPLOAD] Supabase upload failed, falling back to backend:', error);
        // Fall through to backend upload
      }
    }

    // Fallback to backend upload
    const formData = new FormData();
    
    // Generate a filename
    const filename = `profile_${Date.now()}.jpg`;
    
    // For React Native, we need to create a proper file object
    const file = {
      uri: imageUri,
      type: 'image/jpeg',
      name: filename,
    } as any;
    
    formData.append('file', file);
    
    const headers = await this.getAuthHeaders();
    // Remove Content-Type header to let the browser set it with boundary for FormData
    delete headers['Content-Type'];
    
    console.log('[UPLOAD] Uploading profile picture:', {
      uri: imageUri,
      filename,
      headers: Object.keys(headers),
      baseUrl: await this.base()
    });
    
    const result = await fetch(`${await this.base()}/uploads/profile-picture`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    console.log('[UPLOAD] Upload response:', {
      status: result.status,
      statusText: result.statusText,
      ok: result.ok
    });
    
    if (!result.ok) {
      const errorData = await result.json().catch(() => ({}));
      console.error('[UPLOAD] Upload error:', errorData);
      throw new Error(errorData.detail || `Upload failed with status ${result.status}`);
    }
    
    const data = await result.json();
    console.log('[UPLOAD] Upload success:', data);
    
    // Construct the full URL for the uploaded image
    const baseUrl = await this.base();
    // Remove /api from baseUrl for static file serving
    const staticBaseUrl = baseUrl.replace('/api', '');
    const publicUrl = data.path.startsWith('http') ? data.path : `${staticBaseUrl}${data.path}`;
    
    console.log('[UPLOAD] Constructed public URL:', publicUrl);
    
    return {
      path: data.path,
      public_url: publicUrl,
    };
  }

  // Supabase storage methods
  static async uploadCourseCover(courseId: number, imageUri: string): Promise<{ path: string; public_url: string }> {
    const SupabaseStorage = await import('./supabaseStorage').then(m => m.default);
    
    if (!SupabaseStorage.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    const result = await SupabaseStorage.uploadCourseCover(courseId, imageUri);
    
    return {
      path: result.path,
      public_url: result.publicUrl,
    };
  }

  static async uploadChapterBanner(courseId: number, chapterId: number, imageUri: string): Promise<{ path: string; public_url: string }> {
    const SupabaseStorage = await import('./supabaseStorage').then(m => m.default);
    
    if (!SupabaseStorage.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    const result = await SupabaseStorage.uploadChapterBanner(courseId, chapterId, imageUri);
    
    return {
      path: result.path,
      public_url: result.publicUrl,
    };
  }

  static async uploadLessonThumbnail(courseId: number, chapterId: number, lessonId: number, imageUri: string): Promise<{ path: string; public_url: string }> {
    const SupabaseStorage = await import('./supabaseStorage').then(m => m.default);
    
    if (!SupabaseStorage.isConfigured()) {
      throw new Error('Supabase storage is not configured');
    }

    const result = await SupabaseStorage.uploadLessonThumbnail(courseId, chapterId, lessonId, imageUri);
    
    return {
      path: result.path,
      public_url: result.publicUrl,
    };
  }

  // Admin endpoints (if user is admin)
  static async getAdminStats() {
    return this.makeAuthenticatedRequest('/admin/stats');
  }

  static async getTeachersDirectory() {
    return this.makeAuthenticatedRequest('/admin/teachers');
  }

  static async deleteUserAccount(userId: string): Promise<{ message: string; user_id: string; reassigned_students: number }> {
    return this.makeAuthenticatedRequest(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Teacher code endpoints
  static async applyTeacherCode(code: string): Promise<{ success: boolean; message: string; teacher_name?: string }> {
    return this.makeAuthenticatedRequest('/use-teacher-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  // Favorites endpoints
  static async toggleChapterFavorite(chapterId: number): Promise<{ action: string; chapter_id: number }> {
    return this.makeAuthenticatedRequest(`/user/chapter-favourites/${chapterId}`, {
      method: 'POST',
    });
  }

  static async getChapterFavorites(): Promise<Array<{
    id: number;
    user_id: string;
    chapter_id: number;
    created_at: string;
    chapter_title: string;
    course_title: string;
    cover_image_url?: string;
    progress_percentage: number;
    completed_modules: number;
    total_modules: number;
  }>> {
    return this.makeAuthenticatedRequest('/user/chapter-favourites');
  }

  static async deleteChapterFavorite(favoriteId: number): Promise<{ message: string }> {
    return this.makeAuthenticatedRequest(`/user/chapter-favourites/${favoriteId}`, {
      method: 'DELETE',
    });
  }

  static async deleteAccount(): Promise<{ message: string }> {
    return this.makeAuthenticatedRequest('/user/account', {
      method: 'DELETE',
    });
  }

  // Utility methods
  static async refreshToken(): Promise<string> {
    const refreshToken = await AsyncStorage.getItem('regod_refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${await this.base()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await this.handleResponse(response);
    
    // Update stored tokens
    await AsyncStorage.setItem('regod_access_token', data.auth_token);
    await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
    
    return data.auth_token;
  }

  static async clearTokens() {
    console.log('Clearing all stored tokens');
    await AsyncStorage.removeItem('regod_access_token');
    await AsyncStorage.removeItem('regod_refresh_token');
    await AsyncStorage.removeItem('regod_user_data');
    await AsyncStorage.removeItem('clerk_session_token');
  }

  // Only clear tokens when user explicitly logs out or when all recovery attempts fail
  static async clearTokensOnLogout(): Promise<void> {
    await this.clearTokens();
  }

  // Check if we should attempt token refresh before giving up
  static async shouldAttemptRefresh(): Promise<boolean> {
    const refreshToken = await AsyncStorage.getItem('regod_refresh_token');
    const userData = await AsyncStorage.getItem('regod_user_data');
    return !!(refreshToken || userData);
  }

  // Only clear tokens when absolutely necessary (explicit logout or complete auth failure)
  static async clearTokensIfNecessary(): Promise<boolean> {
    // Only clear tokens if we have no way to recover
    const hasRefreshToken = await AsyncStorage.getItem('regod_refresh_token');
    const hasUserData = await AsyncStorage.getItem('regod_user_data');
    const hasClerkToken = await AsyncStorage.getItem('clerk_session_token');
    
    if (!hasRefreshToken && !hasUserData && !hasClerkToken) {
      console.log('No authentication tokens available, clearing all tokens');
      await this.clearTokens();
      return true;
    }
    
    console.log('Authentication tokens still available, keeping session alive');
    return false;
  }

  static async setClerkToken(token: string): Promise<void> {
    await AsyncStorage.setItem('clerk_session_token', token);
    // Verify the token was stored
    const storedToken = await AsyncStorage.getItem('clerk_session_token');
    if (!storedToken || storedToken !== token) {
      throw new Error('Failed to store Clerk token');
    }
    console.log('Clerk token stored and verified');
  }

  static async hasClerkToken(): Promise<boolean> {
    const token = await AsyncStorage.getItem('clerk_session_token');
    return !!token;
  }

  static isTokenExpiringSoon(token: string, minutesAhead: number = 5): boolean {
    try {
      // For Clerk session tokens, we can't decode them, so we'll assume they're valid
      // This method is mainly for backward compatibility
      return false;
    } catch (error) {
      console.error('Error checking token expiry:', error);
      return true;
    }
  }


  static async refreshTokenIfNeeded(): Promise<string | null> {
    try {
      const refreshToken = await AsyncStorage.getItem('regod_refresh_token');
      if (!refreshToken) {
        console.log('No refresh token available');
        return null;
      }

      const response = await fetch(`${await this.base()}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        console.error('Token refresh failed with status:', response.status);
        // Try to get more details about the error
        try {
          const errorData = await response.json();
          console.error('Token refresh error details:', errorData);
        } catch (e) {
          console.error('Could not parse error response');
        }
        return null;
      }

      const data = await response.json();
      
      // Store new tokens
      await AsyncStorage.setItem('regod_access_token', data.auth_token);
      await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
      
      // Update user data if provided
      if (data.user_data) {
        await AsyncStorage.setItem('regod_user_data', JSON.stringify(data.user_data));
      }
      
      console.log('Token refreshed successfully');
      return data.auth_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  static async debugJWTToken(token: string): Promise<any> {
    try {
      const response = await fetch(`${await this.base()}/auth/debug-jwt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();
      console.log('JWT Debug result:', result);
      return result;
    } catch (error) {
      console.error('JWT Debug failed:', error);
      return { error: 'Debug failed', success: false };
    }
  }

  static async isAuthenticated(): Promise<boolean> {
    try {
      // Check for access token first
      let token = await AsyncStorage.getItem('regod_access_token');
      
      if (token) {
        return true;
      }
      
      // Fallback to refresh token
      token = await AsyncStorage.getItem('regod_refresh_token');
      if (token) {
        // Try to refresh the access token
        const newToken = await this.refreshTokenIfNeeded();
        return !!newToken;
      }
      
      // Fallback to Clerk session token for backward compatibility
      token = await AsyncStorage.getItem('clerk_session_token');
      return !!token;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  // Connect/Teacher-Student endpoints
  static async getAssignedTeacher(): Promise<{ 
    id: string; 
    name: string; 
    avatar_url?: string; 
    is_online: boolean;
    last_message?: string;
    last_message_time?: string;
    unread_count?: number;
  }> {
    const data = await this.makeAuthenticatedRequest<any>('/connect/thread');
    return {
      id: String(data.id),
      name: data.recipient_name || 'Teacher',
      avatar_url: data.recipient_avatar,
      is_online: data.is_online,
      last_message: data.last_message,
      last_message_time: data.last_message_time,
      unread_count: data.unread_count
    };
  }

  static async getAssignedStudents(): Promise<Array<{ 
    id: string; 
    name: string; 
    avatar_url?: string; 
    is_online: boolean; 
    last_message?: string; 
    last_message_time?: string;
    unread_count?: number;
    thread_id?: number;
  }>> {
    return this.makeAuthenticatedRequest('/connect/students');
  }

  static async getStudentAccess(): Promise<Array<{ teacher_id: string; teacher_name: string; granted_at: string; is_active: boolean }>> {
    return this.makeAuthenticatedRequest('/student-access');
  }

  static async getQuizResponses(page: number = 1, limit: number = 20): Promise<Array<{
    id: string;
    student_name: string;
    course_title: string;
    chapter_title: string;
    module_title: string;
    question: string;
    answer: string;
    question_type: string;
    submitted_at: string;
    module_id: number;
    course_id: number;
    score: number;
    total_responses: number;
  }>> {
    return this.makeAuthenticatedRequest(`/quiz-responses?page=${page}&limit=${limit}`);
  }

  static async useTeacherCode(code: string): Promise<{ success: boolean; message: string; teacher_name?: string }> {
    return this.makeAuthenticatedRequest('/use-teacher-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
  }

  static async checkTeacherAssignment(): Promise<{ has_teacher: boolean; teacher_id?: number; teacher_name?: string; assigned_at?: string }> {
    return this.makeAuthenticatedRequest('/check-teacher-assignment', {
      method: 'GET',
    });
  }

  static async getTeacherCode(): Promise<{ teacher_code: string; is_active: boolean; use_count: number; max_uses: number }> {
    const codes = await this.makeAuthenticatedRequest<any[]>('/teacher-codes', {
      method: 'GET',
    });
    
    // Return the first active teacher code
    if (codes && Array.isArray(codes) && codes.length > 0) {
      const activeCode = codes.find((code: any) => code.is_active) || codes[0];
      return {
        teacher_code: activeCode.code,
        is_active: activeCode.is_active,
        use_count: activeCode.use_count,
        max_uses: activeCode.max_uses
      };
    }
    
    throw new Error('No teacher codes found');
  }

  static async getStoredToken(): Promise<string | null> {
    // Try access token first
    let token = await AsyncStorage.getItem('regod_access_token');
    if (token) return token;
    
    // Fallback to Clerk session token
    return await AsyncStorage.getItem('clerk_session_token');
  }

  static async getStoredUserData(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('regod_user_data');
    } catch (error) {
      console.error('Error getting stored user data:', error);
      return null;
    }
  }

  // WebSocket connection for real-time chat
  static async createWebSocketConnection(userId: string): Promise<WebSocket> {
    // Force fresh URL resolution for WebSocket to match HTTP API
    await this.clearCache();
    const httpBaseUrl = await this.base();
    console.log('[WebSocket] Using base URL:', httpBaseUrl);

    // Get authentication token
    const token = await AsyncStorage.getItem('regod_access_token');
    if (!token) {
      throw new Error('No authentication token available for WebSocket');
    }

    // Convert HTTP/HTTPS to WS/WSS
    let wsBaseUrl = httpBaseUrl;
    if (wsBaseUrl.startsWith('https://')) {
      wsBaseUrl = wsBaseUrl.replace('https://', 'wss://');
    } else if (wsBaseUrl.startsWith('http://')) {
      wsBaseUrl = wsBaseUrl.replace('http://', 'ws://');
    } else if (!wsBaseUrl.startsWith('ws://') && !wsBaseUrl.startsWith('wss://')) {
      // If no protocol specified, assume ws://
      wsBaseUrl = `ws://${wsBaseUrl}`;
    }

    // Use the correct WebSocket endpoint with token as query parameter
    const wsUrl = `${wsBaseUrl}/connect/socket?token=${encodeURIComponent(token)}`;
    console.log('[WebSocket] Attempting connection to:', wsUrl.replace(token, 'TOKEN_HIDDEN'));

    try {
      return new WebSocket(wsUrl);
    } catch (error) {
      console.warn('[WebSocket] Failed to create connection:', error);
      throw error;
    }
  }

  // Real-time message handling
  static handleWebSocketMessage(
    message: string,
    onNewMessage: (message: any) => void,
    onError: (error: any) => void
  ) {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'new_message') {
        onNewMessage(data.message);
      } else if (data.type === 'error') {
        onError(data.error);
      }
    } catch (error) {
      onError(error);
    }
  }

  // Push notification methods
  static async registerPushToken(expoPushToken: string): Promise<{ success: boolean; message: string }> {
    return this.makeAuthenticatedRequest('/notifications/register-push-token', {
      method: 'POST',
      body: JSON.stringify({ expo_push_token: expoPushToken }),
    });
  }

  static async unregisterPushToken(): Promise<{ success: boolean; message: string }> {
    return this.makeAuthenticatedRequest('/notifications/unregister-push-token', {
      method: 'DELETE',
    });
  }

  static async getPushTokenStatus(): Promise<{ has_token: boolean; token_registered: boolean }> {
    return this.makeAuthenticatedRequest('/notifications/push-token-status', {
      method: 'GET',
    });
  }
}

export default ApiService;
export type { User, Course, Chapter, Module, Note, DashboardResponse, Message, ChatResponse };