import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Card, Muted, Button } from '../../src/components/ui';
import { AppColors, font, space } from '../../src/lib/theme';
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
  const { colors } = useTheme();
  const styles = makeStyles(colors);
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

      <View style={{ padding: space.md, paddingBottom: 0 }}>
        <Muted style={{ fontSize: font.md, marginBottom: space.sm }}>
          {t('community.subtitle')}
        </Muted>
        <Button
          label={t('community.askQuestion')}
          icon="✏️"
          onPress={() => (user ? router.push('/new-post') : router.push('/login'))}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.md, gap: space.sm, paddingBottom: space.xl }}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.85} onPress={() => router.push(`/post/${item.id}`)}>
              <Card>
                <View style={styles.tagRow}>
                  <Text style={styles.tag}>
                    {postEmoji(item.category)} {t(`postCategories.${item.category}`)}
                  </Text>
                  {item.author_name ? <Muted>· {item.author_name}</Muted> : null}
                </View>
                <Text style={styles.title}>{tContent(item.title, lang)}</Text>
                <Muted numberOfLines={2} style={{ marginTop: 4 }}>
                  {tContent(item.body, lang)}
                </Muted>
                <View style={styles.metaRow}>
                  <Muted>💬 {item.reply_count ?? 0}</Muted>
                  <Muted>❤️ {item.like_count ?? 0}</Muted>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// Small helper so we can keep the import list tidy.
function useFocusEffectSafe(cb: () => void) {
  useFocusEffect(
    useCallback(() => {
      cb();
    }, [cb]),
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    tag: { fontSize: font.xs, fontWeight: '800', color: colors.primaryDark },
    title: { fontSize: font.md, fontWeight: '800', color: colors.text, marginTop: 6 },
    metaRow: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  });
}
