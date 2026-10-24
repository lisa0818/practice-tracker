/**
 * Root index — redirect to auth or home based on session.
 */
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function RootIndex() {
  const { token } = useAuthStore();
  return token
    ? <Redirect href={"/(tabs)/home" as any} />
    : <Redirect href={"/(auth)" as any} />;
}