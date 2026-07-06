import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { H1, Button, Chip } from '../src/components/ui';
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
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState<'title' | 'body' | null>(null);

  async function submit() {
    if (!user) {
      markLoginIntent();
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
      router.back();
    } else {
      Alert.alert('Error', res.error ?? 'Could not post');
    }
  }

  const canSubmit = !!title.trim() && !!body.trim();

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('community.newPost') }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <H1 style={styles.heading}>{t('community.askQuestion')}</H1>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>{t('community.postCategory')}</Text>
            <View style={styles.chipRow}>
              {POST_CATEGORIES.map((c) => (
                <Chip
                  key={c.key}
                  label={t(`postCategories.${c.key}`)}
                  emoji={c.emoji}
                  active={category === c.key}
                  onPress={() => setCategory(c.key)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>{t('community.postTitle')}</Text>
            <TextInput
              style={[styles.input, focused === 'title' && styles.inputFocused]}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setFocused('title')}
              onBlur={() => setFocused(null)}
              placeholder={t('community.postTitle')}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.fieldLabel}>{t('community.postBody')}</Text>
            <TextInput
              style={[
                styles.input,
                styles.inputMultiline,
                focused === 'body' && styles.inputFocused,
              ]}
              value={body}
              onChangeText={setBody}
              onFocus={() => setFocused('body')}
              onBlur={() => setFocused(null)}
              placeholder={t('community.postBody')}
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>
        </ScrollView>

        <View style={[styles.ctaBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <Button
            label={t('common.post')}
            onPress={submit}
            loading={saving}
            disabled={!canSubmit}
            icon={<Feather name="send" size={20} color={colors.primaryFg} />}
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    content: {
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.lg,
    },
    heading: { marginTop: space.sm },
    section: { marginTop: space.lg },
    fieldLabel: {
      fontSize: font.sm,
      fontFamily: family.medium,
      color: colors.textMuted,
      lineHeight: Math.round(font.sm * 1.45),
      marginBottom: space.sm,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
    input: {
      backgroundColor: colors.surfaceTint,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: 12,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      minHeight: 56,
    },
    inputFocused: {
      borderColor: colors.glassBorder,
      backgroundColor: colors.cardSolid,
    },
    inputMultiline: {
      minHeight: 180,
      textAlignVertical: 'top',
      paddingTop: 14,
      lineHeight: Math.round(font.md * 1.5),
    },
    ctaBar: {
      backgroundColor: colors.bgAlt,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: space.md,
      paddingTop: 12,
      gap: 12,
    },
  });
}
