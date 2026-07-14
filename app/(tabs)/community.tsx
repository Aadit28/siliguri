import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Button, H1, H2, Muted } from '../../src/components/ui';
import { AppColors, font, radius, shadow, space } from '../../src/lib/theme';
import { postEmoji } from '../../src/lib/categories';
import { fetchPosts } from '../../src/lib/api';
import { tContent } from '../../src/lib/contentI18n';
import { CommunityPost } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function Community() {
  const { t } = useTranslation();
  const router = useRouter();
  const { lang } = useLocale();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const styles = makeStyles(colors, isDark, isWide);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchPosts(user?.id)
      .then(setPosts)
      .finally(() => setLoading(false));
  }, [user?.id]);

  useFocusEffectSafe(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.stageGlow} />
      <AppHeader title={t('community.title')} />

      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.kickerOnDark}>{t('community.title')}</Text>
            <H1 style={styles.heroTitle}>{t('community.askQuestion')}</H1>
            <Muted style={styles.heroBody}>{t('community.subtitle')}</Muted>
          </View>
          <View style={styles.heroAction}>
            <Text style={styles.noticeText}>{t('community.reviewNotice')}</Text>
            <Button
              label={t('community.askQuestion')}
              onPress={() => (user ? router.push('/new-post') : router.push('/login'))}
            />
          </View>
        </View>

        <View style={styles.listPanel}>
          <View style={styles.listHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{t('community.title')}</Text>
              <H2>{t('community.title')}</H2>
            </View>
            <Text style={styles.countBadge}>{posts.length}</Text>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: space.xl }} color={colors.primary} size="large" />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.86} onPress={() => router.push(`/post/${item.id}`)}>
                  <View style={styles.postTicket}>
                    <View style={styles.postRail}>
                      <Text style={styles.postEmoji}>{postEmoji(item.category)}</Text>
                    </View>
                    <View style={styles.postCopy}>
                      <View style={styles.tagRow}>
                        <Text style={styles.tag}>{t(`postCategories.${item.category}`)}</Text>
                        {item.author_name ? <Muted>- {item.author_name}</Muted> : null}
                      </View>
                      <Text style={styles.title}>{tContent(item.title, lang)}</Text>
                      <Muted numberOfLines={2} style={styles.preview}>
                        {tContent(item.body, lang)}
                      </Muted>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaPill}>{t('community.replies', { count: item.reply_count ?? 0 })}</Text>
                        <Text style={styles.metaPill}>{t('community.likes', { count: item.like_count ?? 0 })}</Text>
                      </View>
                    </View>
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

function makeStyles(colors: AppColors, isDark: boolean, isWide: boolean) {
  return StyleSheet.create({
    stageGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 360,
      backgroundColor: isDark ? colors.frame : colors.surfaceTint,
    },
    content: {
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: isWide ? space.xl * 2 : 118,
      gap: space.lg,
    },
    hero: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.lg,
      borderRadius: radius.xl,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isWide ? space.xl : space.lg,
      ...shadow.md,
    },
    heroCopy: { flex: 1.1, gap: space.sm },
    kickerOnDark: { color: colors.primary, fontSize: font.xs, fontWeight: '800', textTransform: 'uppercase' },
    heroTitle: { color: colors.text, fontSize: isWide ? 42 : 32, lineHeight: isWide ? 49 : 39 },
    heroBody: { color: colors.textMuted },
    heroAction: {
      flex: isWide ? 0.78 : undefined,
      gap: space.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.lg,
      justifyContent: 'center',
    },
    noticeText: { color: colors.textMuted, fontSize: font.sm, lineHeight: 22, fontWeight: '600' },
    listPanel: {
      borderRadius: 16,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow.sm,
    },
    listHeader: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgAlt,
      padding: space.lg,
    },
    kicker: { color: colors.accentDark, fontSize: font.xs, fontWeight: '900', textTransform: 'uppercase' },
    countBadge: {
      minWidth: 48,
      minHeight: 42,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      color: '#fff',
      textAlign: 'center',
      lineHeight: 42,
      fontSize: font.sm,
      fontWeight: '900',
      overflow: 'hidden',
    },
    list: { padding: space.md, gap: space.md, paddingBottom: space.xl },
    postTicket: {
      flexDirection: 'row',
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.sm,
    },
    postRail: {
      width: isWide ? 86 : 68,
      backgroundColor: colors.chipBg,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    postEmoji: { fontSize: 28 },
    postCopy: { flex: 1, minWidth: 0, padding: space.md, gap: 6 },
    tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
    tag: { fontSize: font.xs, fontWeight: '900', color: colors.primaryDark },
    title: { fontSize: font.lg, lineHeight: 27, fontWeight: '800', color: colors.text },
    preview: { fontSize: font.sm, lineHeight: 22 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    metaPill: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      color: colors.textMuted,
      paddingHorizontal: 9,
      paddingVertical: 5,
      fontSize: font.xs,
      fontWeight: '900',
      overflow: 'hidden',
    },
  });
}
