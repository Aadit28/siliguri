import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { Card, Badge, Stars, Muted, H1, Body } from '../../src/components/ui';
import { AppColors, font, radius, space, shadow } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, serviceEmoji, categoryColor } from '../../src/lib/categories';
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
  const { colors, isDark } = useTheme();
  const { height, width } = useWindowDimensions();
  const resultsMaxHeight = Math.max(width >= 820 ? 420 : 360, Math.round(height * (width >= 820 ? 0.72 : 0.58)));
  const styles = makeStyles(colors, isDark, resultsMaxHeight);

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

  const onPrimary = colors.textOnDark;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.backdropTop} />
      <AppHeader title={t('services.title')} />

      <ScrollView
        ref={pageScrollRef}
        contentContainerStyle={styles.pageScroll}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.directoryHero}>
        <Text style={styles.kicker}>{t('services.directoryKicker')}</Text>
        <H1 style={styles.heroTitle}>{t('services.directoryTitle')}</H1>
        <Body style={styles.heroBody}>{t('services.directoryBody')}</Body>
        <View style={styles.trustRow}>
          {[t('services.trustPhone'), t('services.trustSource'), t('services.trustFamily')].map((item) => (
            <View key={item} style={styles.trustPill}>
              <Text style={styles.trustPillText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.search}
          placeholder={t('services.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <Muted style={styles.searchHint}>{t('services.searchScope')}</Muted>

      <View style={styles.libraryRow}>
        {[
          {
            key: 'favorites' as const,
            label: t('services.favorites'),
            count: favoriteIds.length,
          },
          {
            key: 'recent' as const,
            label: t('services.recentlyViewed'),
            count: recentIds.length,
          },
        ].map((item) => {
          const active = cat === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.libraryCard, active && styles.libraryCardActive]}
              onPress={() => {
                setCat(item.key);
                setQuery('');
                router.setParams({ category: undefined, view: item.key });
              }}
              activeOpacity={0.85}
            >
              {item.key === 'favorites' ? (
                <Feather name="star" size={16} color={active ? colors.accent : colors.textMuted} />
              ) : (
                <Feather name="clock" size={16} color={colors.textMuted} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.libraryLabel, active && { color: onPrimary }]}>{item.label}</Text>
                <Muted style={active ? { color: onPrimary, opacity: 0.76 } : undefined}>
                  {t('services.savedCount', { count: item.count })}
                </Muted>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flexGrow: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroller}
        >
          {[{ key: 'all' as const, emoji: 'All' }, ...SERVICE_CATEGORIES].map((item) => {
            const active = cat === item.key;
            const count =
              item.key === 'all' ? all.length : (categoryCounts[item.key as ServiceCategory] ?? 0);
            const label = `${item.key === 'all' ? t('common.all') : t(`categories.${item.key}`)} (${count})`;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => {
                  const nextCategory = item.key as ServiceCategory | 'all';
                  setCat(nextCategory);
                  setQuery('');
                  router.setParams({
                    category: nextCategory === 'all' ? undefined : nextCategory,
                    view: undefined,
                  });
                }}
                activeOpacity={0.8}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && { color: onPrimary }]}>
                  {item.key === 'all' ? '' : `${item.emoji} `}
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} size="large" />
      ) : filtered.length === 0 ? (
        <Muted style={styles.emptyState}>{t('common.noResults')}</Muted>
      ) : (
        <ScrollView
          ref={resultsScrollRef}
          style={styles.resultsScroller}
          contentContainerStyle={styles.list}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {filtered.map((item) => (
            <Link key={item.id} href={{ pathname: '/service/[id]', params: { id: item.id } }} asChild>
              <TouchableOpacity activeOpacity={0.85}>
                <Card style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: categoryColor(item.category).bg }]}>
                    <Text style={{ fontSize: 28 }}>{serviceEmoji(item.category)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Muted numberOfLines={1} style={styles.address}>
                      {item.address}
                    </Muted>
                    <View style={styles.metaRow}>
                      <Stars rating={item.rating} />
                      {item.verified && <Badge label={t('common.verified')} />}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.starBtn}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      favoriteSet.has(item.id)
                        ? t('services.unstarService', { name: item.name })
                        : t('services.starService', { name: item.name })
                    }
                    onPress={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                  >
                    <Feather
                      name="star"
                      size={20}
                      color={favoriteSet.has(item.id) ? colors.accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                  {item.phone ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('common.call')} ${item.name}`}
                      onPress={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        Linking.openURL(`tel:${item.phone}`);
                      }}
                    >
                      <Text style={[styles.callLabel, { color: onPrimary }]}>{t('common.call')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </Card>
              </TouchableOpacity>
            </Link>
          ))}
        </ScrollView>
      )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isDark: boolean, resultsMaxHeight: number) {
  const onPrimary = colors.textOnDark;

  return StyleSheet.create({
    screen: { flex: 1 },
    pageScroll: { paddingBottom: space.xl },
    backdropTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 220,
      backgroundColor: colors.surfaceTint,
      opacity: isDark ? 0.32 : 0.9,
    },
    directoryHero: {
      margin: space.md,
      marginBottom: 0,
      padding: space.lg,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.cardStrong,
      ...shadow.md,
    },
    kicker: {
      color: colors.accentDark,
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    heroTitle: { marginTop: space.sm, fontSize: font.xl, lineHeight: 34 },
    heroBody: { color: colors.textMuted, marginTop: space.sm, fontSize: font.sm },
    trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md },
    trustPill: {
      borderRadius: radius.pill,
      backgroundColor: colors.primaryTint,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    trustPillText: { color: colors.primaryDark, fontWeight: '900', fontSize: font.xs },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      margin: space.md,
      marginBottom: 0,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      minHeight: 58,
      ...shadow.sm,
    },
    searchIcon: { color: colors.primaryDark, fontSize: 25, fontWeight: '900' },
    search: { flex: 1, fontSize: font.md, color: colors.text, marginLeft: space.sm },
    searchHint: {
      paddingHorizontal: space.lg,
      paddingTop: 6,
      fontSize: font.xs,
    },
    libraryRow: {
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingTop: space.md,
    },
    libraryCard: {
      flex: 1,
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      padding: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.card,
      ...shadow.sm,
    },
    libraryCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    libraryIcon: { color: colors.star, fontSize: 28, fontWeight: '900' },
    libraryLabel: { color: colors.text, fontSize: font.sm, fontWeight: '900' },
    chipScroller: { paddingHorizontal: space.md, paddingVertical: space.sm },
    chip: {
      minHeight: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.sm,
      flexShrink: 0,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary, ...shadow.sm },
    chipText: { fontSize: font.sm, fontWeight: '800', color: colors.primaryDark },
    resultsScroller: { maxHeight: resultsMaxHeight },
    list: { padding: space.md, paddingTop: 0, paddingBottom: space.xl, gap: space.sm },
    loadingIndicator: { marginTop: space.xl, marginBottom: space.xl },
    emptyState: { textAlign: 'center', marginTop: space.xl, marginHorizontal: space.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevron: { fontSize: 30, color: colors.textMuted, fontWeight: '400' },
    callBtn: {
      minWidth: 62,
      minHeight: 58,
      borderRadius: radius.md,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.sm,
    },
    starBtn: {
      width: 42,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    starIcon: { color: colors.textMuted, fontWeight: '700' },
    starIconActive: { color: colors.star },
    callLabel: { fontSize: font.xs, fontWeight: '900' },
    name: { fontSize: font.md, fontWeight: '800', color: colors.text },
    address: { marginTop: 2, fontSize: font.xs },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6 },
  });
}
