import React, { useCallback, useMemo, useState } from 'react';
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
import { AppColors, family, font, radius, space, TAB_BAR_CLEARANCE, TAP } from '../../src/lib/theme';
import { fetchPosts } from '../../src/lib/api';
import { tContent } from '../../src/lib/contentI18n';
import { CommunityPost } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
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
  const isWide = width >= 920;
  const styles = makeStyles(colors, isWide);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('smart');

  const load = useCallback(() => {
    setLoading(true);
    fetchPosts(user?.id)
      .then(setPosts)
      .finally(() => setLoading(false));
  }, [user?.id]);

  useFocusEffectSafe(load);

  const visible = useMemo(() => {
    const now = Date.now();
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
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
  }, [posts, query, sort, lang]);

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
            <ActivityIndicator style={{ marginVertical: space.xl }} color={colors.primary} size="large" />
          ) : (
            <FlatList
              data={visible}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Muted>{t('common.noResults')}</Muted>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/post/${item.id}`)}>
                  <View style={styles.row}>
                    <View style={styles.tagRow}>
                      <Text style={[styles.tag, { color: colors.textMuted }]}>
                        {t(`postCategories.${item.category}`)}
                      </Text>
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

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    content: {
      flex: 1,
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.lg : space.md,
      paddingBottom: isWide ? space.xl : TAB_BAR_CLEARANCE,
      gap: space.md,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    heading: {
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: isWide ? font.lg : font.md,
      lineHeight: (isWide ? font.lg : font.md) * 1.3,
    },
    askBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
    },
    askLabel: { fontFamily: family.semibold, fontSize: font.sm },
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
    // Rail bleeds to the screen edge so chips scroll past the page gutter.
    filterRail: { flexGrow: 0, marginHorizontal: isWide ? -space.xl : -space.md },
    filterRailContent: { paddingHorizontal: isWide ? space.xl : space.md },
    listPanel: {
      flex: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    list: { paddingVertical: space.xs },
    empty: { paddingVertical: space.xl, alignItems: 'center' },
    separator: { height: StyleSheet.hairlineWidth, marginHorizontal: space.md },
    row: {
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      gap: 6,
    },
    tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    tag: { fontSize: font.xs, fontFamily: family.semibold },
    title: { fontSize: font.md, lineHeight: font.md * 1.35, fontFamily: family.semibold },
    preview: { fontFamily: family.regular, fontSize: font.sm, lineHeight: 22 },
    metaRow: { fontFamily: family.regular, fontSize: font.xs, marginTop: 2 },
  });
}
