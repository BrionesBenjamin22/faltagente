import { mutate, request } from "@/lib/http";
import type { User } from "@/features/auth/types";
import type { ProfileHistoryPage } from "./types";
export const accountService = {
  history: (page: number) => request<ProfileHistoryPage>(`/users/me/history?page=${page}`),
  profile: () => request<User>("/users/me"),
  updateProfile: (input: { name?: string; primaryLocationId?: string }) => mutate<User>("/users/me", input, "PATCH"),
  changePassword: (input: { currentPassword: string; newPassword: string }) => mutate("/auth/password/change", input),
};
