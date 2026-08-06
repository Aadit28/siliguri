import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Card, H1, H2, Muted } from '../src/components/ui';
import { AppColors, family, radius, Tokens } from '../src/lib/theme';
import { useTokens } from '../src/lib/useTokens';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { markLoginIntent } from '../src/lib/authNavigation';
import { isDemoToken } from '../src/lib/demoFamily';
import ForWhomPicker, { useFamilyBeneficiary } from '../src/components/ForWhomPicker';
import { requestVoiceToken } from '../src/lib/voice';
import { VOICE_SDK_MISSING, VoiceRoomHandle, connectVoiceRoom } from '../src/lib/voiceRoom';

// The elder sees one big thing at a time. Every state below owns the whole
// screen rather than layering a spinner or a red line onto the previous one —
// a call that is failing must not still be showing a button that looks live.
type CallState = 'idle' | 'connecting' | 'in-call' | 'coming-soon' | 'error';

// Deliberately far above the 56pt floor. This is the only control on the
// screen at rest, it is aimed at hands that miss, and there is nothing beside
// it to hit by mistake.
const CALL_BUTTON_SIZE = 168;

// Two very different reasons produce the same friendly answer: the server has
// no LiveKit credentials yet (voice_not_configured), and this build has no
// LiveKit client compiled in (voice_sdk_missing). Both mean "not yet", and
// neither is anything the elder can act on.
function isNotReadyYet(code: string | undefined) {
  return code === 'voice_not_configured' || code === VOICE_SDK_MISSING;
}

function friendlyCallError(e: unknown, t: (key: string) => string): string {
  const error = e as Error & { status?: number; code?: string };
  // backendRequest only attaches a status once it has a response; its absence
  // means the request never landed.
  if (error?.status === undefined) return t('voiceCall.errorNetwork');
  if (error.status === 401) return t('voiceCall.errorSignIn');
  if (error.status === 403) return t('voiceCall.errorNotAllowed');
  if (error.status === 429) return t('voiceCall.errorTooMany');
  // The multi-parent 400 is the one case where the server's own sentence is
  // more useful than ours, because it names the fix (pick a parent) — and the
  // picker above should already have prevented it.
  if (error.status === 400 && error.message) return error.message;
  return t('voiceCall.errorGeneric');
}

