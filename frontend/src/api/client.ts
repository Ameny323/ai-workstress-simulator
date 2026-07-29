// src/api/client.ts — generic fetch wrapper with JWT handling

export const BASE_URL = import.meta.env.VITE_API_URL ?? "";

function getToken(): string | null {
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
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}
