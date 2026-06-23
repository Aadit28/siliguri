import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, font, radius, space, shadow } from '../lib/theme';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { HELPLINE_NUMBER } from '../lib/config';

export default function AppHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { lang, toggle } = useLocale();
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => router.push('/')}
          accessibilityRole="header"
          style={styles.brandWrap}
        >
          <Text style={styles.brand} numberOfLines={1}>
            🪔 {title ?? t('appName')}
          </Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          {/* Language toggle */}
          <TouchableOpacity
            onPress={toggle}
            style={styles.langBtn}
            accessibilityRole="button"
            accessibilityLabel="Change language"
          >
            <Text style={styles.langText}>{lang === 'hi' ? 'EN' : 'हिं'}</Text>
          </TouchableOpacity>

          {/* Helpline quick-dial */}
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${HELPLINE_NUMBER}`)}
            style={styles.helpBtn}
            accessibilityRole="button"
            accessibilityLabel={t('help.callNow')}
          >
            <Text style={styles.helpText}>☎ 24/7</Text>
          </TouchableOpacity>

          {/* Auth */}
          <TouchableOpacity
            onPress={() => (user ? signOut() : router.push('/login'))}
            style={styles.authBtn}
            accessibilityRole="button"
          >
            <Text style={styles.authText}>{user ? t('common.signOut') : t('common.signIn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    ...shadow.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandWrap: { flexShrink: 1, marginRight: space.sm },
  brand: { color: '#fff', fontSize: font.lg, fontWeight: '800', letterSpacing: -0.3 },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  langBtn: {
    minWidth: 44,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    marginRight: space.sm,
  },
  langText: { color: '#fff', fontWeight: '800', fontSize: font.sm },
  helpBtn: {
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    marginRight: space.sm,
    ...shadow.sm,
  },
  helpText: { color: '#fff', fontWeight: '800', fontSize: font.sm },
  authBtn: {
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  authText: { color: '#fff', fontWeight: '800', fontSize: font.xs },
});
