import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { Badge, Card, Chip, H1, Muted, Stars } from '../../src/components/ui';
import { AppColors, family, font, radius, space, TAB_BAR_CLEARANCE, TAP } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, serviceSearchAliases } from '../../src/lib/categories';
import { fetchServices, toggleFavorite as toggleFavoriteRemote } from '../../src/lib/api';
import { Service, ServiceCategory } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { canUseWhatsApp, openWhatsAppCall, openWhatsAppChat, whatsappChatUrl } from '../../src/lib/whatsapp';

type DirectoryView = ServiceCategory | 'all' | 'favorites' | 'recent';

const SERVICE_QUERY_ALIASES: Record<string, string[]> = {
  'medical store': ['medical shop', 'pharmacy'],
  'medicine store': ['medical shop', 'pharmacy'],
  chemist: ['medical shop', 'pharmacy'],
  'wheel chair': ['wheelchair'],
  pluber: ['plumber'],
  plummer: ['plumber'],
  plumbers: ['plumber'],
  electricians: ['electrician', 'electrical'],
  electricans: ['electrician', 'electrical'],
  electrican: ['electrician', 'electrical'],
  electroicoams: ['electrician', 'electrical'],
  electronician: ['electrician', 'electrical'],
  'civil help': ['civic help', 'daily service'],
  'civil services': ['civic help', 'daily service'],
};

