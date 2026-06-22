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
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, H2, Body, Muted, Button } from '../../src/components/ui';
import { colors, font, radius, space } from '../../src/lib/theme';
import { postEmoji } from '../../src/lib/categories';
import { fetchPost, fetchReplies, createReply, toggleLike } from '../../src/lib/api';
import { CommunityPost, CommunityReply } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { user, displayName } = useAuth();

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
    const res = await createReply({ postId: id!, body: text.trim(), authorId: user.id });
    setSending(false);
    if (res.ok) {
      setText('');
      // Optimistically show it.
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
    await toggleLike(id!, user.id, liked);
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: space.xl }} color={colors.primary} size="large" />;
  }
  if (!post) {
    return (
      <View style={{ padding: space.lg }}>
        <Muted>{t('common.noResults')}</Muted>
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
      <ScrollView contentContainerStyle={{ padding: space.md }}>
        <Text style={styles.tag}>
          {postEmoji(post.category)} {t(`postCategories.${post.category}`)}
        </Text>
        <H2 style={{ marginTop: 6 }}>{post.title}</H2>
        {post.author_name ? <Muted style={{ marginTop: 4 }}>{post.author_name}</Muted> : null}
        <Body style={{ marginTop: space.md }}>{post.body}</Body>

        <View style={styles.likeRow}>
          <TouchableOpacity onPress={onLike} style={styles.likeBtn} activeOpacity={0.8}>
            <Text style={{ fontSize: font.md }}>
              {liked ? '❤️' : '🤍'} {post.like_count ?? 0}
            </Text>
          </TouchableOpacity>
          <Muted>💬 {replies.length}</Muted>
        </View>

        <H2 style={{ marginTop: space.lg, marginBottom: space.sm, fontSize: font.md }}>
          {t('community.replies', { count: replies.length })}
        </H2>

        {replies.length === 0 ? (
          <Muted>{t('community.noReplies')}</Muted>
        ) : (
          replies.map((r) => (
            <Card key={r.id} style={{ marginBottom: space.sm }}>
              {r.author_name ? (
                <Text style={styles.replyAuthor}>{r.author_name}</Text>
              ) : null}
              <Body>{r.body}</Body>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Reply composer */}
      <View style={styles.composer}>
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

const styles = StyleSheet.create({
  tag: { fontSize: font.sm, fontWeight: '800', color: colors.primary },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.md },
  likeBtn: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.chipBg,
    justifyContent: 'center',
  },
  replyAuthor: { fontWeight: '800', color: colors.primaryDark, marginBottom: 4, fontSize: font.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    fontSize: font.md,
    color: colors.text,
  },
});
