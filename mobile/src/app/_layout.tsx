/**
 * Root layout — loads fonts, guards auth, sets up navigation.
 */

import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/authStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme     = useColorScheme();
  const { isHydrated }  = useAuthStore();

  const [fontsLoaded] = useFonts({
    // Bricolage Grotesque — variable font; rename to expected weight variants
    'BricolageGrotesque':         require('@/assets/fonts/BricolageGrotesque-Bold.ttf'),
    'BricolageGrotesque-SemiBold':require('@/assets/fonts/BricolageGrotesque-SemiBold.ttf'),
    // DM Sans
    'DMSans':                     require('@/assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium':              require('@/assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold':            require('@/assets/fonts/DMSans-SemiBold.ttf'),
    // DM Mono
    'DMMono':                     require('@/assets/fonts/DMMono-Regular.ttf'),
    'DMMono-Medium':              require('@/assets/fonts/DMMono-Medium.ttf'),
  });

  const ready = fontsLoaded && isHydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          {/* Auth flow */}
          <Stack.Screen name="(auth)"    options={{ animation: 'fade' }} />
          {/* Main tab app */}
          <Stack.Screen name="(tabs)"    options={{ animation: 'fade' }} />
          {/* Upload modal slides up from bottom */}
          <Stack.Screen
            name="upload"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          {/* Analyzing — no swipe back */}
          <Stack.Screen
            name="analyzing/[id]"
            options={{ gestureEnabled: false }}
          />
          {/* Result screens */}
          <Stack.Screen name="result/[id]" />
          <Stack.Screen name="timing/[id]" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