export default function Services() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; view?: string }>();
  const { favoriteSet, recentIds, toggleFavorite } = useServicePreferences();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const styles = makeStyles(colors, isWide);

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
    const queryTerms = expandServiceQuery(q);
    const recentOrder = new Map(recentIds.map((id, index) => [id, index]));
    const matching = all.filter((s) => {
      const matchCat =
        cat === 'all' ||
        (cat === 'favorites' && favoriteSet.has(s.id)) ||
        (cat === 'recent' && recentOrder.has(s.id)) ||
        s.category === cat;
      const searchText = [
        s.name,
        s.description,
        s.address,
        s.town,
        s.service_area,
        t(`categories.${s.category}`),
        ...serviceSearchAliases(s.category),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchQ = !q || queryTerms.some((term) => searchText.includes(term));
      return matchCat && matchQ;
    });
    return cat === 'recent'
      ? matching.sort(
          (a, b) =>
            (recentOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (recentOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
      : matching;
  }, [all, query, cat, favoriteSet, recentIds, t]);

  // localStorage is the offline source of truth; when signed in, mirror the
  // toggle to Supabase so the Home "saved" stat matches, reverting on failure.
  const handleToggleFavorite = useCallback(
    (serviceId: string) => {
      const wasFav = favoriteSet.has(serviceId);
      toggleFavorite(serviceId);
      if (user) {
        toggleFavoriteRemote(serviceId, user.id, wasFav).catch((error) => {
          console.warn('[Saathi] favorite sync failed:', (error as Error).message);
          toggleFavorite(serviceId);
        });
      }
    },
    [favoriteSet, toggleFavorite, user],
  );

  const trustedCount = useMemo(() => filtered.filter((service) => service.verified).length, [filtered]);
  const phoneCount = useMemo(() => filtered.filter((service) => service.phone_confirmed).length, [filtered]);

  const activeLabel =
    cat === 'all'
      ? t('common.all')
      : cat === 'favorites'
        ? t('services.favorites')
        : cat === 'recent'
          ? t('services.recentlyViewed')
          : t(`categories.${cat}`);

  const directoryViews: Array<{ key: DirectoryView; label: string; count?: number }> = [
    { key: 'all', label: t('common.all'), count: all.length },
    {
      key: 'favorites',
      label: t('services.favorites'),
      count: all.filter((service) => favoriteSet.has(service.id)).length,
    },
    { key: 'recent', label: t('services.recentlyViewed'), count: recentIds.length },
    ...SERVICE_CATEGORIES.map((item) => ({
      key: item.key as DirectoryView,
      label: t(`categories.${item.key}`),
      count: all.filter((service) => service.category === item.key).length,
    })),
  ];

  const chooseView = (nextCategory: DirectoryView) => {
    setCat(nextCategory);
    setQuery('');
    router.setParams({
      category:
        nextCategory === 'all' || nextCategory === 'favorites' || nextCategory === 'recent'
          ? undefined
          : nextCategory,
      view: nextCategory === 'favorites' || nextCategory === 'recent' ? nextCategory : undefined,
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader title={t('services.title')} />

      <ScrollView
        ref={pageScrollRef}
        contentContainerStyle={styles.pageScroll}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <H1 style={styles.heroTitle}>{t('services.directoryTitle')}</H1>
          <Muted style={styles.heroBody}>{t('services.directoryBody')}</Muted>
        </View>

        <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.cardStrong }]}>
          <Feather name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={`${t('common.search')} ${t('tabs.services').toLowerCase()}`}
            placeholderTextColor={colors.textSubtle}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={t('common.search')}
            returnKeyType="search"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRail}
          contentContainerStyle={styles.filterRailContent}
        >
          {directoryViews.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              count={item.count}
              active={cat === item.key}
              onPress={() => chooseView(item.key)}
            />
          ))}
        </ScrollView>

        <View style={styles.resultBar}>
          <Text style={styles.resultCount}>
            {activeLabel} · {filtered.length} {filtered.length === 1 ? 'service' : 'services'}
          </Text>
          {!loading ? (
            <Muted numberOfLines={1} style={styles.resultMeta}>
              {trustedCount} {t('common.verified').toLowerCase()} · {phoneCount} {t('services.trustPhone').toLowerCase()}
            </Muted>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} size="large" />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('common.noResults')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((item) => (
              <ServiceRow
                key={item.id}
                item={item}
                isSaved={favoriteSet.has(item.id)}
                onToggleSaved={() => handleToggleFavorite(item.id)}
                onOpen={() => router.push({ pathname: '/service/[id]', params: { id: item.id } })}
                colors={colors}
                styles={styles}
                t={t}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ServiceRow({
  item,
  isSaved,
  onToggleSaved,
  onOpen,
  colors,
  styles,
  t,
}: {
  item: Service;
  isSaved: boolean;
  onToggleSaved: () => void;
  onOpen: () => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const showWhatsApp = canUseWhatsApp(item.phone);
  const showContactActions = Boolean(item.phone_confirmed && showWhatsApp);
  const whatsappUrl = whatsappChatUrl(item.phone);

  // Role-less Pressable renders a div on web — the row contains real buttons
  // (save, WhatsApp, call) and nesting them inside a <button> is invalid DOM.
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => (pressed ? { opacity: 0.86 } : null)}>
      <Card style={styles.row}>
        <View style={styles.rowTop}>
          <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <ServiceGlyph category={item.category} color={colors.text} size={22} />
          </View>
          <View style={styles.rowCopy}>
            <View style={styles.rowNameLine}>
              <Text style={styles.rowName} numberOfLines={2}>
                {item.name}
              </Text>
              {item.verified ? <Badge label={t('common.verified')} /> : null}
            </View>
            <Muted numberOfLines={1} style={styles.rowMeta}>
              {item.town ? `${item.town} · ` : ''}
              {item.address}
            </Muted>
            <View style={styles.rowSignalRow}>
              <Stars rating={item.rating} />
              <Muted style={styles.categoryTag} numberOfLines={1}>
                {t(`categories.${item.category}`)}
              </Muted>
            </View>
          </View>
          <TouchableOpacity
            style={styles.saveBtn}
            accessibilityRole="button"
            accessibilityLabel={
              isSaved ? t('services.unstarService', { name: item.name }) : t('services.starService', { name: item.name })
            }
            onPress={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSaved();
            }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Feather name="star" size={20} color={isSaved ? colors.accent : colors.textSubtle} />
          </TouchableOpacity>
        </View>

        <View style={styles.rowActions}>
          {showContactActions && whatsappUrl ? (
            Platform.OS === 'web' ? (
              <Link
                href={whatsappUrl as never}
                target="_blank"
                rel="noopener noreferrer"
                style={[styles.whatsappLinkBtn, { backgroundColor: colors.whatsapp, color: colors.whatsappText }]}
                accessibilityRole="link"
                accessibilityLabel={`WhatsApp ${item.name}`}
                onPress={(event) => {
                  event.stopPropagation();
                }}
              >
                WhatsApp
              </Link>
            ) : (
              <TouchableOpacity
                style={[styles.whatsappBtn, { backgroundColor: colors.whatsapp }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${item.name}`}
                onPress={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openWhatsAppChat(item.phone);
                }}
              >
                <Feather name="message-circle" size={18} color={colors.whatsappText} />
                <Text numberOfLines={1} style={[styles.whatsappLabel, { color: colors.whatsappText }]}>
                  WhatsApp
                </Text>
              </TouchableOpacity>
            )
          ) : null}

          {showContactActions ? (
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('common.call')} ${item.name} on WhatsApp`}
              onPress={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openWhatsAppCall(item.phone);
              }}
            >
              <Feather name="phone" size={18} color={colors.primaryFg} />
              <Text style={[styles.callLabel, { color: colors.primaryFg }]}>{t('common.call')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.aboutBtn, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
              <Feather name="info" size={16} color={colors.textMuted} />
              <Text style={[styles.aboutLabel, { color: colors.textMuted }]}>{t('services.about')}</Text>
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

function expandServiceQuery(query: string) {
  if (!query) return [];
  return Array.from(new Set([query, ...(SERVICE_QUERY_ALIASES[query] ?? [])]));
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    pageScroll: {
      width: '100%',
      maxWidth: 1120,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: isWide ? space.xl * 2 : TAB_BAR_CLEARANCE,
      gap: space.lg,
    },
    hero: { gap: space.xs },
    heroTitle: { fontFamily: family.medium, fontSize: isWide ? 38 : 30, lineHeight: isWide ? 45 : 37 },
    heroBody: { maxWidth: 640 },
    searchRow: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
    },
    searchInput: {
      flex: 1,
      height: TAP,
      fontFamily: family.medium,
      fontSize: font.md,
    },
    // Single-line rail bleeding to the screen edge; counts live inside the chips.
    filterRail: {
      marginHorizontal: isWide ? -space.xl : -space.md,
    },
    filterRailContent: {
      paddingHorizontal: isWide ? space.xl : space.md,
    },
    resultBar: { gap: 2 },
    resultCount: { color: colors.text, fontFamily: family.semibold, fontSize: font.md },
    resultMeta: { fontFamily: family.regular, fontSize: font.xs },
    loadingIndicator: { marginVertical: space.xl },
    emptyState: { paddingVertical: space.xl, alignItems: 'center' },
    emptyTitle: { color: colors.text, fontFamily: family.semibold, fontSize: font.lg },
    list: { gap: space.md },
    row: { gap: space.md },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
    },
    rowIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowCopy: { flex: 1, minWidth: 0, gap: 4 },
    rowNameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
    rowName: { color: colors.text, fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.25 },
    rowMeta: { fontFamily: family.regular, fontSize: font.xs },
    rowSignalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
    categoryTag: { fontFamily: family.regular, fontSize: font.xs },
    saveBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    whatsappBtn: {
      minHeight: TAP,
      minWidth: 130,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
    },
    whatsappLinkBtn: {
      minWidth: 130,
      height: TAP,
      lineHeight: TAP,
      borderRadius: radius.md,
      fontFamily: family.semibold,
      fontSize: font.sm,
      textAlign: 'center',
      paddingHorizontal: space.md,
      overflow: 'hidden',
      flexShrink: 0,
    },
    whatsappLabel: { fontFamily: family.semibold, fontSize: font.sm },
    callBtn: {
      minHeight: TAP,
      minWidth: 110,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
    },
    callLabel: { fontFamily: family.semibold, fontSize: font.sm },
    aboutBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: space.md,
    },
    aboutLabel: { fontFamily: family.semibold, fontSize: font.sm },
  });
}
