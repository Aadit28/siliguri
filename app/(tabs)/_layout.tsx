import React from 'react';
import { ColorValue, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { family, font } from '../../src/lib/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

function NavIcon({ name, color }: { name: FeatherName; color: ColorValue }) {
  return <Feather name={name} size={24} color={color} />;
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
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: [
          styles.tabBar,
          {
            display: isComputerMode ? 'none' : 'flex',
            backgroundColor: colors.nav,
            borderTopColor: colors.border,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <NavIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t('tabs.services'),
          tabBarIcon: ({ color }) => <NavIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('tabs.assistant'),
          tabBarIcon: ({ color }) => <NavIcon name="message-circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('tabs.community'),
          tabBarLabel: lang === 'hi' ? 'पूछें' : 'Ask',
          tabBarIcon: ({ color }) => <NavIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('tabs.help'),
          tabBarIcon: ({ color }) => <NavIcon name="help-circle" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: 72,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
  },
  item: { minHeight: 56 },
  label: { fontFamily: family.medium, fontSize: font.xs, lineHeight: 16 },
});
