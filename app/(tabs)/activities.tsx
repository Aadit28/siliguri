import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Badge, Button, Card, Chip, H1, Muted } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useCity } from '../../src/context/CityContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import {
  ACTIVITY_CATEGORIES,
  ActivityCategory,
  PreviewActivity,
  localizeActivity,
} from '../../src/data/mockActivities';
import { activityCatalogStatus, listActivities } from '../../src/lib/activities';
import { listFamilyLinks } from '../../src/lib/family';
import type { Lang } from '../../src/lib/languages';
import type { ActivitySession } from '../../src/lib/types';
import {
  AppColors,
  PastelName,
  family,
  font,
  pastelForMode,
  radius,
  space,
  TAB_BAR_CLEARANCE,
  TAP,
} from '../../src/lib/theme';

type ActivityFilter = 'all' | ActivityCategory;
type FeatherName = React.ComponentProps<typeof Feather>['name'];

const CATEGORY_ICONS: Record<ActivityCategory, FeatherName> = {
  yoga: 'sunrise',
  fitness: 'activity',
  learning: 'book-open',
  creative: 'edit-3',
  social: 'users',
  wellness: 'heart',
};

const CATEGORY_TONES: Record<ActivityCategory, PastelName> = {
  yoga: 'lilac',
  fitness: 'sage',
  learning: 'sky',
  creative: 'peach',
  social: 'rose',
  wellness: 'butter',
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function upcomingSession(activity: PreviewActivity) {
  const now = Date.now();
  return activity.sessions
    .filter((session) => session.status === 'scheduled' && Date.parse(session.startsAt) >= now)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0];
}

