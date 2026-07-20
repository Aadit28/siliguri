import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useDisplayMode } from '../context/DisplayModeContext';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';
import { family, font, radius, space } from '../lib/theme';

export default function AppHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { lang, toggle } = useLocale();
  const { displayName, user, signOut } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const { isComputerMode } = useDisplayMode();

  const accountLabel = user ? displayName?.split(' ')[0] || t('common.signOut') : t('common.signIn');
  const navItems = [
    { label: t('tabs.home'), href: '/' },
    { label: t('tabs.services'), href: '/services' },
    { label: t('tabs.assistant'), href: '/assistant' },
    { label: t('tabs.community'), href: '/community' },
    { label: t('tabs.help'), href: '/help' },
  ];
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const confirmSignOut = () => {
    const question = `${t('common.signOut')}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(question)) signOut();
    } else {
      Alert.alert(question, undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.signOut'), style: 'destructive', onPress: () => signOut() },
      ]);
    }
  };

  const AccountButton = (
    <Pressable
      accessibilityRole="button"
      onPress={() => (user ? confirmSignOut() : router.push('/login'))}
      style={({ pressed }) => [styles.accountButton, { borderColor: colors.border }, pressed && styles.pressed]}
    >
      <Text style={[styles.accountText, { color: colors.text }]} numberOfLines={1}>
        {accountLabel}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + space.sm,
          backgroundColor: colors.nav,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={[styles.shell, isComputerMode ? styles.shellDesktop : styles.shellMobile]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('appName')}, ${t('tabs.home')}`}
          onPress={() => router.push('/')}
          style={({ pressed }) => [styles.brandButton, pressed && styles.pressed]}
        >
          <View style={styles.brandCopy}>
            <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>
              {t('appName')}
            </Text>
            {isComputerMode ? (
              <Text style={[styles.brandSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {title ?? t('tagline')}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {isComputerMode ? (
          <View accessibilityRole="tablist" style={styles.desktopNav}>
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Pressable
                  key={item.href}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => router.push(item.href as never)}
                  style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
                >
                  <Text
                    style={[
                      styles.navText,
                      {
                        fontFamily: active ? family.bold : family.medium,
                        color: active ? colors.text : colors.textMuted,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {isComputerMode ? (
          <View style={styles.utilityRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change language"
              onPress={toggle}
              style={({ pressed }) => [styles.utilityButton, { borderColor: colors.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.utilityText, { color: colors.text }]}>{lang === 'hi' ? 'English' : 'हिंदी'}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isDark }}
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onPress={toggleTheme}
              style={({ pressed }) => [styles.utilityButton, { borderColor: colors.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.utilityText, { color: colors.text }]}>{isDark ? 'Light' : 'Dark'}</Text>
            </Pressable>

            <NotificationBell />
            {AccountButton}
          </View>
        ) : (
          <View style={styles.mobileActions}>
            <NotificationBell />
            {AccountButton}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
  },
  shell: {
    width: '100%',
    maxWidth: 1920,
    alignSelf: 'center',
  },
  shellDesktop: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  shellMobile: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  brandButton: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  brandCopy: { minWidth: 0, flexShrink: 1 },
  brandName: { fontFamily: family.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
  brandSubtitle: { maxWidth: 210, marginTop: 1, fontFamily: family.medium, fontSize: font.xs, lineHeight: 18 },
  desktopNav: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  navItem: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { fontSize: font.md },
  utilityRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  utilityButton: {
    minHeight: 44,
    minWidth: 58,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityText: { fontFamily: family.semibold, fontSize: font.xs },
  mobileActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 0 },
  accountButton: {
    minHeight: 44,
    maxWidth: 96,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: { fontFamily: family.semibold, fontSize: font.sm },
  pressed: { opacity: 0.72 },
});
