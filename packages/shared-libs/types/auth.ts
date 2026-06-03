export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  user: SessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
  };
}
