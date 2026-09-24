import { apiRequest, BASE_URL, setToken } from "@/api/client";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface MeResponse {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

// Real, read-only: the authenticated user's own profile via GET /auth/me,
// decoded from the bearer token already stored by login(). Distinct from
// AppContext's old MOCK_USER -- this is what actually backs a logged-in
// user's displayed name.
export function getMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>("/auth/me");
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  // The backend's /auth/login expects OAuth2 form-encoded data,
  // not JSON — "username" carries the email.
  const form = new URLSearchParams();
  form.append("grant_type", "password");
  form.append("username", payload.email);
  form.append("password", payload.password);

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.detail || "Identifiants invalides");
  }

  const data: LoginResponse = await response.json();
  setToken(data.access_token);
  return data;
}