/**
 * BestMe — API Client
 * =====================
 * Centralized HTTP client for backend communication.
 * Uses fetch with typed request/response handling.
 */

const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api'
  : 'https://api.bestme.app/api'; // TODO: update for production

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await response.json();
      return { data, error: null, status: response.status };
    } catch (error: any) {
      return { data: null, error: error.message, status: 0 };
    }
  }

  async post<T>(path: string, body?: any): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return { data, error: null, status: response.status };
    } catch (error: any) {
      return { data: null, error: error.message, status: 0 };
    }
  }

  async put<T>(path: string, body?: any): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return { data, error: null, status: response.status };
    } catch (error: any) {
      return { data: null, error: error.message, status: 0 };
    }
  }

  async patch<T>(path: string, body?: any): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return { data, error: null, status: response.status };
    } catch (error: any) {
      return { data: null, error: error.message, status: 0 };
    }
  }

  async uploadImage<T>(path: string, imageUri: string, fieldName = 'file'): Promise<ApiResponse<T>> {
    try {
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append(fieldName, {
        uri: imageUri,
        name: filename,
        type,
      } as any);

      const headers: HeadersInit = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const data = await response.json();
      return { data, error: null, status: response.status };
    } catch (error: any) {
      return { data: null, error: error.message, status: 0 };
    }
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
