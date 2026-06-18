import { http } from "./http";

export interface PlatformUser {
  id: string;
  username: string;
  phone?: string | null;
  status: string;
  roles: string[];
  createdAt: string;
}

export interface PlatformUserListResult {
  list: PlatformUser[];
  total: number;
}

export function platformUsersApi() {
  return http.get<never, PlatformUserListResult>("/admin/platform-users");
}

export function createPlatformUserApi(input: {
  username: string;
  password: string;
  phone?: string;
  roleCodes?: string[];
}) {
  return http.post<never, PlatformUser>("/admin/platform-users", input);
}

export function updatePlatformUserApi(
  id: string,
  input: { status?: string; roleCodes?: string[] },
) {
  return http.patch<never, PlatformUser>(`/admin/platform-users/${id}`, input);
}

export function deactivatePlatformUserApi(id: string) {
  return http.delete<never, PlatformUser>(`/admin/platform-users/${id}`);
}
