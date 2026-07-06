import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import AppHeader from '../../src/components/AppHeader';
import SiteFooter from '../../src/components/SiteFooter';
import { Button, Muted } from '../../src/components/ui';
import { AppColors, family, font, motion, radius, space } from '../../src/lib/theme';
import { postEmoji } from '../../src/lib/categories';
import { fetchPosts } from '../../src/lib/api';
import { tContent } from '../../src/lib/contentI18n';
import { languageForContent } from '../../src/lib/languages';
import { CommunityPost } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { markLoginIntent } from '../../src/lib/authNavigation';

const EASE_OUT_QUART = Easing.bezier(...motion.easeOutQuart);
const STAGGER_MS = 40;
const STAGGER_CAP = 6;

export default function Community() {
  const { t } = useTranslation();
  const router = useRouter();
  const { lang } = useLocale();
  const contentLang = languageForContent(lang);
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const reduced = useReducedMotion();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchPosts(user?.id)
      .then(setPosts)
      .finally(() => setLoading(false));
  }, [user?.id]);

  // Refresh whenever the tab regains focus (e.g. after posting).
  useFocusEffectSafe(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={t('community.title')} />

      {/* Pinned intro + ask CTA: always reachable, Uber sheet-style block. */}
      <View style={styles.headerBlock}>
        <Muted>{t('community.subtitle')}</Muted>
        <Button
          label={t('community.askQuestion')}
          icon={<Feather name="edit-3" size={20} color={colors.primaryFg} />}
          onPress={() => {
            if (user) {
              router.push('/new-post');
              return;
            }
            markLoginIntent();
            router.push('/login');
          }}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={<SiteFooter />}
          renderItem={({ item, index }) => (
            <PostAppear index={index} reduced={reduced}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/post/${item.id}`)}
                style={({ pressed }) => [
                  styles.post,
                  pressed && { backgroundColor: colors.overlay },
                ]}
              >
                {/* Amphi-flat feed card: full-bleed, hairline divider, no chrome. */}
                <View style={styles.postHeader}>
                  <View style={styles.avatar}>
                    {item.author_name ? (
                      <Text style={styles.avatarText}>{initialsFor(item.author_name)}</Text>
                    ) : (
                      <Feather name="user" size={20} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.postHeaderText}>
                    {item.author_name ? (
                      <Text style={styles.authorName} numberOfLines={1}>
                        {item.author_name}
                      </Text>
                    ) : null}
                    <Text style={styles.metaLine} numberOfLines={1}>
                      {postEmoji(item.category)} {t(`postCategories.${item.category}`)}
                      {'  ·  '}
                      {postDate(item.created_at, contentLang)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.postTitle} numberOfLines={2}>
                  {tContent(item.title, contentLang)}
                </Text>
                <Text style={styles.postBody} numberOfLines={2}>
                  {tContent(item.body, contentLang)}
                </Text>

                <View style={styles.actionRow}>
                  <View style={styles.actionItem}>
                    <Feather name="message-circle" size={16} color={colors.textMuted} />
                    <Text style={styles.actionCount}>{item.reply_count ?? 0}</Text>
                  </View>
                  <View style={styles.actionItem}>
                    <Feather
                      name="heart"
                      size={16}
                      color={item.liked_by_me ? colors.accent : colors.textMuted}
                    />
                    <Text
                      style={[styles.actionCount, item.liked_by_me && { color: colors.accent }]}
                    >
                      {item.like_count ?? 0}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </PostAppear>
          )}
        />
      )}
    </View>
  );
}

// Card-in stagger per motion spec: opacity 0->1 + translateY 8->0, 200ms
// easeOutQuart, 40ms stagger capped at 6 items. Reduced motion: 120ms fade.
function PostAppear({
  index,
  reduced,
  children,
}: {
  index: number;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      reduced ? 0 : Math.min(index, STAGGER_CAP - 1) * STAGGER_MS,
      withTiming(1, {
        duration: reduced ? motion.dur.press : motion.dur.base,
        easing: reduced ? Easing.linear : EASE_OUT_QUART,
      }),
    );
  }, [index, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduced ? 0 : (1 - progress.value) * 8 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

// Small helper so we can keep the import list tidy.
function useFocusEffectSafe(cb: () => void) {
  useFocusEffect(
    useCallback(() => {
      cb();
    }, [cb]),
  );
}

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function postDate(iso: string, lang: 'hi' | 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    headerBlock: {
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.md,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    loadingWrap: {
      paddingTop: space.xl,
      alignItems: 'center',
    },
    listContent: {
      paddingBottom: 0,
    },
    // Community post card: transparent, no border/shadow, hairline divider.
    post: {
      paddingVertical: space.md,
      paddingHorizontal: space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    postHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: font.sm, fontFamily: family.bold, color: colors.textMuted },
    postHeaderText: { flex: 1 },
    authorName: { fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    metaLine: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
      lineHeight: Math.round(font.xs * 1.4),
      marginTop: 2,
    },
    postTitle: {
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.text,
      lineHeight: Math.round(font.md * 1.5),
      marginTop: space.sm,
    },
    postBody: {
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.textMuted,
      lineHeight: Math.round(font.md * 1.5),
      marginTop: space.xs,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
      marginTop: 12,
    },
    actionItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionCount: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
  });
}
