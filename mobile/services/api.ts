/**
 * BestMe — API Client
 * =====================
 * Centralized HTTP client for backend communication.
 *
 * Responsibilities beyond plain `fetch`:
 *   - resolves the base URL from EXPO_PUBLIC_API_URL (localhost never
 *     works from a physical device — it resolves to the phone itself)
 *   - turns non-2xx responses into `error`, instead of reporting them as success
 *   - transparently refreshes an expired access token once, then replays
 *     the original request
 */

/**
 * Base URL, in priority order:
 *   1. EXPO_PUBLIC_API_URL   — set this in .env (see .env.example)
 *   2. localhost             — only useful for the web build / emulator
 *
 * On a physical phone you MUST set EXPO_PUBLIC_API_URL to your machine's
 * LAN address (e.g. http://192.168.1.42:8000/api) or your deployed URL.
 */
import { File, UploadType } from 'expo-file-system';
import {
  enqueueMutation,
  getCached,
  getQueue,
  removeFromQueue,
  setCached,
  type QueuedMutation,
} from './offlineStore';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000/api';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
  /** True when there was no connection and this write was queued instead of sent. */
  queued?: boolean;
  /** True when there was no connection and this is the last cached copy, not a live read. */
  fromCache?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
}

/** Pull a human-readable message out of a FastAPI error body. */
function extractErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'string' && body.trim()) return body;

  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // Pydantic validation errors: [{ loc, msg, type }, ...]
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) =>
          item && typeof item === 'object' && 'msg' in item ? String((item as any).msg) : null,
        )
        .filter(Boolean);
      if (messages.length) return messages.join('. ');
    }
  }

  if (status === 401) return 'Tu sesión ha expirado. Inicia sesión de nuevo.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 404) return 'No se encontró el recurso solicitado.';
  if (status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo.';
  return `Error ${status}`;
}

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  /** Called whenever tokens change, so the caller can persist them. */
  private onTokensChanged: ((tokens: AuthTokens | null) => void) | null = null;
  /** Called when the refresh token is also dead — the user must log in again. */
  private onAuthFailure: (() => void) | null = null;

  /** In-flight refresh, shared so concurrent 401s trigger only one refresh. */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  get baseUrlForDisplay(): string {
    return this.baseUrl;
  }

  setTokens(tokens: AuthTokens | null) {
    this.accessToken = tokens?.accessToken ?? null;
    this.refreshToken = tokens?.refreshToken ?? null;
  }

  /** Kept for compatibility with call sites that only have an access token. */
  setToken(token: string | null) {
    this.accessToken = token;
  }

  setCallbacks(callbacks: {
    onTokensChanged?: (tokens: AuthTokens | null) => void;
    onAuthFailure?: () => void;
  }) {
    this.onTokensChanged = callbacks.onTokensChanged ?? null;
    this.onAuthFailure = callbacks.onAuthFailure ?? null;
  }

  private authHeaders(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  // ── Token refresh ───────────────────────────────────────────────

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    // Collapse parallel refreshes into one network call.
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: this.refreshToken }),
        });

        if (!response.ok) {
          this.setTokens(null);
          this.onTokensChanged?.(null);
          this.onAuthFailure?.();
          return false;
        }

        const data = await response.json();
        const tokens: AuthTokens = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? this.refreshToken,
        };
        this.setTokens(tokens);
        this.onTokensChanged?.(tokens);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // ── Core request ────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: RequestInit,
    allowRetry = true,
    queueDescription?: string,
  ): Promise<ApiResponse<T>> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...this.authHeaders() },
      });
    } catch (error: any) {
      // No connection reached the server at all — this is the offline case,
      // not a 4xx/5xx from a request that got there. Two ways out:
      //   - a GET: serve the last cached copy of this exact path, if we have one.
      //   - a mutation the caller marked as queueable: save it for later instead
      //     of losing it. Mutations that don't set queueDescription (login,
      //     register, refresh) fall through to the plain error below — replaying
      //     a login attempt later makes no sense.
      const method = (init.method ?? 'GET').toUpperCase();

      if (method === 'GET') {
        const cached = await getCached<T>(path);
        if (cached) {
          return { data: cached.data, error: null, status: 0, fromCache: true };
        }
      } else if (queueDescription) {
        await enqueueMutation({
          method: method as QueuedMutation['method'],
          path,
          body: init.body ? JSON.parse(init.body as string) : null,
          description: queueDescription,
        });
        return { data: null, error: null, status: 0, queued: true };
      }

      const detail = error?.message ? ` — ${error.message}` : '';
      return {
        data: null,
        error: `No se pudo conectar con el servidor (${this.baseUrl}${path})${detail}. Revisa tu conexión.`,
        status: 0,
      };
    }

    // Expired access token → refresh once, then replay the request.
    if (response.status === 401 && allowRetry && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.request<T>(path, init, false, queueDescription);
      }
    }

    // 204 No Content and friends have no body to parse.
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return response.ok
        ? { data: null, error: null, status: response.status }
        : { data: null, error: extractErrorMessage(null, response.status), status: response.status };
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok && (init.method ?? 'GET').toUpperCase() === 'GET') {
      void setCached(path, body);
    }

    if (!response.ok) {
      return {
        data: null,
        error: extractErrorMessage(body, response.status),
        status: response.status,
      };
    }

    return { data: body as T, error: null, status: response.status };
  }

  // ── Verbs ───────────────────────────────────────────────────────

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  /**
   * @param queueOffline - When set, a network failure queues this write
   *   instead of just failing — pass a short description ("Comida
   *   registrada") shown in the pending-sync list. Omit for writes that
   *   only make sense live (login, register, token refresh).
   */
  post<T>(path: string, body?: unknown, queueOffline?: string) {
    return this.request<T>(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      true,
      queueOffline,
    );
  }

  put<T>(path: string, body?: unknown, queueOffline?: string) {
    return this.request<T>(
      path,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      true,
      queueOffline,
    );
  }

  patch<T>(path: string, body?: unknown, queueOffline?: string) {
    return this.request<T>(
      path,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      true,
      queueOffline,
    );
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // ── Offline queue sync ───────────────────────────────────────────

  /**
   * Replays queued writes in the order they were made. Stops at the first
   * one that still fails — if we're still offline, there's no point
   * hammering through the rest, and stopping preserves ordering for the
   * next attempt.
   */
  async flushQueue(): Promise<{ flushed: number; remaining: number }> {
    const queue = await getQueue();
    let flushed = 0;

    for (const item of queue) {
      const res = await this.request(item.path, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body !== null ? JSON.stringify(item.body) : undefined,
      });
      if (res.error) {
        // Still offline, or the server rejected it — either way, stop and
        // leave this (and everything after it) in the queue rather than
        // silently discarding something the server didn't actually accept.
        break;
      }
      await removeFromQueue(item.id);
      flushed += 1;
    }

    const remaining = (await getQueue()).length;
    return { flushed, remaining };
  }

  /**
   * Form-encoded POST — required by the login endpoint, which uses
   * FastAPI's OAuth2PasswordRequestForm.
   */
  postForm<T>(path: string, fields: Record<string, string>) {
    const encoded = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => encoded.append(key, value));

    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encoded.toString(),
    });
  }

  /**
   * Multipart upload for camera images.
   *
   * Goes through `expo-file-system`'s native upload task instead of a plain
   * `fetch(FormData)` — React Native's New Architecture FormData polyfill
   * throws "Unsupported FormDataPart implementation" for the classic
   * `{ uri, name, type }` file-part shape, so a manual FormData body is
   * unreliable here even though it works fine for JSON requests.
   */
  async uploadImage<T>(
    path: string,
    imageUri: string,
    fieldName = 'file',
    allowRetry = true,
  ): Promise<ApiResponse<T>> {
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const mimeType = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg';

    let result: { status: number; body: string };
    try {
      const file = new File(imageUri);
      result = await file.upload(`${this.baseUrl}${path}`, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName,
        mimeType,
        headers: this.authHeaders(),
      });
    } catch (error: any) {
      const detail = error?.message ? ` — ${error.message}` : '';
      return {
        data: null,
        error: `No se pudo conectar con el servidor (${this.baseUrl}${path})${detail}. Revisa tu conexión.`,
        status: 0,
      };
    }

    // Expired access token → refresh once, then replay the upload.
    if (result.status === 401 && allowRetry && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.uploadImage<T>(path, imageUri, fieldName, false);
      }
    }

    let body: unknown = null;
    try {
      body = result.body ? JSON.parse(result.body) : null;
    } catch {
      body = null;
    }

    if (result.status < 200 || result.status >= 300) {
      return { data: null, error: extractErrorMessage(body, result.status), status: result.status };
    }

    return { data: body as T, error: null, status: result.status };
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
