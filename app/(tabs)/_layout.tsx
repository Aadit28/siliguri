import React from 'react';
import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font } from '../../src/lib/theme';
import { useTheme } from '../../src/context/ThemeContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';

function icon(mark: string) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Text
      style={{
        color,
        fontSize: mark.length > 1 ? 18 : 22,
        opacity: focused ? 1 : 0.55,
        fontWeight: '900',
      }}
    >
      {mark}
    </Text>
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
        tabBarActiveTintColor: colors.primary,
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
        options={{ title: t('tabs.home'), tabBarIcon: icon('H') }}
      />
      <Tabs.Screen
        name="services"
        options={{ title: t('tabs.services'), tabBarIcon: icon('+') }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: t('tabs.assistant'), tabBarIcon: icon('AI') }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: t('tabs.community'), tabBarIcon: icon('C') }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: t('tabs.help'), tabBarIcon: icon('!') }}
      />
    </Tabs>
  );
}
