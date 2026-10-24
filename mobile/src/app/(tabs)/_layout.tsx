/**
 * Tab bar layout — Home, Upload (center FAB), Progress.
 */

import { Tabs, router } from 'expo-router';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, FontSize } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useColorScheme } from 'react-native';

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.tabIcon}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
      <Text style={[
        styles.tabLabel,
        { color: focused ? theme.tabActive : theme.tabInactive, fontFamily: Fonts.body }
      ]}>
        {label}
      </Text>
    </View>
  );
}

function UploadFab() {
  const theme = useTheme();
  const { token } = useAuthStore();

  return (
    <Pressable
      onPress={() => {
        if (!token) { router.push('/(auth)/login'); return; }
        router.push('/upload');
      }}
      style={[styles.fab, { backgroundColor: theme.accent }]}
    >
      <Text style={styles.fabPlus}>+</Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const theme      = useTheme();
  const colorScheme = useColorScheme();
  const insets     = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: theme.tabBar,
            borderTopColor:  theme.border,
            height:          56 + insets.bottom,
            paddingBottom:   insets.bottom,
          },
        ],
        tabBarActiveTintColor:   theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarShowLabel:         false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" emoji="🏠" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload-tab"
        options={{
          tabBarButton: () => <UploadFab />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Progress" emoji="📈" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    elevation: 0,
  },
  tabIcon: {
    alignItems:     'center',
    justifyContent: 'center',
    gap:            2,
  },
  tabLabel: {
    fontSize:  FontSize.xs,
    fontWeight:'500',
  },
  fab: {
    width:          56,
    height:         56,
    borderRadius:   28,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius:  8,
    elevation: 6,
  },
  fabPlus: {
    color:      '#fff',
    fontSize:   28,
    fontWeight: '300',
    lineHeight: 30,
  },
});
