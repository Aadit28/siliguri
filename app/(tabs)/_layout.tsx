import React from 'react';
import { type ColorValue } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font } from '../../src/lib/theme';
import { useTheme } from '../../src/context/ThemeContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';

function icon(name: React.ComponentProps<typeof Feather>['name']) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Feather name={name} size={22} color={color as string} style={{ opacity: focused ? 1 : 0.6 }} />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isComputerMode } = useDisplayMode();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: font.xs, fontWeight: '700', paddingBottom: 4 },
        tabBarStyle: isComputerMode
          ? { display: 'none' }
          : {
              height: 68,
              paddingTop: 6,
              borderTopColor: colors.border,
              backgroundColor: colors.nav,
            },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: icon('home') }}
      />
      <Tabs.Screen
        name="services"
        options={{ title: t('tabs.services'), tabBarIcon: icon('grid') }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: t('tabs.assistant'), tabBarIcon: icon('message-circle') }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: t('tabs.community'), tabBarIcon: icon('users') }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: t('tabs.help'), tabBarIcon: icon('help-circle') }}
      />
    </Tabs>
  );
}
