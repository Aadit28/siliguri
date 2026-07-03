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
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import AppHeader from '../../src/components/AppHeader';
import { Badge, Body, Card, Chip, H1, Muted, Stars } from '../../src/components/ui';
import {
  AppColors,
  family,
  font,
  motion,
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

const EASE_OUT_QUART = Easing.bezier(...motion.easeOutQuart);
const STAGGER_MS = 40;
const STAGGER_CAP = 6;

function cardEntering(index: number) {
  return FadeInDown.duration(motion.dur.base)
    .easing(EASE_OUT_QUART.factory())
    .delay(Math.min(index, STAGGER_CAP - 1) * STAGGER_MS)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
    .reduceMotion(ReduceMotion.System);
}

export default function Services() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; view?: string }>();
  const { favoriteIds, favoriteSet, recentIds, toggleFavorite } = useServicePreferences();
  const { colors } = useTheme();
  const { height, width } = useWindowDimensions();
  const resultsMaxHeight = Math.max(
    width >= 820 ? 420 : 360,
    Math.round(height * (width >= 820 ? 0.72 : 0.58)),
  );
  const styles = makeStyles(colors, resultsMaxHeight);

  const [all, setAll] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<DirectoryView>((params.category as ServiceCategory) || 'all');
  const pageScrollRef = useRef<ScrollView>(null);
  const resultsScrollRef = useRef<ScrollView>(null);

  const resetDirectoryScroll = useCallback(() => {
    requestAnimationFrame(() => {
      pageScrollRef.current?.scrollTo({ y: 0, animated: false });
      resultsScrollRef.current?.scrollTo({ y: 0, animated: false });
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
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>{t('services.directoryKicker')}</Text>
          <H1 style={styles.heroTitle}>{t('services.directoryTitle')}</H1>
          <Body style={styles.heroBody}>{t('services.directoryBody')}</Body>
          <View style={styles.trustRow}>
            {[t('services.trustPhone'), t('services.trustSource'), t('services.trustFamily')].map(
              (item) => (
                <View key={item} style={styles.trustPill}>
                  <Feather name="check" size={14} color={colors.textMuted} />
                  <Text style={styles.trustPillText}>{item}</Text>
                </View>
              ),
            )}
          </View>
        </View>

        {/* Search pill (Uber sunk surface) */}
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
        <Muted style={styles.searchHint}>{t('services.searchScope')}</Muted>

        {/* Library rows (Uber list anatomy) */}
        <View style={styles.libraryList}>
          {libraryRows.map((item, index) => {
            const active = cat === item.key;
            return (
              <React.Fragment key={item.key}>
                {index > 0 ? <View style={styles.libraryDivider} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setCat(item.key);
                    setQuery('');
                    router.setParams({ category: undefined, view: item.key });
                  }}
                  style={({ pressed }) => [
                    styles.libraryRow,
                    active && styles.libraryRowActive,
                    pressed && !active && { backgroundColor: colors.overlay },
                  ]}
                >
                  <View style={styles.libraryDisc}>
                    <Feather name={item.icon} size={20} color={colors.text} />
                  </View>
                  <View style={styles.libraryTextBlock}>
                    <Text style={styles.libraryTitle}>{item.label}</Text>
                    <Text style={styles.librarySubtitle}>
                      {t('services.savedCount', { count: item.count })}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={22} color={colors.textSubtle} />
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>

        {/* Category chips */}
        <View style={styles.chipSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroller}
          >
            {[{ key: 'all' as const, emoji: undefined }, ...SERVICE_CATEGORIES].map((item) => {
              const count =
                item.key === 'all' ? all.length : (categoryCounts[item.key as ServiceCategory] ?? 0);
              const label = `${item.key === 'all' ? t('common.all') : t(`categories.${item.key}`)} (${count})`;
              return (
                <Chip
                  key={item.key}
                  label={label}
                  emoji={item.emoji}
                  active={cat === item.key}
                  onPress={() => {
                    const nextCategory = item.key as ServiceCategory | 'all';
                    setCat(nextCategory);
                    setQuery('');
                    router.setParams({
                      category: nextCategory === 'all' ? undefined : nextCategory,
                      view: undefined,
                    });
                  }}
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Results */}
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
          <ScrollView
            ref={resultsScrollRef}
            style={styles.resultsScroller}
            contentContainerStyle={styles.list}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {filtered.map((item, index) => {
              const isFavorite = favoriteSet.has(item.id);
              const meta = [t(`categories.${item.category}`), item.address]
                .filter(Boolean)
                .join(' · ');
              return (
                <Animated.View key={`${cat}-${item.id}`} entering={cardEntering(index)}>
                  <Link
                    href={{ pathname: '/service/[id]', params: { id: item.id } }}
                    asChild
                  >
                    <Pressable style={({ pressed }) => (pressed ? styles.cardPressed : null)}>
                      <Card>
                        <View style={styles.cardTopRow}>
                          <View style={styles.leadingBlock}>
                            <Text style={styles.leadingEmoji}>{serviceEmoji(item.category)}</Text>
                          </View>
                          <View style={styles.cardTextBlock}>
                            <Text style={styles.serviceName} numberOfLines={2}>
                              {item.name}
                            </Text>
                            <Text style={styles.serviceMeta} numberOfLines={1}>
                              {meta}
                            </Text>
                            <View style={styles.ratingRow}>
                              <Stars rating={item.rating} />
                              {item.verified && <Badge label={t('common.verified')} />}
                            </View>
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
                        {item.phone ? (
                          <View style={styles.ctaRow}>
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
                                { backgroundColor: pressed ? colors.accentDark : colors.accent },
                              ]}
                            >
                              <Feather name="phone" size={20} color={colors.accentFg} />
                              <Text style={styles.callLabel}>{t('common.call')}</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </Card>
                    </Pressable>
                  </Link>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, resultsMaxHeight: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    pageScroll: { paddingBottom: space.xl },

    hero: {
      paddingHorizontal: space.md,
      paddingTop: space.sm,
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
    trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
    trustPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    trustPillText: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: Math.round(font.xs * 1.4),
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
    searchHint: {
      marginTop: 6,
      paddingHorizontal: space.md + 20,
      fontSize: font.xs,
      lineHeight: Math.round(font.xs * 1.4),
    },

    libraryList: { marginTop: space.lg },
    libraryRow: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: space.md,
    },
    libraryRowActive: { backgroundColor: colors.cardStrong },
    libraryDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    libraryTextBlock: { flex: 1, minWidth: 0 },
    libraryTitle: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
    },
    librarySubtitle: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
    },
    libraryDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: space.md + 44 + 12,
    },

    chipSection: { flexGrow: 0, marginTop: space.md },
    chipScroller: { paddingHorizontal: space.md, paddingVertical: space.sm },

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

    resultsScroller: { maxHeight: resultsMaxHeight },
    list: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xl, gap: 12 },
    cardPressed: { transform: [{ scale: 0.97 }] },

    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    leadingBlock: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadingEmoji: { fontSize: 32 },
    cardTextBlock: { flex: 1, minWidth: 0 },
    serviceName: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
    },
    serviceMeta: {
      marginTop: space.xs,
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
    },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6 },
    favoriteBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      marginTop: -space.xs,
      marginRight: -space.xs,
    },

    ctaRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    callPill: {
      flex: 1,
      height: 48,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
    },
    callLabel: {
      color: colors.accentFg,
      fontSize: font.sm,
      fontFamily: family.bold,
    },
  });
}
