import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useDisplayMode } from '../context/DisplayModeContext';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { EMERGENCY_PRIMARY_NUMBER } from '../lib/config';
import { font, radius, shadow, space } from '../lib/theme';

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

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + space.sm,
          backgroundColor: colors.cardStrong,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={[styles.shell, isComputerMode ? styles.shellDesktop : styles.shellMobile]}>
        <View style={styles.primaryRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('appName')}, ${t('tabs.home')}`}
            onPress={() => router.push('/')}
            style={({ pressed }) => [styles.brandButton, pressed && styles.pressed]}
          >
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
              <Text style={styles.brandLetter}>S</Text>
            </View>
            <View style={styles.brandCopy}>
              <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>
                {t('appName')}
              </Text>
              <Text style={[styles.brandSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {title ?? t('tagline')}
              </Text>
            </View>
          </Pressable>

          {!isComputerMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('help.callEmergency112')}
              onPress={() => Linking.openURL(`tel:${EMERGENCY_PRIMARY_NUMBER}`)}
              style={({ pressed }) => [styles.sosButton, { backgroundColor: colors.emergency }, pressed && styles.pressed]}
            >
              <Text style={styles.sosText}>SOS 112</Text>
            </Pressable>
          ) : null}
        </View>

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
                  style={({ pressed }) => [
                    styles.navItem,
                    {
                      backgroundColor: active ? colors.primarySoft : 'transparent',
                      borderColor: active ? colors.primarySoft : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.navText, { color: active ? colors.primaryDark : colors.textMuted }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.utilityRow, !isComputerMode && styles.utilityRowMobile]}>
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

          {isComputerMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('help.callEmergency112')}
              onPress={() => Linking.openURL(`tel:${EMERGENCY_PRIMARY_NUMBER}`)}
              style={({ pressed }) => [styles.sosButton, { backgroundColor: colors.emergency }, pressed && styles.pressed]}
            >
              <Text style={styles.sosText}>SOS 112</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => (user ? signOut() : router.push('/login'))}
            style={({ pressed }) => [
              styles.accountButton,
              { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.accountText, { color: colors.primaryDark }]} numberOfLines={1}>
              {accountLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    ...shadow.sm,
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
  shellMobile: { gap: space.sm },
  primaryRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  brandButton: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: { color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  brandCopy: { minWidth: 0, flexShrink: 1 },
  brandName: { fontSize: 21, lineHeight: 25, fontWeight: '800', letterSpacing: -0.3 },
  brandSubtitle: { maxWidth: 210, marginTop: 1, fontSize: font.xs, lineHeight: 18, fontWeight: '500' },
  desktopNav: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  navItem: {
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { fontSize: font.sm, fontWeight: '700' },
  utilityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  utilityRowMobile: { justifyContent: 'space-between' },
  utilityButton: {
    minHeight: 46,
    minWidth: 58,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityText: { fontSize: font.xs, fontWeight: '700' },
  sosButton: {
    minHeight: 48,
    minWidth: 92,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosText: { color: '#FFFFFF', fontSize: font.sm, fontWeight: '800' },
  accountButton: {
    minHeight: 46,
    minWidth: 84,
    maxWidth: 120,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: { fontSize: font.xs, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
