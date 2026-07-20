import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Button, H1, Muted } from '../../src/components/ui';
import { AppColors, family, font, radius, space } from '../../src/lib/theme';
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
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const styles = makeStyles(colors, isWide);
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
      <AppHeader title={t('community.title')} />

      <View style={styles.content}>
        <View style={styles.intro}>
          <H1>{t('community.askQuestion')}</H1>
          <Muted style={styles.introBody}>{t('community.subtitle')}</Muted>
          <Muted style={styles.noticeText}>{t('community.reviewNotice')}</Muted>
          <Button
            label={t('community.askQuestion')}
            onPress={() => (user ? router.push('/new-post') : router.push('/login'))}
          />
        </View>

        <View style={[styles.listPanel, { backgroundColor: colors.cardStrong, borderColor: colors.border }]}>
          {loading ? (
            <ActivityIndicator style={{ marginVertical: space.xl }} color={colors.primary} size="large" />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
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
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: isWide ? space.xl * 2 : 118,
      gap: space.lg,
    },
    intro: { gap: space.sm, alignItems: 'flex-start' },
    introBody: { maxWidth: 640 },
    noticeText: { maxWidth: 640, marginBottom: space.xs },
    listPanel: {
      borderRadius: radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    list: { paddingVertical: space.xs },
    separator: { height: StyleSheet.hairlineWidth, marginHorizontal: space.md },
    row: {
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      gap: 6,
    },
    tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    tag: { fontSize: font.xs, fontFamily: family.semibold },
    title: { fontSize: font.lg, lineHeight: 27, fontFamily: family.semibold },
    preview: { fontFamily: family.regular, fontSize: font.sm, lineHeight: 22 },
    metaRow: { fontFamily: family.regular, fontSize: font.xs, marginTop: 2 },
  });
}
