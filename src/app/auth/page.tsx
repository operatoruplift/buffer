import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Sign in — Buffer', robots: { index: false, follow: true } };
export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <AuthForm initialMode={mode === 'signup' ? 'signup' : 'signin'} />;
}
