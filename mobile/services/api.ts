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
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000/api';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
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
  ): Promise<ApiResponse<T>> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...this.authHeaders() },
      });
    } catch (error: any) {
      return {
        data: null,
        error: `No se pudo conectar con el servidor (${this.baseUrl}). Revisa tu conexión.`,
        status: 0,
      };
    }

    // Expired access token → refresh once, then replay the request.
    if (response.status === 401 && allowRetry && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.request<T>(path, init, false);
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

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
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

  /** Multipart upload for camera images. */
  uploadImage<T>(path: string, imageUri: string, fieldName = 'file') {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg';

    formData.append(fieldName, { uri: imageUri, name: filename, type } as any);

    // Content-Type is intentionally omitted: fetch sets the multipart
    // boundary itself, and overriding it breaks the upload.
    return this.request<T>(path, { method: 'POST', body: formData });
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
