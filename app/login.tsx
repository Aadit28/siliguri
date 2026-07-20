import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, H1, Muted } from '../src/components/ui';
import { AppColors, family, font, radius, space } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { supabaseConfigured } from '../src/lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

type Mode = 'in' | 'up' | 'otp';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, signUp, requestOtp, verifyOtp } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isWide);

  const [mode, setMode] = useState<Mode>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function goHome() {
    router.replace('/');
  }

  function switchMode(nextMode: Mode) {
    setMsg(null);
    setInfo(null);
    setMode(nextMode);
    setUsername('');
    setPassword('');
    setFullName('');
    setPhone('');
    setOtpCode('');
    setOtpSent(false);
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

    const { error } = await signUp(username, password, fullName.trim(), 'username', phone);
    setBusy(false);
    if (error) setMsg(error);
    else goHome();
  }

  async function sendOtp() {
    setMsg(null);
    setInfo(null);
    if (!supabaseConfigured) {
      setMsg('Backend not configured. Add Supabase keys to .env.');
      return;
    }
    setBusy(true);
    const { error, devCode } = await requestOtp(phone);
    setBusy(false);
    if (error) {
      setMsg(error);
      return;
    }
    setOtpSent(true);
    setOtpCode('');
    setInfo(
      devCode
        ? `Test mode code: ${devCode}`
        : t('auth.otpSent', { phone: phone.trim() }),
    );
  }

  async function submitOtp() {
    setMsg(null);
    setBusy(true);
    const { error } = await verifyOtp(phone, otpCode, fullName);
    setBusy(false);
    if (error) setMsg(error);
    else goHome();
  }

  const isSignIn = mode === 'in';
  const isOtp = mode === 'otp';
  const formKey = `auth-form-${mode}`;

  const subtitle = isOtp
    ? t('auth.otpHint')
    : isSignIn
      ? t('auth.signInOnly')
      : t('auth.createAccountOnly');

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: '', headerShown: false }} />
      <View key={formKey} style={styles.shell}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Text style={[styles.brandLetter, { color: colors.primaryFg }]}>S</Text>
        </View>

        <H1 style={styles.title}>{t('auth.welcome')}</H1>
        <Muted style={styles.subtitle}>{subtitle}</Muted>

        {isOtp ? (
          <>
            <View style={styles.formStack}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors.textSubtle}
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                importantForAutofill="yes"
                value={phone}
                onChangeText={setPhone}
                editable={!otpSent}
              />
              {otpSent ? (
                <>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder={t('auth.otpCodeLabel')}
                    placeholderTextColor={colors.textSubtle}
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                  />
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
                  <Muted style={styles.hint}>{t('auth.otpNameHint')}</Muted>
                </>
              ) : null}
            </View>

            {info ? <Muted style={styles.message}>{info}</Muted> : null}
            {msg ? <Muted style={[styles.message, { color: colors.danger }]}>{msg}</Muted> : null}

            <View style={styles.actions}>
              {otpSent ? (
                <>
                  <Button label={t('auth.otpVerify')} onPress={submitOtp} loading={busy} />
                  <Pressable accessibilityRole="button" onPress={sendOtp} style={styles.secondaryAction} hitSlop={8}>
                    <Text style={[styles.secondaryText, { color: colors.accent }]}>{t('auth.otpResend')}</Text>
                  </Pressable>
                </>
              ) : (
                <Button label={t('auth.otpSend')} onPress={sendOtp} loading={busy} />
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => switchMode('in')}
                style={styles.secondaryAction}
                hitSlop={8}
              >
                <Text style={[styles.secondaryText, { color: colors.accent }]}>{t('auth.usePassword')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
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
                placeholder={isSignIn ? t('auth.identifier') : t('common.username')}
                placeholderTextColor={colors.textSubtle}
                autoComplete="username"
                autoCapitalize="none"
                keyboardType="default"
                textContentType="username"
                importantForAutofill="yes"
                value={username}
                onChangeText={setUsername}
              />
              {!isSignIn ? (
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.phoneNumber')}
                  placeholderTextColor={colors.textSubtle}
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  importantForAutofill="yes"
                  value={phone}
                  onChangeText={setPhone}
                />
              ) : null}
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
              {isSignIn ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => switchMode('otp')}
                  style={styles.secondaryAction}
                  hitSlop={8}
                >
                  <Text style={[styles.secondaryText, { color: colors.accent }]}>{t('auth.otpSignIn')}</Text>
                </Pressable>
              ) : null}
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
          </>
        )}
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
    codeInput: { letterSpacing: 6, fontFamily: family.semibold, fontSize: font.lg },
    hint: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.4 },
    message: { fontFamily: family.semibold },
    actions: { gap: space.md, marginTop: space.sm },
    secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: family.semibold, fontSize: font.md },
  });
}
