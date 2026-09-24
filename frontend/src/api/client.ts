// src/api/client.ts — generic fetch wrapper with JWT handling

export const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export function getToken(): string | null {
  return localStorage.getItem("wp_token");
}

export function setToken(token: string): void {
  localStorage.setItem("wp_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("wp_token");
}

interface RequestOptions extends RequestInit {
  auth?: boolean; // attach Authorization header (default: true)
}

// Carries the HTTP status alongside the message, so callers that need to
// branch on the specific status (e.g. 409 "not ready yet" vs. a generic
// failure) don't have to match on the detail text, which is free to change.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  { auth = true, ...init }: RequestOptions = {}
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401) {
    clearToken();
    window.location.href = "/login";
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      (body as { detail?: string }).detail ?? `HTTP ${response.status}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}
