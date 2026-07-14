import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { H2, Muted, Button } from '../src/components/ui';
import { AppColors, font, radius, space } from '../src/lib/theme';
import { POST_CATEGORIES } from '../src/lib/categories';
import { createPost } from '../src/lib/api';
import { PostCategory } from '../src/lib/types';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function NewPost() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const res = await createPost({
      title: title.trim(),
      body: body.trim(),
      category,
      token: session!.access_token,
    });
    setSaving(false);
    if (res.ok) {
      Alert.alert(t('community.submittedForReview'), '', [{ text: 'OK', onPress: () => router.back() }]);
    } else {
      Alert.alert('Error', res.error ?? 'Could not post');
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.md }}>
      <Stack.Screen options={{ title: t('community.newPost') }} />
      <H2>{t('community.askQuestion')}</H2>
      <Muted style={{ marginTop: space.sm }}>{t('community.reviewNotice')}</Muted>

      <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('community.postCategory')}</Muted>
      <View style={styles.chipRow}>
        {POST_CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <Text
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.chipBg,
                  color: active ? (isDark ? colors.textOnDark : '#fff') : colors.primaryDark,
                },
              ]}
            >
              {c.emoji} {t(`postCategories.${c.key}`)}
            </Text>
          );
        })}
      </View>

      <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('community.postTitle')}</Muted>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('community.postTitle')}
        placeholderTextColor={colors.textMuted}
      />

      <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('community.postBody')}</Muted>
      <TextInput
        style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]}
        value={body}
        onChangeText={setBody}
        placeholder={t('community.postBody')}
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <Button
          label={t('common.post')}
          onPress={submit}
          loading={saving}
          disabled={!title.trim() || !body.trim()}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    chip: {
      overflow: 'hidden',
      paddingHorizontal: space.md,
      paddingVertical: 10,
      borderRadius: radius.pill,
      fontWeight: '800',
      fontSize: font.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      color: colors.text,
      minHeight: 54,
    },
  });
}
