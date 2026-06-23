import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Card, H1, H2, Body, Muted, Stars } from '../../src/components/ui';
import { colors, font, radius, space, shadow } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, categoryColor, serviceEmoji } from '../../src/lib/categories';
import { fetchServices } from '../../src/lib/api';
import { Service } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { displayName } = useAuth();
  const [featured, setFeatured] = useState<Service[]>([]);

  useEffect(() => {
    fetchServices().then((all) => {
      const top = [...all]
        .filter((s) => s.verified)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 8);
      setFeatured(top.length ? top : all.slice(0, 8));
    });
  }, []);

  const quick = [
    {
      emoji: '🩺',
      label: t('home.quickServices'),
      go: '/services',
      color: colors.primary,
      soft: colors.primarySoft,
    },
    {
      emoji: '💬',
      label: t('home.quickCommunity'),
      go: '/community',
      color: colors.accentDark,
      soft: colors.accentSoft,
    },
    {
      emoji: '🆘',
      label: t('home.quickHelp'),
      go: '/help',
      color: colors.danger,
      soft: colors.dangerSoft,
    },
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

        {/* Search — routes into the directory */}
        <TouchableOpacity
          style={styles.search}
          activeOpacity={0.85}
          accessibilityRole="search"
          onPress={() => router.push('/services')}
        >
          <Text style={{ fontSize: font.md }}>🔍</Text>
          <Text style={styles.searchText}>{t('services.searchPlaceholder')}</Text>
        </TouchableOpacity>

        {/* Trust banner */}
        <View style={styles.trust}>
          <Text style={styles.trustText}>🛡️  {t('home.trustBanner')}</Text>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {quick.map((q) => (
            <TouchableOpacity
              key={q.go}
              style={styles.quick}
              onPress={() => router.push(q.go as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.quickIcon, { backgroundColor: q.soft }]}>
                <Text style={styles.quickEmoji}>{q.emoji}</Text>
              </View>
              <Text style={[styles.quickLabel, { color: q.color }]}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Elder care homes — flagship section */}
        <TouchableOpacity
          style={styles.elderCard}
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: '/services', params: { category: 'elder_home' } })}
        >
          <Text style={{ fontSize: 44 }}>🏡</Text>
          <Text style={styles.elderTitle}>{t('home.elderTitle')}</Text>
          <Text style={styles.elderBody}>{t('home.elderBody')}</Text>
          <View style={styles.elderCta}>
            <Text style={styles.elderCtaText}>{t('home.elderCta')} →</Text>
          </View>
        </TouchableOpacity>

        {/* Top rated — horizontal rail */}
        {featured.length > 0 ? (
          <>
            <View style={styles.railHeader}>
              <H2>{t('home.topRated')}</H2>
              <TouchableOpacity onPress={() => router.push('/services')} activeOpacity={0.7}>
                <Text style={styles.seeAll}>{t('home.seeAll')} →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: space.xs, paddingRight: space.md }}
            >
              {featured.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.railCard}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/service/${s.id}`)}
                >
                  <View style={[styles.railIcon, { backgroundColor: categoryColor(s.category).bg }]}>
                    <Text style={{ fontSize: 26 }}>{serviceEmoji(s.category)}</Text>
                  </View>
                  <Text style={styles.railName} numberOfLines={2}>
                    {s.name}
                  </Text>
                  {s.town ? (
                    <Muted numberOfLines={1} style={{ fontSize: font.xs, marginTop: 2 }}>
                      📍 {s.town}
                    </Muted>
                  ) : null}
                  <View style={styles.railMeta}>
                    <Stars rating={s.rating} />
                    {s.verified ? <Text style={styles.railVerified}>✓ {t('common.verified')}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Categories */}
        <H2 style={{ marginTop: space.lg, marginBottom: space.sm }}>
          {t('home.browseCategories')}
        </H2>
        <View style={styles.catGrid}>
          {SERVICE_CATEGORIES.map((c) => {
            const cc = categoryColor(c.key);
            return (
              <TouchableOpacity
                key={c.key}
                style={styles.cat}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/services', params: { category: c.key } })}
              >
                <View style={[styles.catIcon, { backgroundColor: cc.bg }]}>
                  <Text style={styles.catEmoji}>{c.emoji}</Text>
                </View>
                <Text style={styles.catLabel}>{t(`categories.${c.key}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Help card */}
        <Card style={styles.helpCard}>
          <H2 style={{ color: colors.dangerDark }}>{t('home.needHelpTitle')}</H2>
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    minHeight: 56,
    marginTop: space.md,
    ...shadow.sm,
  },
  searchText: { fontSize: font.md, color: colors.textMuted },
  trust: {
    marginTop: space.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  trustText: { color: colors.success, fontWeight: '800', fontSize: font.sm },
  quickRow: { flexDirection: 'row', marginTop: space.md, gap: space.sm },
  quick: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    ...shadow.sm,
  },
  quickIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEmoji: { fontSize: 28 },
  quickLabel: {
    fontWeight: '800',
    fontSize: font.xs,
    marginTop: space.sm,
    textAlign: 'center',
  },
  elderCard: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: space.lg,
    ...shadow.md,
  },
  elderTitle: { color: '#fff', fontSize: font.xl, fontWeight: '800', marginTop: space.sm, letterSpacing: -0.4 },
  elderBody: { color: '#D6E5F8', fontSize: font.md, marginTop: 6, lineHeight: font.md * 1.4 },
  elderCta: {
    marginTop: space.md,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    minHeight: 54,
    paddingHorizontal: space.lg,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  elderCtaText: { color: colors.primaryDark, fontWeight: '800', fontSize: font.md },
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  seeAll: { color: colors.primary, fontWeight: '800', fontSize: font.sm },
  railCard: {
    width: 180,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginRight: space.sm,
    ...shadow.sm,
  },
  railIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  railName: { fontSize: font.sm, fontWeight: '800', color: colors.text, lineHeight: font.sm * 1.3 },
  railMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  railVerified: { color: colors.success, fontWeight: '800', fontSize: font.xs },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cat: {
    width: '31.5%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: space.md,
    ...shadow.sm,
  },
  catIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catEmoji: { fontSize: 30 },
  catLabel: {
    marginTop: 8,
    fontSize: font.xs,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  helpCard: {
    marginTop: space.lg,
    backgroundColor: colors.dangerSoft,
    borderColor: '#F2C9C3',
  },
  helpCta: {
    marginTop: space.md,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  helpCtaText: { color: '#fff', fontWeight: '800', fontSize: font.md },
});