export default function VoiceCallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const token = session?.access_token ?? null;
  const demo = token ? isDemoToken(token) : false;

  const [state, setState] = useState<CallState>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Held in a ref, not state: hanging up must not wait for a render, and the
  // unmount cleanup below needs the current handle without re-subscribing.
  const roomRef = useRef<VoiceRoomHandle | null>(null);
  // The screen can be closed mid-connect. Anything resolving after that must
  // not call setState on a gone component or, worse, leave a live room behind.
  const mountedRef = useRef(true);

  // /api/voice/token answers a guardian of several parents with a 400 asking
  // which one. Same picker the booking screens use, so the elder-facing copy
  // never has to explain that.
  const {
    people: elders,
    beneficiaryId: elderId,
    setBeneficiaryId: setElderId,
    selected: forElder,
  } = useFamilyBeneficiary(token, {
    self: t('booking.forMyself'),
    unnamed: t('booking.parentFallback'),
  });

  const leaveRoom = useCallback(async () => {
    const handle = roomRef.current;
    roomRef.current = null;
    if (!handle) return;
    try {
      await handle.leave();
    } catch {
      // Already gone. Nothing the elder needs to hear about a call they ended.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Navigating away hangs up. A room left open keeps the microphone hot
      // and the agent talking to an empty screen.
      void leaveRoom();
    };
  }, [leaveRoom]);

  const startCall = useCallback(async () => {
    if (!token) return;
    setErrorText(null);
    setState('connecting');
    try {
      const grant = await requestVoiceToken(token, elderId);
      if (!mountedRef.current) return;

      const handle = await connectVoiceRoom(grant, {
        onDisconnected: () => {
          if (!mountedRef.current) return;
          // LiveKit fires disconnect on a deliberate leave() too, and hangUp
          // clears the ref BEFORE leaving — so a null ref here means the elder
          // ended this call and has already been sent back to idle. Only a
          // disconnect we did not ask for is worth a message.
          if (roomRef.current === null) return;
          roomRef.current = null;
          setErrorText(t('voiceCall.errorDropped'));
          setState('error');
        },
        onError: (code) => {
          if (!mountedRef.current) return;
          roomRef.current = null;
          setErrorText(isNotReadyYet(code) ? null : t('voiceCall.errorGeneric'));
          setState(isNotReadyYet(code) ? 'coming-soon' : 'error');
        },
      });

      if (!mountedRef.current) {
        // Unmounted while the room was connecting; the handle exists but the
        // screen does not.
        void handle.leave().catch(() => undefined);
        return;
      }
      roomRef.current = handle;
      setState('in-call');
    } catch (error) {
      if (!mountedRef.current) return;
      const code = (error as { code?: string })?.code;
      if (isNotReadyYet(code)) {
        setState('coming-soon');
        return;
      }
      setErrorText(friendlyCallError(error, t));
      setState('error');
    }
  }, [elderId, t, token]);

  const hangUp = useCallback(async () => {
    await leaveRoom();
    if (!mountedRef.current) return;
    setErrorText(null);
    setState('idle');
  }, [leaveRoom]);

  const title = t('voiceCall.title');

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  if (!session) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title }} />
        <H1>{title}</H1>
        <Card style={styles.stateCard}>
          <Feather name="lock" size={26} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{t('voiceCall.errorSignIn')}</Muted>
          <View style={styles.stateAction}>
            <Button
              label={t('common.signIn')}
              onPress={() => {
                markLoginIntent();
                router.push('/login');
              }}
            />
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <H1>{title}</H1>

        {demo ? (
          <Card style={styles.stateCard}>
            <Feather name="info" size={26} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('voiceCall.demoNotice')}</Muted>
          </Card>
        ) : (
          <>
            {/* Only shown to a guardian of more than one parent — the picker
                hides itself otherwise, so a plain elder never meets it. */}
            {state === 'idle' ? (
              <ForWhomPicker
                people={elders}
                selectedId={elderId}
                onChange={setElderId}
                title={t('voiceCall.forTitle')}
                chipLabel={t('voiceCall.forParent', { name: forElder?.name ?? '' })}
                changeLabel={t('voiceCall.forChange', { name: forElder?.name ?? '' })}
              />
            ) : null}

            {state === 'idle' ? (
              <View style={styles.stage}>
                <Muted style={styles.stageBody}>{t('voiceCall.idleBody')}</Muted>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('voiceCall.callButton')}
                  accessibilityHint={t('voiceCall.idleBody')}
                  onPress={() => void startCall()}
                  style={({ pressed }) => [
                    styles.callButton,
                    { backgroundColor: colors.success },
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name="mic" size={64} color={colors.successFg} />
                </Pressable>
                <Text style={styles.callButtonLabel}>{t('voiceCall.callButton')}</Text>
              </View>
            ) : null}

            {state === 'connecting' ? (
              <View style={styles.stage}>
                <View style={[styles.callButton, styles.callButtonQuiet, { borderColor: colors.border }]}>
                  <ActivityIndicator size="large" color={colors.text} />
                </View>
                <H2 style={styles.stageTitle}>{t('voiceCall.connecting')}</H2>
                <Muted style={styles.stageBody}>{t('voiceCall.connectingBody')}</Muted>
              </View>
            ) : null}

            {state === 'in-call' ? (
              <View style={styles.stage}>
                <View style={[styles.callButton, { backgroundColor: colors.successSoft }]}>
                  <Feather name="mic" size={64} color={colors.success} />
                </View>
                <H2 style={styles.stageTitle}>{t('voiceCall.inCall')}</H2>
                <Muted style={styles.stageBody}>{t('voiceCall.inCallBody')}</Muted>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('voiceCall.hangUp')}
                  onPress={() => void hangUp()}
                  style={({ pressed }) => [
                    styles.hangUpButton,
                    { backgroundColor: colors.emergency },
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name="phone-off" size={26} color="#FFFFFF" />
                  <Text style={styles.hangUpLabel}>{t('voiceCall.hangUp')}</Text>
                </Pressable>
              </View>
            ) : null}

            {state === 'coming-soon' ? (
              <Card style={styles.stateCard}>
                <Feather name="clock" size={26} color={colors.textSubtle} />
                <H2 style={styles.stageTitle}>{t('voiceCall.comingSoonTitle')}</H2>
                <Muted style={styles.stateText}>{t('voiceCall.comingSoonBody')}</Muted>
                <View style={styles.stateAction}>
                  <Button label={t('voiceCall.openAssistant')} onPress={() => router.push('/assistant')} />
                </View>
                <View style={styles.stateAction}>
                  <Button
                    label={t('voiceCall.back')}
                    variant="secondary"
                    onPress={() => setState('idle')}
                  />
                </View>
              </Card>
            ) : null}

            {state === 'error' ? (
              <Card style={styles.stateCard}>
                <Feather name="alert-circle" size={26} color={colors.danger} />
                <H2 style={styles.stageTitle}>{t('voiceCall.errorTitle')}</H2>
                <Muted style={styles.stateText}>{errorText ?? t('voiceCall.errorGeneric')}</Muted>
                <View style={styles.stateAction}>
                  <Button label={t('voiceCall.retry')} onPress={() => void startCall()} />
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: tk.space.md,
      paddingBottom: tk.space.xxl,
      gap: tk.space.md,
    },
    stage: { alignItems: 'center', gap: tk.space.md, paddingVertical: tk.space.xl },
    stageTitle: { textAlign: 'center' },
    stageBody: {
      textAlign: 'center',
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.5,
      maxWidth: 420,
    },
    callButton: {
      width: CALL_BUTTON_SIZE,
      height: CALL_BUTTON_SIZE,
      borderRadius: CALL_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callButtonQuiet: { backgroundColor: colors.bgAlt, borderWidth: 1 },
    callButtonLabel: {
      color: colors.text,
      fontFamily: family.heavy,
      fontSize: tk.font.lg,
      textAlign: 'center',
    },
    hangUpButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tk.space.sm,
      alignSelf: 'stretch',
      minHeight: Math.max(tk.TAP, 64),
      paddingHorizontal: tk.space.lg,
      borderRadius: radius.pill,
    },
    hangUpLabel: { color: '#FFFFFF', fontFamily: family.heavy, fontSize: tk.font.md },
    pressed: { opacity: 0.85 },
    stateCard: { alignItems: 'center', gap: tk.space.sm, paddingVertical: tk.space.xl },
    stateText: { textAlign: 'center', fontSize: tk.font.md, lineHeight: tk.font.md * 1.5 },
    stateAction: { alignSelf: 'stretch', marginTop: tk.space.sm },
  });
}
