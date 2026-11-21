import { mutate, request } from "@/lib/http";
import type { User, Session, RegisterInput } from "./types";
export const authService = {
  session: () => request<Session>("/auth/session"),
  login: (input: { email: string; password: string }) => mutate<Session>("/auth/login", input),
  register: (input: RegisterInput) => mutate<Session>("/auth/register", input),
  logout: () => mutate("/auth/logout"),
  refresh: () => mutate<Session>("/auth/refresh"),
  setLocation: (primaryLocationId: string) => mutate<User>("/users/me/location", { primaryLocationId }, "PATCH"),
  requestReset: (email: string) => mutate("/auth/password/forgot", { email }),
  reset: (token: string, password: string) => mutate("/auth/password/reset", { token, password }),
  verify: (token: string) => mutate("/auth/email/verify", { token }),
  resendVerification: () => mutate("/auth/email/resend", {}),
};
