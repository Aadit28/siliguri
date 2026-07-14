import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { Body, H1, Muted } from '../../src/components/ui';
import { AppColors, font, radius, shadow, space } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, categoryColor, serviceSearchAliases } from '../../src/lib/categories';
import { fetchServices } from '../../src/lib/api';
import { Service, ServiceCategory } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
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
  const { colors, isDark } = useTheme();
  const { height, width } = useWindowDimensions();
  const isWide = width >= 920;
  const resultsMaxHeight = Math.max(isWide ? 560 : 440, Math.round(height * (isWide ? 0.78 : 0.62)));
  const styles = makeStyles(colors, isDark, isWide, resultsMaxHeight);

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
    { key: 'favorites', label: t('services.favorites'), count: favoriteSet.size },
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
      <View style={styles.stageGlow} />
      <AppHeader title={t('services.title')} />

      <ScrollView
        ref={pageScrollRef}
        contentContainerStyle={styles.pageScroll}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.directoryHero}>
          <View style={styles.heroCopy}>
            <Text style={styles.kickerOnDark}>{t('services.directoryKicker')}</Text>
            <H1 style={styles.heroTitle}>{t('services.directoryTitle')}</H1>
            <Body style={styles.heroBody}>{t('services.directoryBody')}</Body>
          </View>
          <View style={styles.searchPanel}>
            <Text style={styles.searchLabel}>{t('common.search')}</Text>
            <TextInput
              style={styles.search}
              placeholder={`${t('common.search')} ${t('tabs.services').toLowerCase()}`}
              placeholderTextColor={colors.textSubtle}
              value={query}
              onChangeText={setQuery}
            />
            <Text style={styles.searchScope}>{t('services.searchScope')}</Text>
          </View>
        </View>

        <View style={styles.directoryShell}>
          <View style={styles.filterRail}>
            <View style={styles.filterHeader}>
              <Text style={styles.kicker}>{t('services.trustChecklist')}</Text>
              <Text style={styles.filterTitle}>{activeLabel}</Text>
            </View>
            <View style={styles.filterList}>
              {directoryViews.map((item) => {
                const active = cat === item.key;
                const tone =
                  item.key === 'favorites' || item.key === 'recent' || item.key === 'all'
                    ? colors.primary
                    : categoryColor(item.key as ServiceCategory).fg;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.filterButton, active && styles.filterButtonActive]}
                    onPress={() => chooseView(item.key)}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.filterSignal, { backgroundColor: active ? '#fff' : tone }]} />
                    <Text style={[styles.filterText, active && styles.filterTextActive]} numberOfLines={2}>
                      {item.label}
                    </Text>
                    {typeof item.count === 'number' ? (
                      <Text style={[styles.filterCount, active && styles.filterCountActive]}>{item.count}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.resultDeck}>
            {!loading ? (
              <View style={styles.resultBar}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.resultCount}>
                    {filtered.length} {filtered.length === 1 ? 'service' : 'services'}
                  </Text>
                  <Muted numberOfLines={1} style={styles.resultScope}>
                    {trustedCount} {t('common.verified').toLowerCase()} - {phoneCount} {t('services.trustPhone').toLowerCase()}
                  </Muted>
                </View>
                <View style={styles.resultBadge}>
                  <Text style={styles.resultBadgeText}>{activeLabel}</Text>
                </View>
              </View>
            ) : null}

            {loading ? (
              <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} size="large" />
            ) : filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{t('common.noResults')}</Text>
                <Muted>{t('services.searchScope')}</Muted>
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
                {filtered.map((item) => (
                  <ServiceTicket
                    key={item.id}
                    item={item}
                    isSaved={favoriteSet.has(item.id)}
                    onToggleSaved={() => toggleFavorite(item.id)}
                    onOpen={() => router.push({ pathname: '/service/[id]', params: { id: item.id } })}
                    colors={colors}
                    isDark={isDark}
                    styles={styles}
                    t={t}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ServiceTicket({
  item,
  isSaved,
  onToggleSaved,
  onOpen,
  colors,
  isDark,
  styles,
  t,
}: {
  item: Service;
  isSaved: boolean;
  onToggleSaved: () => void;
  onOpen: () => void;
  colors: AppColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const tone = categoryColor(item.category);
  const showWhatsApp = canUseWhatsApp(item.phone);
  const showContactActions = Boolean(item.phone_confirmed && showWhatsApp);
  const whatsappUrl = whatsappChatUrl(item.phone);
  const onPrimary = isDark ? colors.textOnDark : '#fff';

  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onOpen}>
      <View style={styles.ticket}>
        <View style={[styles.ticketStripe, { backgroundColor: tone.fg }]} />
        <View style={styles.ticketTop}>
          <View style={[styles.ticketIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <ServiceGlyph category={item.category} color={tone.fg} size={22} />
          </View>
          <View style={styles.ticketCopy}>
            <Text
              style={[
                styles.categoryTag,
                {
                  backgroundColor: tone.bg,
                  borderColor: tone.border,
                  color: tone.fg,
                },
              ]}
              numberOfLines={1}
            >
              {t(`categories.${item.category}`)}
            </Text>
            <Text style={styles.ticketName} numberOfLines={2}>
              {item.name}
            </Text>
            <Muted numberOfLines={1} style={styles.ticketAddress}>
              {item.town ? `${item.town} - ` : ''}
              {item.address}
            </Muted>
          </View>
        </View>

        <View style={styles.trustRow}>
          <Text style={styles.trustPill}>
            {item.verified ? t(`services.verificationStatus.${item.verification_status ?? 'source_linked'}`) : t('services.unverified')}
          </Text>
          {item.phone_confirmed ? <Text style={styles.trustPill}>{t('services.trustPhone')}</Text> : null}
        </View>

        <View style={styles.ticketActions}>
          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={
              isSaved ? t('services.unstarService', { name: item.name }) : t('services.starService', { name: item.name })
            }
            onPress={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSaved();
            }}
          >
            <Text style={[styles.saveText, isSaved && { color: colors.star }]}>
              {isSaved ? t('common.saved') : t('common.save')}
            </Text>
          </TouchableOpacity>

          {showContactActions && whatsappUrl ? (
            Platform.OS === 'web' ? (
              <Link
                href={whatsappUrl as never}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.whatsappLinkBtn}
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
                style={styles.whatsappBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${item.name}`}
                onPress={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openWhatsAppChat(item.phone);
                }}
              >
                <Text numberOfLines={1} style={styles.whatsappLabel}>
                  WhatsApp
                </Text>
              </TouchableOpacity>
            )
          ) : null}

          {showContactActions ? (
            <TouchableOpacity
              style={styles.callBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('common.call')} ${item.name} on WhatsApp`}
              onPress={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openWhatsAppCall(item.phone);
              }}
            >
              <Text style={[styles.callLabel, { color: onPrimary }]}>{t('common.call')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.detailBtn}>
              <Text style={styles.detailLabel}>{t('services.about')}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function expandServiceQuery(query: string) {
  if (!query) return [];
  return Array.from(new Set([query, ...(SERVICE_QUERY_ALIASES[query] ?? [])]));
}

function makeStyles(colors: AppColors, isDark: boolean, isWide: boolean, resultsMaxHeight: number) {
  return StyleSheet.create({
    screen: { flex: 1 },
    stageGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 360,
      backgroundColor: isDark ? colors.frame : colors.surfaceTint,
    },
    pageScroll: {
      width: '100%',
      maxWidth: 1240,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: isWide ? space.xl * 2 : 118,
      gap: space.lg,
    },
    directoryHero: {
      minHeight: isWide ? 276 : undefined,
      flexDirection: isWide ? 'row' : 'column',
      gap: space.lg,
      borderRadius: radius.xl,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isWide ? space.xl : space.lg,
      ...shadow.md,
    },
    heroCopy: { flex: 1.1, justifyContent: 'center', gap: space.sm },
    kickerOnDark: {
      color: colors.primary,
      fontSize: font.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: colors.text,
      fontSize: isWide ? 42 : 32,
      lineHeight: isWide ? 49 : 39,
    },
    heroBody: { color: colors.textMuted, maxWidth: 650 },
    searchPanel: {
      flex: isWide ? 0.85 : undefined,
      minHeight: 168,
      borderRadius: radius.lg,
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.lg,
      justifyContent: 'center',
      gap: space.sm,
    },
    searchLabel: { color: colors.primaryDark, fontSize: font.xs, fontWeight: '800', textTransform: 'uppercase' },
    search: {
      minHeight: 58,
      borderRadius: radius.lg,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space.md,
      color: colors.text,
      fontSize: isWide ? font.md : font.sm,
      fontWeight: '700',
    },
    searchScope: { color: colors.textMuted, fontSize: font.xs, lineHeight: 19, fontWeight: '600' },
    directoryShell: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.lg,
      alignItems: 'flex-start',
    },
    filterRail: {
      width: isWide ? 312 : '100%',
      borderRadius: 14,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.md,
      gap: space.md,
      ...shadow.sm,
    },
    filterHeader: { gap: 4 },
    kicker: {
      color: colors.accentDark,
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    filterTitle: { color: colors.text, fontSize: font.lg, lineHeight: 26, fontWeight: '800' },
    filterList: {
      flexDirection: isWide ? 'column' : 'row',
      flexWrap: isWide ? 'nowrap' : 'wrap',
      gap: 8,
    },
    filterButton: {
      minHeight: 50,
      flexBasis: isWide ? undefined : '47%',
      flexGrow: isWide ? 0 : 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      paddingHorizontal: space.sm,
      paddingVertical: 8,
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterSignal: {
      width: 9,
      height: 9,
      borderRadius: 4,
    },
    filterText: { flex: 1, minWidth: 0, color: colors.text, fontSize: font.sm, lineHeight: 19, fontWeight: '700' },
    filterTextActive: { color: '#fff' },
    filterCount: { color: colors.textMuted, fontSize: font.xs, fontWeight: '900' },
    filterCountActive: { color: 'rgba(255,255,255,0.78)' },
    resultDeck: {
      flex: 1,
      width: isWide ? undefined : '100%',
      borderRadius: 14,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow.sm,
    },
    resultBar: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      padding: space.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    resultCount: { color: colors.text, fontSize: font.lg, lineHeight: 26, fontWeight: '900' },
    resultScope: { fontSize: font.xs, marginTop: 2 },
    resultBadge: {
      maxWidth: isWide ? 220 : 132,
      minHeight: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    resultBadgeText: { color: colors.primaryDark, fontSize: font.xs, fontWeight: '900' },
    loadingIndicator: { marginVertical: space.xl },
    emptyState: { padding: space.xl, gap: space.sm },
    emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '900' },
    resultsScroller: { maxHeight: resultsMaxHeight },
    list: {
      padding: space.md,
      gap: space.md,
    },
    ticket: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.md,
      gap: space.sm,
      ...shadow.sm,
    },
    ticketStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 7,
    },
    ticketTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      paddingLeft: 4,
    },
    ticketIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ticketCopy: { flex: 1, minWidth: 0, gap: 5 },
    categoryTag: {
      alignSelf: 'flex-start',
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: font.xs,
      fontWeight: '900',
      overflow: 'hidden',
    },
    ticketName: { color: colors.text, fontSize: font.lg, lineHeight: 27, fontWeight: '800' },
    ticketAddress: { fontSize: font.xs, lineHeight: 18 },
    trustRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingLeft: 4,
    },
    trustPill: {
      borderRadius: radius.md,
      backgroundColor: colors.chipBg,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.primaryDark,
      paddingHorizontal: 9,
      paddingVertical: 5,
      fontSize: font.xs,
      fontWeight: '900',
      overflow: 'hidden',
    },
    ticketActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingLeft: 4,
    },
    saveBtn: {
      minWidth: 78,
      minHeight: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    saveText: { color: colors.primaryDark, fontSize: font.xs, fontWeight: '900' },
    whatsappBtn: {
      minWidth: 104,
      minHeight: 42,
      borderRadius: radius.md,
      backgroundColor: colors.whatsapp,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    whatsappLinkBtn: {
      minWidth: 104,
      height: 42,
      lineHeight: 42,
      borderRadius: radius.md,
      backgroundColor: colors.whatsapp,
      color: colors.whatsappText,
      fontSize: font.xs,
      fontWeight: '900',
      textAlign: 'center',
      paddingHorizontal: space.sm,
      overflow: 'hidden',
      flexShrink: 0,
    },
    whatsappLabel: { color: colors.whatsappText, fontSize: font.xs, fontWeight: '900' },
    callBtn: {
      minWidth: 82,
      minHeight: 42,
      borderRadius: radius.md,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    callLabel: { fontSize: font.xs, fontWeight: '900' },
    detailBtn: {
      minWidth: 86,
      minHeight: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardStrong,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    detailLabel: { color: colors.primaryDark, fontSize: font.xs, fontWeight: '900' },
  });
}
