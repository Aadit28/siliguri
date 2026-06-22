import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, font, radius, space } from '../lib/theme';
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
        <TouchableOpacity onPress={() => router.push('/')} accessibilityRole="header">
          <Text style={styles.brand}>🪔 {title ?? t('appName')}</Text>
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
    paddingBottom: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  langBtn: {
    minWidth: 44,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
  },
  helpText: { color: '#fff', fontWeight: '800', fontSize: font.sm },
  authBtn: {
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  authText: { color: '#fff', fontWeight: '700', fontSize: font.xs },
});
