export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

export interface ApiSuccess<T = void> {
  ok: true;
  data?: T;
}

export interface SessionResponse {
  ok: true;
  expiresIn: number;
  expiresAt: string;
  refreshAt: string;
}

export interface AuthUser {
  id: string;
  role: "user" | "admin";
}
