import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, font } from '../../src/lib/theme';

function icon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: font.xs, fontWeight: '700', paddingBottom: 4 },
        tabBarStyle: { height: 68, paddingTop: 6, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: icon('🏠') }}
      />
      <Tabs.Screen
        name="services"
        options={{ title: t('tabs.services'), tabBarIcon: icon('🩺') }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: t('tabs.community'), tabBarIcon: icon('💬') }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: t('tabs.help'), tabBarIcon: icon('🆘') }}
      />
    </Tabs>
  );
}
