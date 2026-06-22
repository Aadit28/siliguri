import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Card, H1, H2, Body, Muted } from '../../src/components/ui';
import { colors, font, radius, space } from '../../src/lib/theme';
import { SERVICE_CATEGORIES } from '../../src/lib/categories';
import { useAuth } from '../../src/context/AuthContext';

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { displayName } = useAuth();

  const quick = [
    { emoji: '🩺', label: t('home.quickServices'), go: '/services', color: colors.primary },
    { emoji: '💬', label: t('home.quickCommunity'), go: '/community', color: colors.accent },
    { emoji: '🆘', label: t('home.quickHelp'), go: '/help', color: colors.danger },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xl }}>
        <H1>
          {t('home.greeting')}
          {displayName ? `, ${displayName}` : ''} 🙏
        </H1>
        <Muted style={{ fontSize: font.md, marginTop: 4 }}>{t('home.subtitle')}</Muted>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {quick.map((q) => (
            <TouchableOpacity
              key={q.go}
              style={[styles.quick, { backgroundColor: q.color }]}
              onPress={() => router.push(q.go as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.quickEmoji}>{q.emoji}</Text>
              <Text style={styles.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Categories */}
        <H2 style={{ marginTop: space.lg, marginBottom: space.sm }}>
          {t('home.browseCategories')}
        </H2>
        <View style={styles.catGrid}>
          {SERVICE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.cat}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/services', params: { category: c.key } })}
            >
              <Text style={styles.catEmoji}>{c.emoji}</Text>
              <Text style={styles.catLabel}>{t(`categories.${c.key}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Help card */}
        <Card style={{ marginTop: space.lg, backgroundColor: '#FFF4F4', borderColor: '#F3C9C9' }}>
          <H2 style={{ color: colors.danger }}>{t('home.needHelpTitle')}</H2>
          <Body style={{ marginTop: 4 }}>{t('home.needHelpBody')}</Body>
          <TouchableOpacity
            style={styles.helpCta}
            onPress={() => router.push('/help')}
            activeOpacity={0.85}
          >
            <Text style={styles.helpCtaText}>☎ {t('home.quickHelp')}</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: 'row', marginTop: space.lg, gap: space.sm },
  quick: {
    flex: 1,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  quickEmoji: { fontSize: 30 },
  quickLabel: { color: '#fff', fontWeight: '800', fontSize: font.sm },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cat: {
    width: '31%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: space.md,
  },
  catEmoji: { fontSize: 34 },
  catLabel: {
    marginTop: 6,
    fontSize: font.xs,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  helpCta: {
    marginTop: space.md,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCtaText: { color: '#fff', fontWeight: '800', fontSize: font.md },
});
