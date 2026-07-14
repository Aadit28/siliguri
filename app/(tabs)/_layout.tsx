import React from 'react';
import { ColorValue, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { font } from '../../src/lib/theme';

function NavIcon({ label, color }: { label: string; color: ColorValue }) {
  return <Text style={[styles.icon, { color }]}>{label}</Text>;
}

export default function AppSectionLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isComputerMode } = useDisplayMode();
  const { lang } = useLocale();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: [
          styles.tabBar,
          {
            display: isComputerMode ? 'none' : 'flex',
            backgroundColor: colors.cardStrong,
            borderTopColor: colors.border,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <NavIcon label="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t('tabs.services'),
          tabBarIcon: ({ color }) => <NavIcon label="⌕" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('tabs.assistant'),
          tabBarIcon: ({ color }) => <NavIcon label="✦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('tabs.community'),
          tabBarLabel: lang === 'hi' ? 'पूछें' : 'Ask',
          tabBarIcon: ({ color }) => <NavIcon label="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('tabs.help'),
          tabBarActiveTintColor: colors.emergency,
          tabBarIcon: ({ color }) => <NavIcon label="!" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: 72,
    borderTopWidth: 1,
    paddingTop: 7,
    paddingBottom: 7,
    boxShadow: '0 -5px 18px rgba(18, 34, 31, 0.08)',
  },
  item: { minHeight: 56 },
  icon: { fontSize: 22, lineHeight: 24, fontWeight: '800' },
  label: { fontSize: font.xs, lineHeight: 16, fontWeight: '700' },
});
