import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, H1, H2, Muted } from '../src/components/ui';
import { AppColors, font, radius, shadow, space } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { supabaseConfigured } from '../src/lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isDark, isWide);

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
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.authShell}>
        <View style={styles.identityPanel}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkTop}>SA</Text>
            <Text style={styles.brandMarkBottom}>112</Text>
          </View>
          <Text style={styles.kicker}>Saathi access</Text>
          <H1 style={styles.heroTitle}>{t('auth.welcome')}</H1>
          <Muted style={styles.heroBody}>
            {mode === 'in' ? t('auth.signInOnly') : t('auth.createAccountOnly')}
          </Muted>
          <View style={styles.promiseStack}>
            <Text style={styles.promise}>Username first</Text>
            <Text style={styles.promise}>Family-safe care records</Text>
            <Text style={styles.promise}>Siliguri service directory</Text>
          </View>
        </View>

        <View key={formKey} style={styles.formPanel}>
          <Text style={styles.kickerLight}>{isSignIn ? t('common.signIn') : t('auth.createAccount')}</Text>
          <H2>{isSignIn ? t('common.signIn') : t('auth.createAccount')}</H2>
          <View style={styles.formStack}>
            {!isSignIn ? (
              <TextInput
                style={styles.input}
                placeholder={t('auth.fullName')}
                placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
              autoComplete={isSignIn ? 'password' : 'new-password'}
              textContentType={isSignIn ? 'password' : 'newPassword'}
              importantForAutofill={isSignIn ? 'yes' : 'no'}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {msg ? <Muted style={styles.message}>{msg}</Muted> : null}

          <View style={styles.actions}>
            <Button label={isSignIn ? t('common.signIn') : t('auth.createAccount')} onPress={submit} loading={busy} />
            <Button
              label={isSignIn ? t('auth.needAccount') : t('auth.haveAccount')}
              variant="secondary"
              onPress={() => switchMode(isSignIn ? 'up' : 'in')}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, isDark: boolean, isWide: boolean) {
  return StyleSheet.create({
    page: {
      minHeight: '100%',
      justifyContent: isWide ? 'center' : 'flex-start',
      padding: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.lg,
    },
    authShell: {
      width: '100%',
      maxWidth: 1060,
      alignSelf: 'center',
      flexDirection: isWide ? 'row' : 'column',
      overflow: 'hidden',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardStrong,
      ...shadow.md,
    },
    identityPanel: {
      flex: 1,
      minHeight: isWide ? 620 : 360,
      backgroundColor: colors.nav,
      padding: isWide ? 44 : space.xl,
      justifyContent: 'center',
      gap: space.md,
    },
    brandMark: {
      width: 76,
      height: 76,
      borderRadius: radius.lg,
      backgroundColor: isDark ? colors.primarySoft : colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
    },
    brandMarkTop: { color: isDark ? colors.primaryDark : '#fff', fontSize: font.lg, lineHeight: 25, fontWeight: '900' },
    brandMarkBottom: { color: isDark ? colors.primaryDark : '#fff', fontSize: font.xs, lineHeight: 17, fontWeight: '900', opacity: 0.78 },
    kicker: { color: 'rgba(255,255,255,0.70)', fontSize: font.xs, fontWeight: '900', textTransform: 'uppercase' },
    heroTitle: { color: '#fff', fontSize: isWide ? 48 : 36, lineHeight: isWide ? 54 : 42 },
    heroBody: { color: 'rgba(255,255,255,0.78)', fontSize: font.md, lineHeight: 26 },
    promiseStack: { gap: 8, marginTop: space.sm },
    promise: {
      alignSelf: 'flex-start',
      borderRadius: radius.md,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      color: 'rgba(255,255,255,0.84)',
      paddingHorizontal: space.sm,
      paddingVertical: 8,
      fontSize: font.xs,
      fontWeight: '900',
      overflow: 'hidden',
    },
    formPanel: {
      flex: 1,
      padding: isWide ? 44 : space.lg,
      justifyContent: 'center',
      gap: space.md,
    },
    kickerLight: { color: colors.accentDark, fontSize: font.xs, fontWeight: '900', textTransform: 'uppercase' },
    formStack: { gap: space.sm },
    input: {
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
      fontSize: font.md,
      color: colors.text,
      minHeight: 60,
    },
    message: { color: colors.danger, fontWeight: '900' },
    actions: { gap: space.sm, marginTop: space.sm },
  });
}
