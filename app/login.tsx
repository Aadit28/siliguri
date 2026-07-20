import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, H1, Muted } from '../src/components/ui';
import { AppColors, family, font, radius, space } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { supabaseConfigured } from '../src/lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isWide);

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: '', headerShown: false }} />
      <View key={formKey} style={styles.shell}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Text style={[styles.brandLetter, { color: colors.primaryFg }]}>S</Text>
        </View>

        <H1 style={styles.title}>{t('auth.welcome')}</H1>
        <Muted style={styles.subtitle}>{isSignIn ? t('auth.signInOnly') : t('auth.createAccountOnly')}</Muted>

        <View style={styles.formStack}>
          {!isSignIn ? (
            <TextInput
              style={styles.input}
              placeholder={t('auth.fullName')}
              placeholderTextColor={colors.textSubtle}
              autoComplete="off"
              value={fullName}
              onChangeText={setFullName}
              textContentType="none"
              importantForAutofill="no"
            />
          ) : null}
          <TextInput
            style={styles.input}
            placeholder={t('common.username')}
            placeholderTextColor={colors.textSubtle}
            autoComplete="username"
            autoCapitalize="none"
            keyboardType="default"
            textContentType="username"
            importantForAutofill="yes"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder={t('common.password')}
            placeholderTextColor={colors.textSubtle}
            autoComplete={isSignIn ? 'password' : 'new-password'}
            textContentType={isSignIn ? 'password' : 'newPassword'}
            importantForAutofill={isSignIn ? 'yes' : 'no'}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {msg ? <Muted style={[styles.message, { color: colors.danger }]}>{msg}</Muted> : null}

        <View style={styles.actions}>
          <Button label={isSignIn ? t('common.signIn') : t('auth.createAccount')} onPress={submit} loading={busy} />
          <Pressable
            accessibilityRole="button"
            onPress={() => switchMode(isSignIn ? 'up' : 'in')}
            style={styles.secondaryAction}
            hitSlop={8}
          >
            <Text style={[styles.secondaryText, { color: colors.accent }]}>
              {isSignIn ? t('auth.needAccount') : t('auth.haveAccount')}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    page: {
      minHeight: '100%',
      justifyContent: isWide ? 'center' : 'flex-start',
      paddingHorizontal: space.lg,
      paddingTop: isWide ? space.xl : space.xxl,
      paddingBottom: space.xl,
    },
    shell: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      gap: space.md,
    },
    brandMark: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.sm,
    },
    brandLetter: { fontFamily: family.heavy, fontSize: font.xl, lineHeight: font.xl * 1.1 },
    title: { fontFamily: family.medium, fontSize: isWide ? 40 : 34, lineHeight: isWide ? 46 : 41 },
    subtitle: { fontFamily: family.medium, fontSize: font.md, lineHeight: font.md * 1.4 },
    formStack: { gap: space.sm, marginTop: space.sm },
    input: {
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
      fontFamily: family.regular,
      fontSize: font.md,
      color: colors.text,
      minHeight: 56,
    },
    message: { fontFamily: family.semibold },
    actions: { gap: space.md, marginTop: space.sm },
    secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: family.semibold, fontSize: font.md },
  });
}