function formatSession(session: ActivitySession | undefined, lang: Lang) {
  if (!session) return null;
  const date = new Date(session.startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(`${lang}-IN`, { ...options, timeZone: session.timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(`${lang}-IN`, options).format(date);
  }
}

function localizedTitle(activity: PreviewActivity, lang: Lang) {
  return activity.catalogSource === 'preview'
    ? localizeActivity(activity, lang, 'title')
    : activity.title;
}

function localizedDescription(activity: PreviewActivity, lang: Lang) {
  return activity.catalogSource === 'preview'
    ? localizeActivity(activity, lang, 'description')
    : activity.description ?? '';
}

export default function ActivitiesScreen() {
  const params = useLocalSearchParams<{
    participantId?: string | string[];
    participantName?: string | string[];
  }>();
  const participantId = firstParam(params.participantId);
  const router = useRouter();
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { session } = useAuth();
  const { city } = useCity();
  const { colors, mode } = useTheme();
  const { isComputerMode } = useDisplayMode();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ActivityFilter>('all');
  const [activities, setActivities] = useState<PreviewActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [usingPreview, setUsingPreview] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const token = session?.access_token;

  const columns = isComputerMode && width >= 1180 ? 3 : isComputerMode && width >= 760 ? 2 : 1;
  const isWide = isComputerMode && width >= 920;
  const styles = makeStyles(colors, isWide, columns);
  const tones = pastelForMode(mode);

  useEffect(() => {
    let active = true;
    setParticipantName(null);
    if (!token || !participantId) return () => { active = false; };
    listFamilyLinks(token)
      .then(({ asGuardian }) => {
        if (!active) return;
        const link = asGuardian.find(
          (item) => item.parentId === participantId && item.status === 'active',
        );
        setParticipantName(link?.parentName || link?.parentPhone || null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [participantId, token]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setLoadFailed(false);
      listActivities(token, participantId, city)
        .then((nextActivities) => {
          if (!active) return;
          setActivities(nextActivities);
          setUsingPreview(activityCatalogStatus.source === 'preview');
        })
        .catch(() => {
          if (!active) return;
          setActivities([]);
          setUsingPreview(false);
          setLoadFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [city, participantId, refreshKey, token]),
  );

  const categoryCounts = useMemo(
    () =>
      ACTIVITY_CATEGORIES.reduce<Record<ActivityCategory, number>>(
        (counts, item) => {
          counts[item] = activities.filter((activity) => activity.category === item).length;
          return counts;
        },
        { yoga: 0, fitness: 0, learning: 0, creative: 0, social: 0, wellness: 0 },
      ),
    [activities],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return activities.filter((activity) => {
      if (category !== 'all' && activity.category !== category) return false;
      if (!needle) return true;

      const searchable = [
        activity.title,
        activity.description,
        activity.instructorName,
        activity.venueName,
        activity.address,
        activity.town,
        localizeActivity(activity, 'hi', 'title'),
        localizeActivity(activity, 'hi', 'description'),
        t(`activities.categories.${activity.category}`),
        activity.languages.join(' '),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return searchable.includes(needle);
    });
  }, [activities, category, query, t]);

  const openActivity = (activity: PreviewActivity) => {
    router.push({
      pathname: '/activity/[id]',
      params: {
        id: activity.id,
        ...(participantId ? { participantId } : {}),
        ...(participantName ? { participantName } : {}),
      },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.pageOuter}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <AppHeader title={t('activities.title')} />

        <View style={styles.pageScroll}>
          <View style={styles.hero}>
            <Muted style={styles.eyebrow}>{t('activities.eyebrow')}</Muted>
            <H1 style={styles.heroTitle}>{t('activities.heroTitle')}</H1>
            <Muted style={styles.heroBody}>{t('activities.subtitle')}</Muted>
          </View>

          {participantName ? (
            <View style={[styles.participantBanner, { backgroundColor: colors.infoSoft }]}>
              <Feather name="user-check" size={22} color={colors.info} />
              <Text style={[styles.participantText, { color: colors.text }]}>
                {t('activities.forParticipant', { name: participantName })}
              </Text>
            </View>
          ) : null}

          {usingPreview ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.previewBanner,
                { backgroundColor: colors.warningBg, borderColor: colors.warningText },
              ]}
            >
              <Feather name="info" size={24} color={colors.warningText} />
              <View style={styles.bannerCopy}>
                <Text style={[styles.bannerTitle, { color: colors.warningText }]}>
                  {t('activities.previewBannerTitle')}
                </Text>
                <Text style={[styles.bannerBody, { color: colors.warningText }]}>
                  {t('activities.previewBannerBody')}
                </Text>
              </View>
            </View>
          ) : null}

          {loadFailed ? (
            <Card style={[styles.loadError, { backgroundColor: colors.warningBg }]}>
              <Feather name="wifi-off" size={22} color={colors.warningText} />
              <Text style={[styles.loadErrorText, { color: colors.warningText }]}>
                {t('activities.loadError')}
              </Text>
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => setRefreshKey((value) => value + 1)}
              />
            </Card>
          ) : null}

          <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.cardStrong }]}>
            <Feather
              name="search"
              size={21}
              color={colors.textMuted}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <TextInput
              accessibilityLabel={t('activities.searchPlaceholder')}
              clearButtonMode="while-editing"
              placeholder={t('activities.searchPlaceholder')}
              placeholderTextColor={colors.textSubtle}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text }]}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <View style={styles.filterRailWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRailContent}
            >
              <Chip
                active={category === 'all'}
                count={activities.length}
                label={t('common.all')}
                onPress={() => setCategory('all')}
              />
              {ACTIVITY_CATEGORIES.map((item) => (
                <Chip
                  key={item}
                  active={category === item}
                  count={categoryCounts[item]}
                  label={t(`activities.categories.${item}`)}
                  onPress={() => setCategory(item)}
                />
              ))}
            </ScrollView>
          </View>

          {!loading ? (
            <Text style={[styles.resultCount, { color: colors.text }]}>
              {t('activities.resultCount', { count: filtered.length, total: activities.length })}
            </Text>
          ) : null}

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.bgAlt }]}>
                <Feather name="search" size={28} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('activities.emptyTitle')}</Text>
              <Muted style={styles.emptyBody}>{t('activities.emptyBody')}</Muted>
            </View>
          ) : (
            <View style={styles.cardList}>
              {filtered.map((activity) => {
                const tone = tones[CATEGORY_TONES[activity.category]];
                const isPreview = activity.catalogSource === 'preview';
                const nextSession = upcomingSession(activity);
                const joined = activity.enrollment?.status === 'joined';
                const waitlisted = activity.enrollment?.status === 'waitlisted';
                const title = localizedTitle(activity, lang);
                const description = localizedDescription(activity, lang);
                return (
                  <Pressable
                    key={activity.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}. ${t('activities.viewDetails')}`}
                    onPress={() => openActivity(activity)}
                    style={({ pressed }) => [
                      styles.card,
                      { backgroundColor: colors.bgAlt },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.cardTop}>
                      <View style={[styles.categoryIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                        <Feather name={CATEGORY_ICONS[activity.category]} size={24} color={tone.fg} />
                      </View>
                      <Text style={[styles.categoryLabel, { color: colors.textMuted }]}>
                        {t(`activities.categories.${activity.category}`)}
                      </Text>
                    </View>

                    <View style={styles.cardCopy}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>
                        {title}
                      </Text>
                      <Muted numberOfLines={3} style={styles.cardSummary}>
                        {description}
                      </Muted>
                    </View>

                    <View style={styles.badgeRow}>
                      {isPreview ? (
                        <>
                          <Badge label={t('activities.reviewedBadge')} />
                          <View
                            style={[
                              styles.previewBadge,
                              { backgroundColor: colors.warningBg, borderColor: colors.warningText },
                            ]}
                          >
                            <Text style={[styles.previewBadgeText, { color: colors.warningText }]}>
                              {t('activities.previewBadge')}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <Badge
                          label={t(`activities.verificationStatuses.${activity.verificationStatus}`)}
                          color={
                            activity.verificationStatus === 'saathi_verified'
                              ? colors.success
                              : colors.warningText
                          }
                        />
                      )}
                      {joined ? <Badge label={t('activities.joinedBadge')} color={colors.success} /> : null}
                      {waitlisted ? <Badge label={t('activities.waitlisted')} color={colors.info} /> : null}
                    </View>

                    <View style={styles.cardMeta}>
                      {formatSession(nextSession, lang) ? (
                        <View style={styles.metaRow}>
                          <Feather name="clock" size={18} color={colors.textMuted} />
                          <Text style={[styles.metaText, { color: colors.textMuted }]}>
                            {isPreview
                              ? t('activities.proposedSchedule', {
                                  schedule: formatSession(nextSession, lang),
                                })
                              : formatSession(nextSession, lang)}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.metaRow}>
                        <Feather name="map-pin" size={18} color={colors.textMuted} />
                        <Text style={[styles.metaText, { color: colors.textMuted }]}>
                          {isPreview
                            ? t('activities.previewArea')
                            : [activity.venueName, activity.town].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.cardAction, { borderTopColor: colors.border }]}>
                      <Text style={[styles.actionText, { color: colors.text }]}>{t('activities.viewDetails')}</Text>
                      <Feather name="arrow-right" size={20} color={colors.text} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean, columns: number) {
  const cardWidth: `${number}%` = columns === 3 ? '31.7%' : columns === 2 ? '49%' : '100%';

  return StyleSheet.create({
    screen: { flex: 1 },
    pageOuter: { width: '100%' },
    pageScroll: {
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: isWide ? space.xxl : TAB_BAR_CLEARANCE,
      gap: space.lg,
    },
    hero: { gap: space.xs, maxWidth: 760 },
    eyebrow: {
      fontFamily: family.semibold,
      fontSize: font.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    heroTitle: { fontFamily: family.medium, fontSize: isWide ? 38 : 30, lineHeight: isWide ? 45 : 37 },
    heroBody: { maxWidth: 720, fontSize: font.md, lineHeight: font.md * 1.45 },
    participantBanner: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderRadius: radius.lg,
      padding: space.md,
    },
    participantText: { flex: 1, fontFamily: family.semibold, fontSize: font.md },
    previewBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      borderWidth: 1,
      borderLeftWidth: 5,
      borderRadius: radius.md,
      padding: space.md,
    },
    bannerCopy: { flex: 1, minWidth: 0, gap: 3 },
    bannerTitle: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.3 },
    bannerBody: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    loadError: { flexDirection: 'column', alignItems: 'flex-start', gap: space.md },
    loadErrorText: { fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    searchRow: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
    },
    searchInput: { flex: 1, height: TAP, fontFamily: family.medium, fontSize: font.md },
    filterRailWrap: { marginHorizontal: isWide ? -space.xl : -space.md },
    filterRailContent: { paddingHorizontal: isWide ? space.xl : space.md },
    resultCount: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.35 },
    loading: { paddingVertical: space.xxl },
    cardList: {
      flexDirection: columns > 1 ? 'row' : 'column',
      flexWrap: columns > 1 ? 'wrap' : 'nowrap',
      alignItems: 'stretch',
      gap: space.md,
    },
    card: {
      width: cardWidth,
      minHeight: columns > 1 ? 430 : undefined,
      borderRadius: radius.lg,
      padding: space.lg,
      gap: space.md,
      justifyContent: 'space-between',
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    categoryIcon: {
      width: 48,
      height: 48,
      borderWidth: 1,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryLabel: { flex: 1, fontFamily: family.semibold, fontSize: font.sm },
    cardCopy: { gap: space.xs },
    cardTitle: { fontFamily: family.semibold, fontSize: font.lg, lineHeight: font.lg * 1.25 },
    cardSummary: { fontSize: font.sm, lineHeight: font.sm * 1.45 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
    previewBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: space.sm,
      paddingVertical: 5,
    },
    previewBadgeText: { fontFamily: family.medium, fontSize: font.xs },
    cardMeta: { gap: space.sm },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
    metaText: { flex: 1, fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.35 },
    cardAction: {
      minHeight: TAP,
      borderTopWidth: 1,
      paddingTop: space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    actionText: { fontFamily: family.semibold, fontSize: font.md },
    emptyState: { alignItems: 'center', paddingVertical: space.xl, gap: space.sm },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { fontFamily: family.semibold, fontSize: font.lg },
    emptyBody: { textAlign: 'center', fontSize: font.sm },
    pressed: { opacity: 0.72 },
  });
}
