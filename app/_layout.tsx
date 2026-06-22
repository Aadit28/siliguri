import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../src/lib/i18n';
import { AuthProvider } from '../src/context/AuthContext';
import { LocaleProvider } from '../src/context/LocaleContext';
import { colors } from '../src/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocaleProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="new-post" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="service/[id]" options={{ title: '' }} />
            <Stack.Screen name="post/[id]" options={{ title: '' }} />
          </Stack>
        </LocaleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
