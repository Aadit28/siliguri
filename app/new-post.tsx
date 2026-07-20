import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Alert, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, H2, Muted, Button } from '../src/components/ui';
import { AppColors, family, font, radius, space } from '../src/lib/theme';
import { POST_CATEGORIES } from '../src/lib/categories';
import { createPost } from '../src/lib/api';
import { PostCategory } from '../src/lib/types';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { markLoginIntent } from '../src/lib/authNavigation';

export default function NewPost() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user) {
      markLoginIntent();
      router.push('/login');
      return;
    }
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createPost({
      title: title.trim(),
      body: body.trim(),
      category,
      token: session!.access_token,
    });
    setSaving(false);
    if (res.ok) {
      if (Platform.OS === 'web') {
        router.back();
      } else {
        Alert.alert(t('community.submittedForReview'), '', [{ text: 'OK', onPress: () => router.back() }]);
      }
    } else {
      const message = res.error ?? 'Could not post';
      if (Platform.OS === 'web') {
        setError(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.md }}>
      <Stack.Screen options={{ title: t('community.newPost') }} />
      <H2>{t('community.askQuestion')}</H2>
      <Muted style={{ marginTop: space.sm }}>{t('community.reviewNotice')}</Muted>

      <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('community.postCategory')}</Muted>
      <View style={styles.chipRow}>
        {POST_CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            label={t(`postCategories.${c.key}`)}
            active={category === c.key}
            onPress={() => setCategory(c.key)}
          />
        ))}
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

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

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

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    errorBanner: {
      marginTop: space.md,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    errorText: { fontSize: font.sm, fontFamily: family.medium },
    input: {
      backgroundColor: colors.surfaceTint,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      minHeight: 54,
    },
  });
}
