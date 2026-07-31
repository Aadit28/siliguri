import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from '@expo-google-fonts/dm-sans';
import '../src/lib/i18n';
import { AuthProvider } from '../src/context/AuthContext';
import { LocaleProvider } from '../src/context/LocaleContext';
import { AppThemeProvider, useTheme } from '../src/context/ThemeContext';
import { DisplayModeProvider, useDisplayMode } from '../src/context/DisplayModeContext';
import { FONT_BOLD } from '../src/lib/fonts';

SplashScreen.preventAutoHideAsync();

const PHONE_MAX_WIDTH = 480;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <DisplayModeProvider>
          <AuthProvider>
            <LocaleProvider>
              <RootStack />
            </LocaleProvider>
          </AuthProvider>
        </DisplayModeProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

// Identifiers already routed, so the cold-start "last response" and the live
// listener cannot both navigate for the same tap.
const handledNotificationIds = new Set<string>();

// Notification taps carry an internal path in data.url (set by both the local
// reminder scheduler and the server push helper). Only such internal paths are
// accepted: a push payload must not be able to send an elder to an arbitrary
// external URL.
function useNotificationDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const route = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledNotificationIds.has(id)) return;
      handledNotificationIds.add(id);
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
        router.push(url as never);
      }
    };

    // App launched by tapping a notification: the tap happened before the
    // listener below existed.
    Notifications.getLastNotificationResponseAsync().then(route).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(route);
    return () => subscription.remove();
  }, [router]);
}

function RootStack() {
  const { colors, isDark } = useTheme();
  const { isComputerMode } = useDisplayMode();
  useNotificationDeepLinks();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View
        style={[
          styles.gutter,
          isComputerMode && styles.gutterComputer,
          { backgroundColor: isComputerMode ? colors.bg : colors.frame },
        ]}
      >
        <View
          style={[
            styles.shell,
            isComputerMode ? styles.computer : styles.phone,
            {
              backgroundColor: colors.bg,
              borderColor: 'transparent',
            },
          ]}
        >
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.nav },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: FONT_BOLD },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="privacy" options={{ title: '' }} />
            <Stack.Screen name="new-post" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="service/[id]" options={{ title: '' }} />
            <Stack.Screen name="post/[id]" options={{ title: '' }} />
            <Stack.Screen name="calendar" options={{ title: '' }} />
            {/* Guardian screens mount <AppHeader /> themselves (same as the tab
                screens) so a direct load of /guardian keeps the bell, language,
                theme and sign-out controls instead of dead-ending. */}
            <Stack.Screen name="guardian/index" options={{ headerShown: false }} />
            <Stack.Screen name="guardian/[parentId]" options={{ headerShown: false }} />
            <Stack.Screen name="admin" options={{ title: '' }} />
            <Stack.Screen name="connectors" options={{ title: '' }} />
          </Stack>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  gutter: {
    flex: 1,
    alignItems: 'center',
  },
  gutterComputer: {
    alignItems: 'stretch',
  },
  shell: {
    flex: 1,
    width: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  phone: {
    maxWidth: PHONE_MAX_WIDTH,
  },
  computer: {
    maxWidth: '100%',
  },
});
