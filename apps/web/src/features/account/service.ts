import { mutate, request } from "@/lib/http";
import type { User } from "@/features/auth/types";
export const accountService = {
  profile: () => request<User>("/users/me"),
  updateProfile: (input: { name?: string; primaryLocationId?: string }) => mutate<User>("/users/me", input, "PATCH"),
  changePassword: (input: { currentPassword: string; newPassword: string }) => mutate("/auth/password/change", input),
};
