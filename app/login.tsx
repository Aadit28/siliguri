import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { H1, Muted, Button } from '../src/components/ui';
import { colors, font, radius, space } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { supabaseConfigured } from '../src/lib/supabase';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    if (!supabaseConfigured) {
      setMsg('Backend not configured. Add Supabase keys to .env.');
      return;
    }
    setBusy(true);
    if (mode === 'in') {
      const { error } = await signIn(email.trim(), password);
      setBusy(false);
      if (error) setMsg(error);
      else router.back();
    } else {
      const { error, needsConfirm } = await signUp(email.trim(), password, fullName.trim());
      setBusy(false);
      if (error) setMsg(error);
      else if (needsConfirm) setMsg(t('auth.checkEmail'));
      else router.back();
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}>
      <Stack.Screen options={{ title: '' }} />
      <Text style={{ fontSize: 56, textAlign: 'center' }}>🪔</Text>
      <H1 style={{ textAlign: 'center', marginTop: space.sm }}>{t('auth.welcome')}</H1>
      <Muted style={{ textAlign: 'center', marginTop: 4, fontSize: font.md }}>
        {t('auth.signInOrUp')}
      </Muted>

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {mode === 'up' && (
          <TextInput
            style={styles.input}
            placeholder={t('auth.fullName')}
            placeholderTextColor={colors.textMuted}
            value={fullName}
            onChangeText={setFullName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder={t('common.email')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('common.password')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {msg ? <Muted style={{ color: colors.danger, marginTop: space.md }}>{msg}</Muted> : null}

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <Button
          label={mode === 'in' ? t('common.signIn') : t('auth.createAccount')}
          onPress={submit}
          loading={busy}
        />
        <Button
          label={mode === 'in' ? t('auth.needAccount') : t('auth.haveAccount')}
          variant="secondary"
          onPress={() => {
            setMsg(null);
            setMode(mode === 'in' ? 'up' : 'in');
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: font.md,
    color: colors.text,
    minHeight: 56,
  },
});
