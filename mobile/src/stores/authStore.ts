/**
 * Auth store — persists JWT + user info to AsyncStorage.
 * Use this as the single source of truth for login state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import * as api from '@/services/api';

interface User {
  id:        string;
  email:     string;
  full_name: string;
  role:      string;
}

interface AuthState {
  token:        string | null;
  user:         User | null;
  isHydrated:   boolean;

  login:    (email: string, password: string) => Promise<void>;
  register: (payload: api.RegisterPayload) => Promise<void>;
  logout:   () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token:      null,
      user:       null,
      isHydrated: false,

      login: async (email, password) => {
        const res = await api.login(email, password);
        api.setToken(res.access_token);
        const me = await api.getMe();
        set({ token: res.access_token, user: me });
      },

      register: async (payload) => {
        const res = await api.register(payload);
        api.setToken(res.access_token);
        const me = await api.getMe();
        set({ token: res.access_token, user: me });
      },

      logout: () => {
        api.setToken(null);
        set({ token: null, user: null });
      },

      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'practice-tracker-auth',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Restore token into axios interceptor after rehydration
        if (state?.token) {
          api.setToken(state.token);
        }
        state?.setHydrated();
      },
    }
  )
);
