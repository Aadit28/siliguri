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
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { getOnboardingKind } from '../src/lib/onboarding';
import { LocaleProvider } from '../src/context/LocaleContext';
import { CityProvider } from '../src/context/CityContext';
import { AppThemeProvider, useTheme } from '../src/context/ThemeContext';
import { DisplayModeProvider, useDisplayMode } from '../src/context/DisplayModeContext';
import { SimpleModeProvider } from '../src/context/SimpleModeContext';
import { FONT_BOLD } from '../src/lib/fonts';
import WebScrollbarStyle from '../src/components/WebScrollbarStyle';

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
        <SimpleModeProvider>
          <DisplayModeProvider>
            <AuthProvider>
              <LocaleProvider>
                <CityProvider>
                  <RootStack />
                </CityProvider>
              </LocaleProvider>
            </AuthProvider>
          </DisplayModeProvider>
        </SimpleModeProvider>
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

// First run for an account: show the intro before anything else. The check is
// per user id (see src/lib/onboarding), so on a shared family phone the elder
// and the son each get their own portal-specific walkthrough.
function useOnboardingGate() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading || !userId) return undefined;
    let cancelled = false;
    getOnboardingKind(userId).then((kind) => {
      if (!cancelled && kind === null) router.push('/onboarding');
    });
    // The session can change under us (sign out, account switch); dropping the
    // late answer stops a stale user's intro from opening over the new one.
    return () => {
      cancelled = true;
    };
  }, [loading, userId, router]);
}

function RootStack() {
  const { colors, isDark } = useTheme();
  const { isComputerMode } = useDisplayMode();
  useNotificationDeepLinks();
  useOnboardingGate();

  return (
    <>
      <WebScrollbarStyle />
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
            {/* Gesture off: the intro's own Skip is the way out, so a stray
                swipe cannot drop a first-time user into an app they have not
                been shown yet. */}
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
            />
            <Stack.Screen name="privacy" options={{ title: '' }} />
            <Stack.Screen name="profile" options={{ title: '' }} />
            <Stack.Screen name="new-post" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="service/[id]" options={{ title: '' }} />
            <Stack.Screen name="activity/[id]" options={{ title: '' }} />
            <Stack.Screen name="post/[id]" options={{ title: '' }} />
            <Stack.Screen name="calendar" options={{ title: '' }} />
            {/* Guardian screens mount <AppHeader /> themselves (same as the tab
                screens) so a direct load of /guardian keeps the bell, language,
                theme and sign-out controls instead of dead-ending. */}
            <Stack.Screen name="guardian/index" options={{ headerShown: false }} />
            <Stack.Screen name="guardian/[parentId]" options={{ headerShown: false }} />
            <Stack.Screen name="guardian/metric" options={{ headerShown: false }} />
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
