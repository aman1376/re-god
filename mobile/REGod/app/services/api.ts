import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config/constants';
import { Platform } from 'react-native';

// Dynamic API base URL with auto-switch (ngrok/local)
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

interface AuthResponse {
  user_id: string;
  auth_token: string;
  refresh_token: string;
  user_data?: any;
  requires_verification?: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  verified: boolean;
  phone?: string;
  avatar_url?: string;
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

interface Module {
  id: number;
  course_id: number;
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
  course_id: number;
  lesson_id: number;
  note_content: string;
  created_at: string;
  updated_at: string;
  course_title: string;
  lesson_title: string;
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
  private static async base(): Promise<string> {
    return await ApiBaseUrlResolver.ensure();
  }
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    // Use backend JWT token for now (from clerk exchange)
    const token = await AsyncStorage.getItem('regod_access_token');
    
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
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
    
    // Store tokens
    await AsyncStorage.setItem('regod_access_token', data.auth_token);
    await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
    
    return data;
  }

  // Clerk session exchange
  static async clerkExchange(identifier: string): Promise<AuthResponse> {
    const response = await fetch(`${await this.base()}/auth/clerk-exchange`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({ identifier }),
    });
    const data = await this.handleResponse(response);
    await AsyncStorage.setItem('regod_access_token', data.auth_token);
    await AsyncStorage.setItem('regod_refresh_token', data.refresh_token);
    return data;
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
    const response = await fetch(`${await this.base()}/user/dashboard`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    const raw = await this.handleResponse(response);
    // Normalize backend shapes (main.py vs ORM router)
    const normalizeCourse = (c: any) => ({
      course_id: c.course_id ?? c.id,
      course_title: c.course_title ?? c.title ?? 'Course',
      description: c.description ?? '',
      thumbnail_url: c.thumbnail_url ?? undefined,
      category: c.category ?? 'General',
      difficulty: c.difficulty ?? 'Beginner',
      progress_percentage: c.progress_percentage ?? 0,
      is_new: c.is_new ?? false,
      is_continue_available: c.is_continue_available ?? (c.progress_percentage ? c.progress_percentage > 0 : false),
    });
    const normalized = {
      user: raw.user || {},
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
    const response = await fetch(`${await this.base()}/user/profile`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    
    return this.handleResponse(response);
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
    const response = await fetch(`${await this.base()}/courses`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    
    return this.handleResponse(response);
  }

  static async getCourseModules(courseId: number): Promise<Module[]> {
    const response = await fetch(`${await this.base()}/courses/${courseId}/modules`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    
    return this.handleResponse(response);
  }

  static async updateCourseProgress(courseId: number, progressPercentage: number, lastVisitedModuleId?: number) {
    // Only update progress if we have a valid module ID
    if (!lastVisitedModuleId) {
      console.log('No module ID provided, skipping progress update');
      return { success: true, updated_progress_percentage: 0 };
    }
    
    const response = await fetch(`${await this.base()}/learn/progress`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      // Align with backend main.py ProgressRequest (course_id, module_id, status)
      body: JSON.stringify({
        course_id: String(courseId),
        module_id: String(lastVisitedModuleId),
        status: 'visited',
      }),
    });
    
    return this.handleResponse(response);
  }

  // Notes endpoints
  static async getNotes(): Promise<Note[]> {
    const response = await fetch(`${await this.base()}/user/notes`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    const data = await this.handleResponse(response);
    // Backend returns { notes: [{ note_content, course_title, created_at }] }
    const notes = (data.notes || []) as any[];
    return notes.map((n, idx) => ({
      id: Number(new Date(n.created_at).getTime() || idx),
      user_id: '',
      course_id: 0,
      lesson_id: 0,
      note_content: n.note_content,
      created_at: n.created_at,
      updated_at: n.created_at,
      course_title: n.course_title || 'General',
      lesson_title: n.course_title || 'Note',
    }));
  }

  static async createNote(courseId: number, lessonId: number, content: string): Promise<Note> {
    const response = await fetch(`${await this.base()}/user/notes`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({
        course_id: courseId,
        lesson_id: lessonId,
        note_content: content,
      }),
    });
    // If backend not implemented, synthesize local note
    try {
      const data = await this.handleResponse(response);
      return data as Note;
    } catch {
      const now = new Date().toISOString();
      return {
        id: Number(new Date(now).getTime()),
        user_id: '',
        course_id: courseId,
        lesson_id: lessonId,
        note_content: content,
        created_at: now,
        updated_at: now,
        course_title: 'General',
        lesson_title: 'Note',
      };
    }
  }

  static async updateNote(noteId: number, courseId: number, lessonId: number, content: string): Promise<Note> {
    const response = await fetch(`${await this.base()}/user/notes/${noteId}`, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({
        course_id: courseId,
        lesson_id: lessonId,
        note_content: content,
      }),
    });
    try {
      const data = await this.handleResponse(response);
      return data as Note;
    } catch {
      const now = new Date().toISOString();
      return {
        id: noteId,
        user_id: '',
        course_id: courseId,
        lesson_id: lessonId,
        note_content: content,
        created_at: now,
        updated_at: now,
        course_title: 'General',
        lesson_title: 'Note',
      };
    }
  }

  static async deleteNote(noteId: number) {
    const response = await fetch(`${await this.base()}/user/notes/${noteId}`, {
      method: 'DELETE',
      headers: await this.getAuthHeaders(),
    });
    try {
      return await this.handleResponse(response);
    } catch {
      // Fallback: treat as deleted locally
      return { success: true };
    }
  }

  // Chat endpoints (match backend /api/connect/*)
  static async sendChatMessage(message: string): Promise<ChatResponse> {
    // Ensure a thread exists and get its id
    const thread = await this.getOrCreateThread();
    const response = await fetch(`${await this.base()}/connect/thread/messages`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({
        thread_id: thread.thread_id,
        content: message,
      }),
    });
    const data = await this.handleResponse(response);
    return { message: data.message || data.content } as ChatResponse;
  }

  static async getChatHistory(): Promise<Message[]> {
    const thread = await this.getOrCreateThread();
    const response = await fetch(`${await this.base()}/connect/thread/messages?thread_id=${encodeURIComponent(thread.thread_id)}`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    const data = await this.handleResponse(response);
    const list = (data.messages || []) as any[];
    return list.map((msg, idx) => ({
      id: String(idx),
      text: msg.content,
      sender: msg.sender_name === 'You' ? 'user' : 'assistant',
      timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
  }

  private static async getOrCreateThread(): Promise<{ thread_id: string; recipient_name?: string; unread_count?: number }> {
    const res = await fetch(`${await this.base()}/connect/thread`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    return this.handleResponse(res);
  }

  // Favourites endpoints (spelling per backend)
  static async getFavorites(): Promise<any[]> {
    const response = await fetch(`${await this.base()}/user/favourites`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  static async toggleFavorite(lessonId: number) {
    const response = await fetch(`${await this.base()}/user/favourites/${lessonId}`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  static async removeFromFavorites(favoriteId: number) {
    const response = await fetch(`${await this.base()}/user/favourites/${favoriteId}`, {
      method: 'DELETE',
      headers: await this.getAuthHeaders(),
    });
    return this.handleResponse(response);
  }

  // Profile endpoints
  static async updateProfile(updateData: Partial<User>) {
    const response = await fetch(`${await this.base()}/user/profile`, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(updateData),
    });
    
    return this.handleResponse(response);
  }

  // Admin endpoints (if user is admin)
  static async getAdminStats() {
    const response = await fetch(`${await this.base()}/admin/stats`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    
    return this.handleResponse(response);
  }

  static async getTeachersDirectory() {
    const response = await fetch(`${await this.base()}/admin/teachers`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });
    
    return this.handleResponse(response);
  }

  // Teacher code endpoints
  static async useTeacherCode(code: string) {
    const response = await fetch(`${await this.base()}/use-teacher-code`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({ code }),
    });
    
    return this.handleResponse(response);
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
    await AsyncStorage.removeItem('regod_access_token');
    await AsyncStorage.removeItem('regod_refresh_token');
  }

  static async getStoredToken(): Promise<string | null> {
    return await AsyncStorage.getItem('regod_access_token');
  }
}

export default ApiService;
export type { User, Course, Module, Note, DashboardResponse, Message, ChatResponse };