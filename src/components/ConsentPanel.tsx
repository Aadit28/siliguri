import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Body, Button, Card, Dialog, Muted, dateLocale } from './ui';
import { markLoginIntent } from '../lib/authNavigation';
import { AppColors, family, radius, Tokens } from '../lib/theme';
import { useTokens } from '../lib/useTokens';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { isDemoToken } from '../lib/demoFamily';
import {
  CONSENT_PURPOSES,
  Consent,
  ConsentPurpose,
  ConsentState,
  friendlyConsentError,
  getConsentState,
  isCoreConsentPurpose,
  setConsent,
  toConsentState,
} from '../lib/consent';

/**
 * The four DPDP purposes as toggle cards, shared by the standalone consent
 * screen and the last step of onboarding so both can never drift apart on the
 * one screen in this app where the wording is the legal artefact.
 *
 * Each toggle writes immediately. There is no Save button on purpose: a screen
 * that collects four answers behind one button lets someone leave believing
 * they withdrew a consent that was never sent.
 *
 * Withdrawing one of the two purposes the app runs on is allowed — DPDP gives
 * the right to withdraw as easily as consent was given — but it goes through a
 * confirmation that names what stops working, because the alternative is an
 * elder silently turning their own reminders off.
 */
export default function ConsentPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { lang } = useLocale();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const token = session?.access_token ?? null;
  const demo = token ? isDemoToken(token) : false;

  const [state, setState] = useState<ConsentState>(() => toConsentState([]));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ConsentPurpose | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConsentPurpose | null>(null);

  const load = useCallback(async () => {
    if (!token || isDemoToken(token)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setState(await getConsentState(token));
    } catch (error) {
      setLoadError(friendlyConsentError(error, t));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback(
    async (purpose: ConsentPurpose, granted: boolean) => {
      if (!token) return;
      setBusy(purpose);
      setActionError(null);
      try {
        const saved = await setConsent(token, { purpose, granted });
        setState((current) => ({ ...current, [purpose]: saved }));
      } catch (error) {
        // Nothing is changed on screen when the write fails: showing the new
        // position and an error underneath it would leave the reader unsure
        // which one the server actually holds.
        setActionError(friendlyConsentError(error, t));
      } finally {
        setBusy(null);
      }
    },
    [t, token],
  );

  function onToggle(consent: Consent) {
    if (consent.granted && isCoreConsentPurpose(consent.purpose)) {
      setConfirmTarget(consent.purpose);
      return;
    }
    void apply(consent.purpose, !consent.granted);
  }

  const locale = dateLocale(lang);

  if (authLoading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={colors.textMuted} />
      </Card>
    );
  }

  if (!session) {
    return (
      <Card style={styles.stateCard}>
        <Feather name="lock" size={26} color={colors.textSubtle} />
        <Muted style={styles.stateText}>{t('consent.signInBody')}</Muted>
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
    );
  }

  if (demo) {
    return (
      <Card style={styles.stateCard}>
        <Feather name="info" size={22} color={colors.textSubtle} />
        <Muted style={styles.stateText}>{t('consent.demoNotice')}</Muted>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={colors.textMuted} />
        <Muted style={styles.stateText}>{t('consent.loading')}</Muted>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card style={styles.stateCard}>
        <Feather name="alert-circle" size={22} color={colors.danger} />
        <Muted style={styles.stateText}>{loadError}</Muted>
        <View style={styles.stateAction}>
          <Button label={t('consent.retry')} onPress={() => void load()} />
        </View>
      </Card>
    );
  }

  const confirmConsent = confirmTarget ? state[confirmTarget] : null;

  return (
    <View style={styles.list}>
      {actionError ? (
        <View style={styles.notice}>
          <Feather name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.noticeText}>{actionError}</Text>
        </View>
      ) : null}

      {CONSENT_PURPOSES.map((purpose) => {
        const consent = state[purpose];
        const core = isCoreConsentPurpose(purpose);
        const name = t(`consent.purposes.${purpose}.title`);
        const action = consent.granted
          ? t('consent.turnOff', { name })
          : t('consent.turnOn', { name });
        const answered = consent.updatedAt
          ? new Date(consent.updatedAt).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : null;

        return (
          <Card key={purpose} style={styles.card}>
            <View style={styles.rowHead}>
              <Text style={styles.rowLabel}>{name}</Text>
              <Text style={styles.rowValue}>
                {consent.granted ? t('consent.on') : t('consent.off')}
              </Text>
            </View>

            {core ? (
              <View style={[styles.pill, { backgroundColor: colors.surfaceTint }]}>
                <Text style={styles.pillText}>{t('consent.requiredLabel')}</Text>
              </View>
            ) : null}

            {compact ? (
              <Muted>{t(`consent.purposes.${purpose}.body`)}</Muted>
            ) : (
              <Body style={styles.cardBody}>{t(`consent.purposes.${purpose}.body`)}</Body>
            )}

            {/* The cost of switching off, printed before the tap rather than
                only inside the confirmation an elder may not read. */}
            {consent.granted ? (
              <Muted>{t(`consent.purposes.${purpose}.consequence`)}</Muted>
            ) : null}

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: consent.granted, disabled: busy === purpose }}
              accessibilityLabel={action}
              disabled={busy !== null}
              onPress={() => onToggle(consent)}
              style={({ pressed }) => [
                styles.toggle,
                { backgroundColor: colors.cardStrong, borderColor: colors.border },
                busy !== null && busy !== purpose ? styles.dimmed : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {busy === purpose ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Feather
                  name={consent.granted ? 'check-square' : 'square'}
                  size={24}
                  color={colors.text}
                />
              )}
              <Text style={[styles.toggleLabel, { color: colors.text }]}>{action}</Text>
            </Pressable>

            {answered ? (
              <Muted style={styles.answered}>
                {consent.granted
                  ? t('consent.grantedOn', { date: answered })
                  : t('consent.withdrawnOn', { date: answered })}
              </Muted>
            ) : null}
          </Card>
        );
      })}

      <Dialog
        visible={confirmConsent !== null}
        onClose={() => setConfirmTarget(null)}
        title={t('consent.withdrawTitle', {
          name: confirmTarget ? t(`consent.purposes.${confirmTarget}.title`) : '',
        })}
      >
        <Muted style={styles.dialogBody}>
          {confirmTarget ? t(`consent.purposes.${confirmTarget}.consequence`) : ''}
        </Muted>
        <Muted style={styles.dialogBody}>{t('consent.withdrawBody')}</Muted>
        <View style={styles.dialogActions}>
          <Button
            label={t('consent.withdrawYes')}
            variant="danger"
            onPress={() => {
              const purpose = confirmTarget;
              setConfirmTarget(null);
              if (purpose) void apply(purpose, false);
            }}
          />
          <Button
            label={t('consent.withdrawNo')}
            variant="secondary"
            onPress={() => setConfirmTarget(null)}
          />
        </View>
      </Dialog>
    </View>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    list: { gap: tk.space.md },
    card: { gap: tk.space.sm },
    cardBody: { fontSize: tk.font.md, lineHeight: tk.font.md * 1.5 },
    stateCard: { alignItems: 'center', gap: tk.space.sm, paddingVertical: tk.space.xl },
    stateText: { textAlign: 'center' },
    stateAction: { alignSelf: 'stretch', marginTop: tk.space.sm },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm },
    noticeText: {
      flex: 1,
      color: colors.danger,
      fontFamily: family.medium,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.45,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: tk.space.sm,
    },
    rowLabel: {
      flex: 1,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
      color: colors.text,
    },
    rowValue: { fontFamily: family.regular, fontSize: tk.font.md, color: colors.textMuted },
    pill: {
      alignSelf: 'flex-start',
      paddingHorizontal: tk.space.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
    },
    pillText: { fontFamily: family.semibold, fontSize: tk.font.xs, color: colors.textMuted },
    toggle: {
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tk.space.sm,
      paddingHorizontal: tk.space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
    },
    toggleLabel: { flexShrink: 1, fontFamily: family.semibold, fontSize: tk.font.md },
    dimmed: { opacity: 0.5 },
    pressed: { opacity: 0.72 },
    answered: { fontSize: tk.font.xs },
    dialogBody: { fontSize: tk.font.md, lineHeight: tk.font.md * 1.5, marginBottom: tk.space.sm },
    dialogActions: { marginTop: tk.space.md, gap: tk.space.sm },
  });
}
