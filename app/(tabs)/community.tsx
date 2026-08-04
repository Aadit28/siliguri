import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { Chip, Muted } from '../../src/components/ui';
import { AppColors, family, radius, TAB_BAR_CLEARANCE, Tokens } from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { fetchPosts, ApiError } from '../../src/lib/api';
import { tContent } from '../../src/lib/contentI18n';
import { CommunityPost } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';

type SortMode = 'smart' | 'new' | 'unanswered';

// Hacker News ranking (Y Combinator's open-source `arc` news.arc):
// score = (points + 1) / (age_hours + 2)^GRAVITY. Gravity 1.8 means a day-old
// post needs roughly 10x the engagement of a fresh one to hold its place.
const GRAVITY = 1.8;

function hotScore(post: CommunityPost, now: number) {
  const ageHours = Math.max(0, (now - new Date(post.created_at).getTime()) / 3_600_000);
  const points = (post.like_count ?? 0) + 2 * (post.reply_count ?? 0);
  return (points + 1) / Math.pow(ageHours + 2, GRAVITY);
}

// Title hits weigh 3x body hits; every term must appear somewhere or the post drops.
// Matches raw text AND the rendered translation, so Hindi searches find seeded posts.
function relevance(post: CommunityPost, terms: string[], lang: string) {
  if (terms.length === 0) return 1;
  const title = `${post.title} ${tContent(post.title, lang)}`.toLowerCase();
  const body = `${post.body} ${tContent(post.body, lang)} ${post.category}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inTitle = title.includes(term);
    const inBody = body.includes(term);
    if (!inTitle && !inBody) return 0;
    score += inTitle ? 3 : 1;
  }
  return score;
}

export default function Community() {
  const { t } = useTranslation();
  const router = useRouter();
  const { lang } = useLocale();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const isWide = isComputerMode && width >= 920;
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, isWide, tk), [colors, isWide, tk]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState('');
  // Search runs off a debounced copy so ranking doesn't re-run every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('smart');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPosts(user?.id)
      .then((p) => {
        setPosts(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError('network', String(e))))
      .finally(() => setLoading(false));
  }, [user?.id]);

  useFocusEffectSafe(load);

  const visible = useMemo(() => {
    const now = Date.now();
    const terms = debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const scored = posts
      .map((post) => ({ post, match: relevance(post, terms, lang), hot: hotScore(post, now) }))
      .filter((entry) => entry.match > 0)
      .filter((entry) => sort !== 'unanswered' || (entry.post.reply_count ?? 0) === 0);

    scored.sort((a, b) => {
      if (sort === 'new') return +new Date(b.post.created_at) - +new Date(a.post.created_at);
      // Relevance multiplies decay, so a strong keyword hit outranks a fresher miss.
      return b.match * b.hot - a.match * a.hot;
    });
    return scored.map((entry) => entry.post);
  }, [posts, debouncedQuery, sort, lang]);

  const isSearching = debouncedQuery.trim().length > 0;
  const errorMessage = error
    ? error.kind === 'timeout'
      ? t('community.errorTimeout', {
          defaultValue: 'This is taking longer than usual. Check your connection and try again.',
        })
      : t('common.errorLoading')
    : '';

  const sortOptions: Array<{ key: SortMode; label: string }> = [
    { key: 'smart', label: t('community.filterSmart') },
    { key: 'new', label: t('community.filterNew') },
    { key: 'unanswered', label: t('community.filterUnanswered') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={t('community.title')} />

      <View style={styles.content}>
        <View style={styles.headRow}>
          <Text style={styles.heading}>{t('community.title')}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('community.askQuestion')}
            activeOpacity={0.85}
            onPress={() => (user ? router.push('/new-post') : router.push('/login'))}
            style={[styles.askBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="edit-3" size={18} color={colors.primaryFg} />
            <Text style={[styles.askLabel, { color: colors.primaryFg }]}>{t('community.askShort')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.cardStrong }]}>
          <Feather name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('community.searchPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={t('community.searchPlaceholder')}
            returnKeyType="search"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRail}
          contentContainerStyle={styles.filterRailContent}
        >
          {sortOptions.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={sort === option.key}
              onPress={() => setSort(option.key)}
            />
          ))}
        </ScrollView>

        <View style={[styles.listPanel, { backgroundColor: colors.cardStrong, borderColor: colors.border }]}>
          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Muted style={styles.stateText}>
                {t('community.loadingPosts', { defaultValue: 'Loading community posts…' })}
              </Muted>
            </View>
          ) : error ? (
            <View style={styles.stateBox}>
              <View style={[styles.stateDisc, { backgroundColor: colors.dangerSoft }]}>
                <Feather name="wifi-off" size={22} color={colors.danger} />
              </View>
              <Text style={[styles.stateTitle, { color: colors.text }]}>{errorMessage}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                activeOpacity={0.85}
                onPress={load}
                style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="refresh-cw" size={16} color={colors.primaryFg} />
                <Text style={[styles.retryLabel, { color: colors.primaryFg }]}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={visible}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
              ListEmptyComponent={
                <View style={styles.stateBox}>
                  <View style={[styles.stateDisc, { backgroundColor: colors.surfaceTint }]}>
                    <Feather name={isSearching ? 'search' : 'message-circle'} size={22} color={colors.textMuted} />
                  </View>
                  {isSearching ? (
                    <>
                      <Text style={[styles.stateTitle, { color: colors.text }]}>
                        {t('community.noSearchResults', {
                          defaultValue: 'No questions match your search.',
                        })}
                      </Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('community.clearSearch', { defaultValue: 'Clear search' })}
                        activeOpacity={0.85}
                        onPress={() => setQuery('')}
                        style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                      >
                        <Feather name="x" size={16} color={colors.primaryFg} />
                        <Text style={[styles.retryLabel, { color: colors.primaryFg }]}>
                          {t('community.clearSearch', { defaultValue: 'Clear search' })}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.stateTitle, { color: colors.text }]}>
                        {t('community.emptyTitle', { defaultValue: 'No questions yet.' })}
                      </Text>
                      <Muted style={styles.stateText}>
                        {t('community.emptyHint', {
                          defaultValue: 'Be the first to ask neighbours for local advice.',
                        })}
                      </Muted>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('community.askQuestion')}
                        activeOpacity={0.85}
                        onPress={() => (user ? router.push('/new-post') : router.push('/login'))}
                        style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                      >
                        <Feather name="edit-3" size={16} color={colors.primaryFg} />
                        <Text style={[styles.retryLabel, { color: colors.primaryFg }]}>
                          {t('community.askShort')}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/post/${item.id}`)}>
                  <View style={styles.row}>
                    <View style={styles.tagRow}>
                      <Text style={[styles.tag, { color: colors.textMuted }]}>
                        {t(`postCategories.${item.category}`)}
                      </Text>
                      {item.status === 'pending' ? (
                        <Text style={[styles.pendingTag, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>
                          {t('community.pendingReview', { defaultValue: 'Awaiting review' })}
                        </Text>
                      ) : null}
                      {item.author_name ? <Muted numberOfLines={1}>· {item.author_name}</Muted> : null}
                    </View>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                      {tContent(item.title, lang)}
                    </Text>
                    <Muted numberOfLines={2} style={styles.preview}>
                      {tContent(item.body, lang)}
                    </Muted>
                    <Muted style={styles.metaRow}>
                      {t('community.replies', { count: item.reply_count ?? 0 })}
                      {'  ·  '}
                      {t('community.likes', { count: item.like_count ?? 0 })}
                    </Muted>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function useFocusEffectSafe(cb: () => void) {
  useFocusEffect(
    useCallback(() => {
      cb();
    }, [cb]),
  );
}

function makeStyles(colors: AppColors, isWide: boolean | undefined, tk: Tokens) {
  return StyleSheet.create({
    content: {
      flex: 1,
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isWide ? tk.space.xl : tk.space.md,
      paddingTop: isWide ? tk.space.lg : tk.space.md,
      paddingBottom: isWide ? tk.space.xl : TAB_BAR_CLEARANCE,
      gap: tk.space.md,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tk.space.md,
    },
    heading: {
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: isWide ? tk.font.lg : tk.font.md,
      lineHeight: (isWide ? tk.font.lg : tk.font.md) * 1.3,
    },
    askBtn: {
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: tk.space.md,
      borderRadius: radius.pill,
    },
    askLabel: { fontFamily: family.semibold, fontSize: tk.font.sm },
    searchRow: {
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.md,
    },
    searchInput: { flex: 1, height: tk.TAP, fontFamily: family.medium, fontSize: tk.font.md },
    // Rail bleeds to the screen edge so chips scroll past the page gutter.
    filterRail: { flexGrow: 0, marginHorizontal: isWide ? -tk.space.xl : -tk.space.md },
    filterRailContent: { paddingHorizontal: isWide ? tk.space.xl : tk.space.md },
    listPanel: {
      flex: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    list: { paddingVertical: tk.space.xs, flexGrow: 1 },
    stateBox: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: tk.space.xl,
      paddingHorizontal: tk.space.lg,
      gap: tk.space.sm,
    },
    stateDisc: {
      width: 52,
      height: 52,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    stateTitle: {
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      textAlign: 'center',
    },
    stateText: { textAlign: 'center' },
    retryBtn: {
      marginTop: tk.space.sm,
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: tk.space.lg,
      borderRadius: radius.pill,
    },
    retryLabel: { fontFamily: family.semibold, fontSize: tk.font.sm },
    pendingTag: {
      fontSize: tk.font.sm,
      fontFamily: family.semibold,
      overflow: 'hidden',
      borderRadius: radius.sm,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    separator: { height: StyleSheet.hairlineWidth, marginHorizontal: tk.space.md },
    row: {
      paddingHorizontal: tk.space.md,
      paddingVertical: tk.space.md,
      gap: 6,
    },
    tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    // Category, status and reply/like counts are the content a reader scans to
    // pick a post — they belong on the body floor, not the caption floor.
    tag: { fontSize: tk.font.sm, fontFamily: family.semibold },
    title: { fontSize: tk.font.md, lineHeight: tk.font.md * 1.35, fontFamily: family.semibold },
    preview: { fontFamily: family.regular, fontSize: tk.font.sm, lineHeight: 22 },
    metaRow: { fontFamily: family.regular, fontSize: tk.font.sm, marginTop: 2 },
  });
}
