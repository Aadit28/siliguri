import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, H1, Muted, localizedServerError } from '../src/components/ui';
import { AppColors, family, font, radius, space, TAP } from '../src/lib/theme';
import { useAuth } from '../src/context/AuthContext';
import { useDisplayMode } from '../src/context/DisplayModeContext';
import { supabaseConfigured } from '../src/lib/supabase';
import { demoByKind, matchDemoUser, type DemoKind } from '../src/lib/demoAuth';
import { listFamilyLinks } from '../src/lib/family';
import { consumeLoginIntent } from '../src/lib/authNavigation';
import { useTheme } from '../src/context/ThemeContext';

type Mode = 'in' | 'up' | 'otp';

// Demo credentials are a QA affordance, not a product feature: an elder who
// taps "Guardian" here lands in someone else's dashboard with no idea why. Shown
// in dev builds, or when a deployment explicitly opts in for a demo environment.
const SHOW_DEMO_ACCOUNTS = __DEV__ || process.env.EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS === '1';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, signIn, signUp, requestOtp, verifyOtp } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const isWide = isComputerMode && width >= 900;
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
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  // Auth/API failures come back as English strings; always translate before display.
  const setError = (raw: string | null | undefined) => setMsg(raw ? localizedServerError(raw, t) : null);
  // Set after a real (non-demo) sign-in so the session-watcher effect can route
  // the user once the auth session lands in context.
  const [pendingRoute, setPendingRoute] = useState(false);

  // Screens that bounce a signed-out user here call markLoginIntent first, so
  // someone who tapped Reply on a community post lands back on that post rather
  // than on Home wondering where their place went.
  function goHome() {
    if (consumeLoginIntent() && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }

  // Real accounts have no distinct "guardian" role (parents and guardians both
  // sign up as role 'user'); a guardian is defined by holding an active family
  // link. So after a real sign-in we look up the fresh session's guardian links
  // and route to the guardian dashboard when one exists, mirroring the demo path.
  useEffect(() => {
    if (!pendingRoute || !session) return;
    setPendingRoute(false);
    let cancelled = false;
    (async () => {
      // Coming back from a specific screen beats the default landing place, so
      // this is checked before the guardian lookup. Consuming it here also
      // clears the flag on the guardian path, which would otherwise carry a
      // stale intent into the next sign-in.
      if (consumeLoginIntent() && router.canGoBack()) {
        router.back();
        return;
      }
      try {
        const { asGuardian } = await listFamilyLinks(session.access_token);
        if (cancelled) return;
        if (asGuardian.some((link) => link.status !== 'revoked')) {
          router.replace('/guardian');
          return;
        }
      } catch {
        // Fall through to the parent home on any lookup failure.
      }
      if (!cancelled) router.replace('/');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRoute, session]);

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
    setShowPassword(false);
  }

  function fillDemo(kind: DemoKind) {
    const demo = demoByKind(kind);
    setMsg(null);
    setUsername(demo.username);
    setPassword(demo.password);
  }

  async function submit() {
    setMsg(null);
    setBusy(true);
    // Sign-in goes through signIn, which handles the offline demo accounts even
    // when the backend is not configured. Sign-up still needs the backend.
    if (mode === 'in') {
      const { error } = await signIn(username, password);
      setBusy(false);
      if (error) {
        setError(error);
        return;
      }
      // Guardians land on the management dashboard, like other family-care
      // apps; parents get the regular home experience.
      const demo = matchDemoUser(username, password);
      if (demo) {
        // goHome consumes the return-here intent; the guardian path has to
        // clear it too or it would fire on the next sign-in instead.
        if (consumeLoginIntent() && router.canGoBack()) router.back();
        else if (demo.kind === 'guardian') router.replace('/guardian');
        else router.replace('/');
        return;
      }
      // Real account: defer routing to the session-watcher effect, which checks
      // for guardian links once the new session is in context.
      setPendingRoute(true);
      return;
    }

    if (!supabaseConfigured) {
      setBusy(false);
      setMsg(t('errors.backendUnavailable', { defaultValue: 'The service is not available right now. Please try again later.' }));
      return;
    }
    const { error } = await signUp(username, password, fullName.trim(), 'username', phone);
    setBusy(false);
    if (error) setError(error);
    else goHome();
  }

  async function sendOtp() {
    setMsg(null);
    setInfo(null);
    if (!supabaseConfigured) {
      setMsg(t('errors.backendUnavailable', { defaultValue: 'The service is not available right now. Please try again later.' }));
      return;
    }
    setBusy(true);
    const { error, devCode } = await requestOtp(phone);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setOtpSent(true);
    setOtpCode('');
    setInfo(
      devCode
        ? t('auth.otpTestCode', { code: devCode, defaultValue: 'Test mode code: {{code}}' })
        : t('auth.otpSent', { phone: phone.trim() }),
    );
  }

  async function submitOtp() {
    setMsg(null);
    setBusy(true);
    const { error } = await verifyOtp(phone, otpCode, fullName);
    setBusy(false);
    if (error) setError(error);
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
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder={t('common.password')}
                  placeholderTextColor={colors.textSubtle}
                  autoComplete={isSignIn ? 'password' : 'new-password'}
                  textContentType={isSignIn ? 'password' : 'newPassword'}
                  importantForAutofill={isSignIn ? 'yes' : 'no'}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.passwordToggle}
                  hitSlop={8}
                >
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>

            {msg ? <Muted style={[styles.message, { color: colors.danger }]}>{msg}</Muted> : null}

            {isSignIn && SHOW_DEMO_ACCOUNTS ? (
              <View style={styles.demoRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showDemo }}
                  accessibilityLabel={t('auth.demoAccounts', { defaultValue: 'Demo / test accounts' })}
                  onPress={() => setShowDemo((v) => !v)}
                  style={styles.demoHeader}
                  hitSlop={6}
                >
                  <Feather name="tool" size={16} color={colors.textSubtle} />
                  <Muted style={styles.demoLabel}>
                    {t('auth.demoAccounts', { defaultValue: 'Demo / test accounts' })}
                  </Muted>
                  <Feather name={showDemo ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSubtle} />
                </Pressable>
                {showDemo ? (
                  <>
                    <Muted style={styles.demoNote}>
                      {t('auth.demoNote', {
                        defaultValue: 'Sample logins for testing only — not real accounts.',
                      })}
                    </Muted>
                    <View style={styles.demoChips}>
                      {(['parent', 'guardian', 'admin'] as DemoKind[]).map((kind) => (
                        <Pressable
                          key={kind}
                          accessibilityRole="button"
                          onPress={() => fillDemo(kind)}
                          style={[styles.demoChip, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}
                          hitSlop={6}
                        >
                          <Text style={[styles.demoChipText, { color: colors.textMuted }]}>
                            {demoByKind(kind).fullName} · {t(`auth.demoRole.${kind}`, {
                              defaultValue: kind === 'parent' ? 'Parent' : kind === 'guardian' ? 'Guardian' : 'Admin',
                            })}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

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
    passwordRow: { position: 'relative', justifyContent: 'center' },
    passwordInput: { paddingRight: 52 },
    passwordToggle: {
      position: 'absolute',
      right: space.sm,
      height: TAP,
      width: TAP,
      alignItems: 'center',
      justifyContent: 'center',
    },
    demoRow: { gap: space.xs, marginTop: space.sm },
    demoHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
    demoLabel: { fontFamily: family.semibold, fontSize: font.sm, flex: 1 },
    demoNote: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.4 },
    demoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    demoChip: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    demoChipText: { fontFamily: family.medium, fontSize: font.sm },
    actions: { gap: space.md, marginTop: space.sm },
    secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: family.semibold, fontSize: font.md },
  });
}
