import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { H1, Muted, Button } from '../src/components/ui';
import { AppColors, font, radius, space } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { supabaseConfigured } from '../src/lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

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
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}>
      <Stack.Screen options={{ title: '' }} />
      <Text style={{ fontSize: 42, textAlign: 'center', color: colors.primaryDark, fontWeight: '900' }}>
        Saathi
      </Text>
      <H1 style={{ textAlign: 'center', marginTop: space.sm }}>{t('auth.welcome')}</H1>
      <Muted style={{ textAlign: 'center', marginTop: 4, fontSize: font.md }}>
        {mode === 'in' ? t('auth.signInOnly') : t('auth.createAccountOnly')}
      </Muted>

      <View key={formKey} style={{ marginTop: space.lg, gap: space.sm }}>
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

      {msg ? <Muted style={{ color: colors.danger, marginTop: space.md }}>{msg}</Muted> : null}

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <Button
          label={isSignIn ? t('common.signIn') : t('auth.createAccount')}
          onPress={submit}
          loading={busy}
        />
        <Button
          label={isSignIn ? t('auth.needAccount') : t('auth.haveAccount')}
          variant="secondary"
          onPress={() => switchMode(isSignIn ? 'up' : 'in')}
        />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    input: {
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      fontSize: font.md,
      color: colors.text,
      minHeight: 56,
    },
  });
}
