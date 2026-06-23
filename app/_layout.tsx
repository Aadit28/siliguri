import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../src/lib/i18n';
import { AuthProvider } from '../src/context/AuthContext';
import { LocaleProvider } from '../src/context/LocaleContext';
import { colors } from '../src/lib/theme';

// Phone-first: keep the app in a centered, phone-width column on any screen so
// it never stretches wide on a desktop/tablet browser.
const PHONE_MAX_WIDTH = 480;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocaleProvider>
          <StatusBar style="light" />
          <View style={styles.gutter}>
            <View style={styles.phone}>
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
            </View>
          </View>
        </LocaleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  gutter: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#D7DEE8', // soft frame around the phone column on wide screens
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: PHONE_MAX_WIDTH,
    backgroundColor: colors.bg,
  },
});
