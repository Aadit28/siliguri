import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import SiteFooter from '../../src/components/SiteFooter';
import { Badge, Body, Card, H1, Muted, Stars } from '../../src/components/ui';
import {
  AppColors,
  family,
  font,
  radius,
  ROW_MIN_HEIGHT,
  space,
  TAP,
} from '../../src/lib/theme';
import { SERVICE_CATEGORIES, serviceEmoji } from '../../src/lib/categories';
import { fetchServices } from '../../src/lib/api';
import { Service, ServiceCategory } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { useTheme } from '../../src/context/ThemeContext';

type DirectoryView = ServiceCategory | 'all' | 'favorites' | 'recent';

export default function Services() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; view?: string }>();
  const { favoriteIds, favoriteSet, recentIds, toggleFavorite } = useServicePreferences();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const serviceColumnCount = width >= 1060 ? 3 : width >= 720 ? 2 : 1;
  const styles = makeStyles(colors, serviceColumnCount);

  const [all, setAll] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<DirectoryView>((params.category as ServiceCategory) || 'all');
  const pageScrollRef = useRef<ScrollView>(null);

  const resetDirectoryScroll = useCallback(() => {
    requestAnimationFrame(() => {
      pageScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  useEffect(() => {
    fetchServices()
      .then(setAll)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const nextCategory: DirectoryView =
      params.view === 'favorites' || params.view === 'recent'
        ? params.view
        : SERVICE_CATEGORIES.some((item) => item.key === params.category)
          ? (params.category as ServiceCategory)
          : 'all';

    setCat(nextCategory);
    setQuery('');
  }, [params.category, params.view]);

  useEffect(() => {
    resetDirectoryScroll();
  }, [cat, resetDirectoryScroll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recentOrder = new Map(recentIds.map((id, index) => [id, index]));
    const matching = all.filter((s) => {
      const matchCat =
        cat === 'all' ||
        (cat === 'favorites' && favoriteSet.has(s.id)) ||
        (cat === 'recent' && recentOrder.has(s.id)) ||
        s.category === cat;
      const matchQ =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (s.address ?? '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
    return cat === 'recent'
      ? matching.sort(
          (a, b) =>
            (recentOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (recentOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
      : matching;
  }, [all, query, cat, favoriteSet, recentIds]);

  const categoryCounts = useMemo(
    () =>
      all.reduce<Partial<Record<ServiceCategory, number>>>((counts, service) => {
        counts[service.category] = (counts[service.category] ?? 0) + 1;
        return counts;
      }, {}),
    [all],
  );
  const verifiedCount = useMemo(() => all.filter((service) => service.verified).length, [all]);
  const callableCount = useMemo(() => all.filter((service) => Boolean(service.phone)).length, [all]);
  const statTiles = [
    { label: t('common.all'), value: all.length },
    { label: t('common.verified'), value: verifiedCount },
    { label: t('common.call'), value: callableCount },
  ];
  const categoryTiles = [
    { key: 'all' as const, emoji: '', label: t('common.all'), count: all.length },
    ...SERVICE_CATEGORIES.map((item) => ({
      key: item.key,
      emoji: item.emoji,
      label: t(`categories.${item.key}`),
      count: categoryCounts[item.key] ?? 0,
    })),
  ];

  const libraryRows = [
    {
      key: 'favorites' as const,
      icon: 'star' as const,
      label: t('services.favorites'),
      count: favoriteIds.length,
    },
    {
      key: 'recent' as const,
      icon: 'clock' as const,
      label: t('services.recentlyViewed'),
      count: recentIds.length,
    },
  ];

  return (
    <View style={styles.screen}>
      <AppHeader title={t('services.title')} />

      <ScrollView
        ref={pageScrollRef}
        contentContainerStyle={styles.pageScroll}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.catalogHero}>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>{t('services.directoryKicker')}</Text>
            <H1 style={styles.heroTitle}>{t('services.directoryTitle')}</H1>
            <Body style={styles.heroBody}>{t('services.directoryBody')}</Body>
          </View>
          <View style={styles.statGrid}>
            {statTiles.map((item) => (
              <View key={item.label} style={styles.statTile}>
                <Text style={styles.statValue}>{item.value}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.searchPill}>
          <Feather name="search" size={22} color={colors.text} />
          <TextInput
            style={[styles.searchInput, { fontFamily: query ? family.regular : family.semibold }]}
            placeholder={t('services.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setQuery('')}
              hitSlop={space.sm}
              style={({ pressed }) => [styles.searchClear, pressed && styles.searchClearPressed]}
            >
              <Feather name="x" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.quickGrid}>
          {libraryRows.map((item, index) => {
            const active = cat === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setCat(item.key);
                  setQuery('');
                  router.setParams({ category: undefined, view: item.key });
                }}
                style={({ pressed }) => [
                  styles.quickCard,
                  active && styles.quickCardActive,
                  pressed && !active && { backgroundColor: colors.overlay },
                ]}
              >
                <View style={styles.quickIcon}>
                  <Feather name={item.icon} size={20} color={colors.text} />
                </View>
                <View style={styles.quickTextBlock}>
                  <Text style={styles.quickTitle}>{item.label}</Text>
                  <Text style={styles.quickSubtitle}>
                    {t('services.savedCount', { count: item.count })}
                  </Text>
                </View>
                <Feather name="chevron-right" size={22} color={colors.textSubtle} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.browseCategories')}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPillScroller}
          >
            {categoryTiles.map((item) => {
              const active = cat === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    const nextCategory = item.key as ServiceCategory | 'all';
                    setCat(nextCategory);
                    setQuery('');
                    router.setParams({
                      category: nextCategory === 'all' ? undefined : nextCategory,
                      view: undefined,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.categoryPill,
                    active && styles.categoryPillActive,
                    pressed && !active && { backgroundColor: colors.overlay },
                  ]}
                >
                  {item.emoji ? <Text style={styles.categoryPillEmoji}>{item.emoji}</Text> : null}
                  <Text style={styles.categoryPillText} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <View style={styles.categoryPillCountBadge}>
                    <Text style={styles.categoryPillCount}>{item.count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} size="large" />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyDisc}>
              <Feather name="search" size={28} color={colors.textMuted} />
            </View>
            <Muted style={styles.emptyText}>{t('common.noResults')}</Muted>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((item) => {
              const isFavorite = favoriteSet.has(item.id);
              const meta = [t(`categories.${item.category}`), item.address]
                .filter(Boolean)
                .join(' · ');
              return (
                <View
                  key={`${cat}-${item.id}`}
                  style={styles.resultPressable}
                >
                  <Card style={styles.resultCard}>
                    <View style={styles.profileHead}>
                      <View style={styles.leadingBlock}>
                        <Text style={styles.leadingEmoji}>{serviceEmoji(item.category)}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isFavorite }}
                        accessibilityLabel={
                          isFavorite
                            ? t('services.unstarService', { name: item.name })
                            : t('services.starService', { name: item.name })
                        }
                        onPress={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleFavorite(item.id);
                        }}
                        style={({ pressed }) => [
                          styles.favoriteBtn,
                          pressed && { backgroundColor: colors.overlay },
                        ]}
                      >
                        <Feather
                          name="star"
                          size={20}
                          color={isFavorite ? colors.accent : colors.textSubtle}
                        />
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.name}
                      onPress={() => router.push({ pathname: '/service/[id]', params: { id: item.id } })}
                      style={({ pressed }) => [
                        styles.serviceInfoPressable,
                        pressed && { backgroundColor: colors.overlay },
                      ]}
                    >
                      <Text style={styles.serviceName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.serviceMeta} numberOfLines={2}>
                        {meta}
                      </Text>
                      <View style={styles.ratingRow}>
                        <Stars rating={item.rating} />
                        {item.verified && <Badge label={t('common.verified')} />}
                      </View>
                    </Pressable>
                    <View style={styles.profileSpacer} />
                    <View style={styles.ctaRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t('services.about')} ${item.name}`}
                        onPress={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          router.push({ pathname: '/service/[id]', params: { id: item.id } });
                        }}
                        style={({ pressed }) => [
                          styles.aboutPill,
                          {
                            backgroundColor: pressed ? colors.overlay : colors.surfaceTint,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Feather name="info" size={17} color={colors.text} />
                        <Text style={styles.aboutLabel}>{t('services.about')}</Text>
                      </Pressable>
                      {item.phone ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t('common.call')} ${item.name}`}
                          onPress={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            Linking.openURL(`tel:${item.phone}`);
                          }}
                          style={({ pressed }) => [
                            styles.callPill,
                            {
                              backgroundColor: pressed ? colors.primaryDark : colors.primary,
                              borderColor: pressed ? colors.primaryDark : colors.primary,
                            },
                          ]}
                        >
                          <Feather name="phone" size={18} color={colors.primaryFg} />
                          <Text style={styles.callLabel}>{t('common.call')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                </View>
              );
            })}
          </View>
        )}
        <SiteFooter services={all} />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, serviceColumnCount: number) {
  const isThreeColumn = serviceColumnCount === 3;
  const isSingleColumn = serviceColumnCount === 1;
  const serviceCardWidth = isThreeColumn ? '32.55%' : isSingleColumn ? '100%' : '47.2%';

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    pageScroll: {
      flexGrow: 1,
      paddingBottom: 0,
    },

    catalogHero: {
      paddingHorizontal: space.md,
      paddingTop: space.lg,
      paddingBottom: space.md,
      flexDirection: isThreeColumn ? 'row' : 'column',
      alignItems: isThreeColumn ? 'flex-end' : 'stretch',
      justifyContent: 'space-between',
      gap: space.md,
      backgroundColor: colors.bg,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
      maxWidth: 760,
    },
    kicker: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      lineHeight: Math.round(font.xs * 1.4),
    },
    heroTitle: { marginTop: space.xs },
    heroBody: { marginTop: space.sm, color: colors.textMuted },
    statGrid: {
      flexDirection: 'row',
      gap: space.sm,
      width: isThreeColumn ? 360 : '100%',
    },
    statTile: {
      flex: 1,
      minHeight: 76,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: 'center',
      paddingHorizontal: space.sm,
      paddingVertical: space.sm,
    },
    statValue: {
      color: colors.text,
      fontSize: font.xl,
      fontFamily: family.bold,
      lineHeight: Math.round(font.xl * 1.1),
      textAlign: 'center',
    },
    statLabel: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.xs * 1.35),
      textAlign: 'center',
    },

    searchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      height: TAP,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      paddingHorizontal: 20,
      marginHorizontal: space.md,
      marginTop: space.lg,
    },
    searchInput: {
      flex: 1,
      fontSize: font.md,
      color: colors.text,
      paddingVertical: 0,
    },
    searchClear: {
      width: 44,
      height: 44,
      marginRight: -space.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchClearPressed: { backgroundColor: colors.overlay },
    quickGrid: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: space.md,
      marginTop: space.md,
      flexWrap: isThreeColumn ? 'nowrap' : 'wrap',
    },
    quickCard: {
      flex: isThreeColumn ? 1 : undefined,
      width: isThreeColumn ? undefined : '100%',
      minHeight: ROW_MIN_HEIGHT,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: space.md,
    },
    quickCardActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    quickIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickTextBlock: { flex: 1, minWidth: 0 },
    quickTitle: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
    },
    quickSubtitle: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
    },

    categorySection: {
      marginHorizontal: space.md,
      marginTop: space.lg,
    },
    sectionHeader: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: space.md,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: font.lg,
      fontFamily: family.bold,
      lineHeight: Math.round(font.lg * 1.25),
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.xs * 1.35),
    },
    categoryPillScroller: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: space.xs,
      paddingBottom: space.sm,
    },
    categoryPill: {
      minHeight: 48,
      maxWidth: 270,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      paddingHorizontal: space.md,
      paddingVertical: 9,
    },
    categoryPillActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    categoryPillEmoji: {
      width: 24,
      fontSize: 18,
      lineHeight: 22,
      textAlign: 'center',
    },
    categoryPillText: {
      flexShrink: 1,
      color: colors.text,
      fontSize: font.sm,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.sm * 1.3),
    },
    categoryPillCountBadge: {
      minWidth: 28,
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    categoryPillCount: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.bold,
      lineHeight: Math.round(font.xs * 1.1),
      textAlign: 'center',
    },

    loadingIndicator: { marginTop: space.xl, marginBottom: space.xl },

    emptyState: {
      alignItems: 'center',
      gap: space.md,
      marginTop: space.xl,
      marginBottom: space.xl,
      paddingHorizontal: space.md,
    },
    emptyDisc: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: { textAlign: 'center' },

    list: {
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.xl,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    resultPressable: {
      width: serviceCardWidth,
      minWidth: 0,
    },
    resultCard: {
      minHeight: isSingleColumn ? 0 : isThreeColumn ? 218 : 210,
      height: isSingleColumn ? undefined : '100%',
      padding: isThreeColumn ? space.sm : 12,
    },
    serviceInfoPressable: {
      borderRadius: radius.md,
      marginHorizontal: -space.xs,
      marginTop: space.sm,
      paddingHorizontal: space.xs,
      paddingBottom: space.xs,
    },

    profileHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    leadingBlock: {
      width: isSingleColumn ? 58 : isThreeColumn ? 48 : 50,
      height: isSingleColumn ? 58 : isThreeColumn ? 48 : 50,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadingEmoji: { fontSize: isSingleColumn ? 30 : isThreeColumn ? 26 : 27 },
    serviceName: {
      color: colors.text,
      fontSize: isThreeColumn ? font.sm : font.sm,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.sm * 1.3),
    },
    serviceMeta: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.regular,
      lineHeight: Math.round(font.xs * 1.45),
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: 8,
      minHeight: 26,
    },
    profileSpacer: { flex: 1, minHeight: 8 },
    favoriteBtn: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -space.xs,
      marginRight: -space.xs,
    },

    ctaRow: {
      flexDirection: isSingleColumn ? 'column' : 'row',
      alignItems: 'stretch',
      gap: isSingleColumn ? 8 : 8,
      marginTop: isSingleColumn ? 12 : 10,
    },
    aboutPill: {
      flex: 1,
      minWidth: 0,
      width: isSingleColumn ? '100%' : undefined,
      minHeight: isSingleColumn ? 38 : 36,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    aboutLabel: {
      color: colors.text,
      fontSize: font.xs,
      fontFamily: family.semibold,
    },
    callPill: {
      flex: 1,
      minWidth: 0,
      width: isSingleColumn ? '100%' : undefined,
      minHeight: isSingleColumn ? 42 : 36,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    callLabel: {
      color: colors.primaryFg,
      fontSize: font.xs,
      fontFamily: family.bold,
    },
  });
}
