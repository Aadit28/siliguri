import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Card, H2, Body, Muted, Button } from '../../src/components/ui';
import { AppColors, family, font, radius, space, TAP } from '../../src/lib/theme';
import { postEmoji } from '../../src/lib/categories';
import { fetchPost, fetchReplies, createReply, toggleLike } from '../../src/lib/api';
import { tContent } from '../../src/lib/contentI18n';
import { CommunityPost, CommunityReply } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';

function initials(name?: string | null) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { lang } = useLocale();
  const { session, user, displayName } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(false);

  async function load() {
    const [p, r] = await Promise.all([fetchPost(id!), fetchReplies(id!)]);
    setPost(p);
    setReplies(r);
    setLiked(Boolean(p?.liked_by_me));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function onSend() {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!text.trim()) return;
    setSending(true);
    const res = await createReply({ postId: id!, body: text.trim(), token: session!.access_token });
    setSending(false);
    if (res.ok) {
      setText('');
      setReplies((prev) => [
        ...prev,
        {
          id: `local-${prev.length}`,
          post_id: id!,
          author_id: user.id,
          author_name: displayName || t('common.you'),
          body: text.trim(),
          created_at: new Date().toISOString(),
        },
      ]);
    }
  }

  async function onLike() {
    if (!user) {
      router.push('/login');
      return;
    }
    setLiked((v) => !v);
    setPost((p) => (p ? { ...p, like_count: (p.like_count ?? 0) + (liked ? -1 : 1) } : p));
    await toggleLike(id!, session!.access_token, liked);
  }

  const renderAvatar = (name?: string | null) => {
    const label = initials(name);
    return (
      <View style={styles.avatar}>
        {label ? (
          <Text style={styles.avatarText}>{label}</Text>
        ) : (
          <Feather name="user" size={20} color={colors.textMuted} />
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <View style={styles.emptyDisc}>
          <Feather name="message-circle" size={20} color={colors.textMuted} />
        </View>
        <Muted style={styles.emptyText}>{t('common.noResults')}</Muted>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: t('community.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.postCard}>
          <View style={styles.headerRow}>
            {renderAvatar(post.author_name)}
            <View style={styles.headerText}>
              {post.author_name ? (
                <Text style={styles.authorName} numberOfLines={1}>
                  {post.author_name}
                </Text>
              ) : null}
              <Text style={styles.metaLine} numberOfLines={1}>
                {postEmoji(post.category)} {t(`postCategories.${post.category}`)}
                {' · '}
                {new Date(post.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>

          <H2 style={styles.postTitle}>{tContent(post.title, lang)}</H2>
          <Body style={styles.postBody}>{tContent(post.body, lang)}</Body>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: liked }}
              onPress={onLike}
              style={({ pressed }) => [
                styles.likeBtn,
                {
                  backgroundColor: liked
                    ? colors.dangerSoft
                    : pressed
                      ? colors.overlay
                      : 'transparent',
                },
              ]}
            >
              <Feather name="heart" size={20} color={liked ? colors.danger : colors.textMuted} />
              <Text
                style={[styles.actionCount, { color: liked ? colors.danger : colors.textMuted }]}
              >
                {post.like_count ?? 0}
              </Text>
            </Pressable>
            <View style={styles.replyStat}>
              <Feather name="message-circle" size={20} color={colors.textMuted} />
              <Text style={styles.actionCount}>{replies.length}</Text>
            </View>
          </View>
        </Card>

        <H2 style={styles.sectionTitle}>{t('community.replies', { count: replies.length })}</H2>

        {replies.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyDisc}>
              <Feather name="message-circle" size={20} color={colors.textMuted} />
            </View>
            <Muted style={styles.emptyText}>{t('community.noReplies')}</Muted>
          </View>
        ) : (
          <View style={styles.replyList}>
            {replies.map((r, i) => (
              <View key={r.id}>
                <View style={styles.replyBlock}>
                  <View style={styles.headerRow}>
                    {renderAvatar(r.author_name)}
                    <View style={styles.headerText}>
                      {r.author_name ? (
                        <Text style={styles.authorName} numberOfLines={1}>
                          {r.author_name}
                        </Text>
                      ) : null}
                      <Text style={styles.metaLine} numberOfLines={1}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <Body style={styles.replyBody}>{tContent(r.body, lang)}</Body>
                </View>
                {i < replies.length - 1 ? <View style={styles.replyDivider} /> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <TextInput
          style={styles.input}
          placeholder={user ? t('community.writeReply') : t('community.signInToPost')}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          editable={Boolean(user)}
          multiline
        />
        <Button label={t('common.send')} onPress={onSend} loading={sending} />
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
    content: {
      paddingTop: space.sm,
      paddingBottom: space.xl,
    },
    postCard: {
      marginHorizontal: space.md,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: font.sm, fontFamily: family.bold, color: colors.textMuted },
    headerText: { flex: 1 },
    authorName: { fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    metaLine: {
      fontSize: font.xs,
      fontFamily: family.regular,
      color: colors.textSubtle,
      marginTop: 2,
      lineHeight: Math.round(font.xs * 1.4),
    },
    postTitle: { marginTop: space.md },
    postBody: { marginTop: space.sm },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
      marginTop: 12,
    },
    likeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      marginLeft: -space.md,
    },
    actionCount: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
    replyStat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
    },
    sectionTitle: {
      marginTop: space.lg,
      marginBottom: space.sm,
      paddingHorizontal: space.md,
    },
    replyList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    replyBlock: {
      paddingHorizontal: space.md,
      paddingVertical: space.md,
    },
    replyBody: { marginTop: space.sm },
    replyDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 68,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: space.xl,
      paddingHorizontal: space.md,
    },
    emptyDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: { marginTop: space.sm, textAlign: 'center' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 12,
      paddingHorizontal: space.md,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    input: {
      flex: 1,
      minHeight: TAP,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: space.md,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      backgroundColor: colors.surfaceTint,
      textAlignVertical: 'top',
    },
  });
}
