import type { Location } from "@/features/locations/service";
export interface User { id: string; name: string; email: string; emailVerified: boolean; hasLocalPassword: boolean; primaryLocation: Location | null }
export interface Session { authenticated: boolean; accessExpiresAt: string | null; refreshAvailable: boolean; user: User | null }
export interface RegisterInput { name: string; email: string; password: string; primaryLocationId: string }
