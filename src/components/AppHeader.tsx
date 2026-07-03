import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, radius, space, shadow } from '../lib/theme';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDisplayMode } from '../context/DisplayModeContext';
import { HELPLINE_NUMBER } from '../lib/config';

export default function AppHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { lang, toggle } = useLocale();
  const { displayName, user, signOut } = useAuth();
  const { colors, mode, isDark, toggleTheme } = useTheme();
  const { isComputerMode, toggleDisplayMode } = useDisplayMode();
  const router = useRouter();
  const pathname = usePathname();
  const showNav = isComputerMode;
  const accountLabel = displayName?.split(' ')[0] || t('common.signOut');
  const navItems = [
    { label: t('tabs.home'), href: '/' },
    { label: t('tabs.services'), href: '/services' },
    { label: t('tabs.assistant'), href: '/assistant' },
    { label: t('tabs.community'), href: '/community' },
    { label: t('tabs.help'), href: '/help' },
  ];
  const isActiveNav = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <BlurView
      intensity={isDark ? 64 : 48}
      tint={mode === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + space.sm,
          backgroundColor: colors.nav,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => router.push('/')}
          accessibilityRole="header"
          style={styles.brandWrap}
        >
          <Text style={[styles.brand, { color: colors.text }]} numberOfLines={1}>
            {t('appName')}
          </Text>
          <Text style={[styles.brandSub, { color: colors.textMuted }]} numberOfLines={1}>
            {title ?? t('tagline')}
          </Text>
        </TouchableOpacity>

        {showNav ? (
          <View style={styles.navLinks}>
            {navItems.map((item) => (
              <TouchableOpacity
                key={item.href}
                onPress={() => router.push(item.href as any)}
                activeOpacity={0.75}
                style={[
                  styles.navLink,
                  isActiveNav(item.href) && {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    { color: isActiveNav(item.href) ? colors.primaryDark : colors.textMuted },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={toggle}
            style={[styles.iconBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Change language"
          >
            <Text style={[styles.iconText, { color: colors.text }]}>
              {lang === 'hi' ? 'EN' : 'हिं'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.iconBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: isDark }}
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Feather name="sun" size={20} color={colors.text} />
            ) : (
              <Feather name="moon" size={20} color={colors.text} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleDisplayMode}
            style={[styles.iconBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: isComputerMode }}
            accessibilityLabel={
              isComputerMode ? 'Switch to phone view' : 'Switch to computer view'
            }
          >
            {isComputerMode ? (
              <Feather name="smartphone" size={20} color={colors.text} />
            ) : (
              <Feather name="monitor" size={20} color={colors.text} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${HELPLINE_NUMBER}`)}
            style={[styles.helpBtn, { backgroundColor: colors.danger }]}
            accessibilityRole="button"
            accessibilityLabel={t('help.callNow')}
          >
            <Text style={[styles.helpText, { color: colors.textOnDark }]}>
              {showNav ? t('help.title') : 'Call'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => (user ? signOut() : router.push('/login'))}
            style={[styles.authBtn, { backgroundColor: colors.primaryTint, borderColor: colors.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.authText, { color: colors.primaryDark }]} numberOfLines={1}>
              {user ? accountLabel : t('common.signIn')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    overflow: 'hidden',
    ...shadow.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  brandWrap: { flex: 1, minWidth: 0 },
  brand: { fontSize: font.lg, fontWeight: '900' },
  brandSub: { fontSize: font.xs, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6 },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: space.md,
  },
  navLink: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.sm,
  },
  navLinkText: { fontSize: font.sm, fontWeight: '800' },
  iconBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconText: { fontWeight: '900', fontSize: font.sm },
  helpBtn: {
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    ...shadow.sm,
  },
  helpText: { fontWeight: '900', fontSize: font.xs },
  authBtn: {
    height: 40,
    maxWidth: 84,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  authText: { fontWeight: '900', fontSize: font.xs },
});
