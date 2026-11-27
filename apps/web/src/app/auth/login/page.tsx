import { AuthExperience } from "@/features/auth/auth-experience";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams;
  return <AuthExperience mode="login" success={success} />;
}
