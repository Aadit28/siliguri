import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { H1, Muted, Button } from '../src/components/ui';
import { AppColors, family, font, radius, space, TAP, tracking } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { supabaseConfigured } from '../src/lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

type FieldId = 'name' | 'username' | 'password';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [focused, setFocused] = useState<FieldId | null>(null);

  function goHome() {
    router.replace('/');
  }

  function switchMode(nextMode: 'in' | 'up') {
    setMsg(null);
    setMode(nextMode);
    setUsername('');
    setPassword('');
    setFullName('');
  }

  async function submit() {
    setMsg(null);
    if (!supabaseConfigured) {
      setMsg('Backend not configured. Add Supabase keys to .env.');
      return;
    }
    setBusy(true);
    if (mode === 'in') {
      const { error } = await signIn(username, password);
      setBusy(false);
      if (error) setMsg(error);
      else goHome();
      return;
    }

    const { error } = await signUp(username, password, fullName.trim());
    setBusy(false);
    if (error) setMsg(error);
    else goHome();
  }

  const isSignIn = mode === 'in';
  const formKey = `auth-form-${mode}`;

  function inputStyle(id: FieldId) {
    return [styles.input, focused === id ? styles.inputFocused : null];
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '' }} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.wordmark} accessibilityRole="header">
            Saathi
          </Text>
          <H1 style={styles.title}>{t('auth.welcome')}</H1>
          <Muted style={styles.subtitle}>
            {isSignIn ? t('auth.signInOnly') : t('auth.createAccountOnly')}
          </Muted>
        </View>

        <View key={formKey} style={styles.form}>
          {!isSignIn ? (
            <View style={styles.field}>
              <Text nativeID="label-name" style={styles.label}>
                {t('auth.fullName')}
              </Text>
              <TextInput
                style={inputStyle('name')}
                accessibilityLabel={t('auth.fullName')}
                accessibilityLabelledBy="label-name"
                autoComplete="off"
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                selectionColor={colors.accent}
                textContentType="none"
                importantForAutofill="no"
              />
            </View>
          ) : null}
          <View style={styles.field}>
            <Text nativeID="label-username" style={styles.label}>
              {t('common.username')}
            </Text>
            <TextInput
              style={inputStyle('username')}
              accessibilityLabel={t('common.username')}
              accessibilityLabelledBy="label-username"
              autoComplete="username"
              autoCapitalize="none"
              keyboardType="default"
              textContentType="username"
              importantForAutofill="yes"
              value={username}
              onChangeText={setUsername}
              onFocus={() => setFocused('username')}
              onBlur={() => setFocused(null)}
              selectionColor={colors.accent}
            />
          </View>
          <View style={styles.field}>
            <Text nativeID="label-password" style={styles.label}>
              {t('common.password')}
            </Text>
            <TextInput
              style={inputStyle('password')}
              accessibilityLabel={t('common.password')}
              accessibilityLabelledBy="label-password"
              autoComplete={isSignIn ? 'password' : 'new-password'}
              textContentType={isSignIn ? 'password' : 'newPassword'}
              importantForAutofill={isSignIn ? 'yes' : 'no'}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              selectionColor={colors.accent}
            />
          </View>
        </View>

        {msg ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Feather name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorText}>{msg}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={isSignIn ? t('common.signIn') : t('auth.createAccount')}
            onPress={submit}
            loading={busy}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => switchMode(isSignIn ? 'up' : 'in')}
            style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.ghostText}>
              {isSignIn ? t('auth.needAccount') : t('auth.haveAccount')}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: space.xxl,
    },
    container: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
    },
    header: {
      alignItems: 'center',
    },
    wordmark: {
      fontSize: font.display,
      fontFamily: family.bold,
      letterSpacing: tracking.display,
      lineHeight: Math.round(font.display * 1.12),
      color: colors.text,
      textAlign: 'center',
    },
    title: {
      textAlign: 'center',
      marginTop: space.md,
    },
    subtitle: {
      textAlign: 'center',
      marginTop: space.sm,
      fontSize: font.md,
      lineHeight: Math.round(font.md * 1.5),
    },
    form: {
      marginTop: space.xl,
      gap: space.md,
    },
    field: {
      gap: space.sm,
    },
    label: {
      fontSize: font.sm,
      fontFamily: family.medium,
      lineHeight: Math.round(font.sm * 1.45),
      color: colors.text,
    },
    input: {
      backgroundColor: colors.surfaceTint,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      minHeight: TAP,
    },
    inputFocused: {
      borderColor: colors.glassBorder,
      backgroundColor: colors.bgAlt,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.md,
      padding: space.md,
      marginTop: space.lg,
    },
    errorText: {
      flex: 1,
      fontSize: font.sm,
      fontFamily: family.medium,
      lineHeight: Math.round(font.sm * 1.45),
      color: colors.danger,
    },
    actions: {
      marginTop: space.lg,
      gap: space.sm,
    },
    ghostBtn: {
      minHeight: 48,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
    },
    ghostText: {
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.accent,
    },
  });
}
