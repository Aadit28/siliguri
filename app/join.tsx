import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Body, Button, Card, H1, H2, Muted } from '../src/components/ui';
import { AppColors, family, radius, Tokens } from '../src/lib/theme';
import { useTokens } from '../src/lib/useTokens';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { friendlyFamilyError, joinByCode, JoinRelationship } from '../src/lib/family';
import { markLoginIntent } from '../src/lib/authNavigation';

/**
 * Joining a senior's account with the code they read out over the phone.
 *
 * Three steps live in one route with local state, the way onboarding.tsx does
 * it: a first-time user who backs out of a pushed screen loses the code they
 * just typed, and there is nothing to go back to that is worth that.
 *
 * No swipe carousel anywhere here — same reason as onboarding: an invisible
 * affordance is not an affordance. Every step advances on a labelled button.
 */

const RELATIONSHIPS: JoinRelationship[] = [
  'son',
  'daughter',
  'spouse',
  'sibling',
  'friend',
  'caregiver',
  'other',
];

const CODE_LENGTH = 6;

// What the person typed, reduced to what the server matches on. Accepts the
// XXX-XXX grouping the senior is reading off their own screen.
function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function grouped(code: string) {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

type Step = 'code' | 'about' | 'relationship' | 'done';

export default function JoinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);
  const { session, user, loading } = useAuth();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState<JoinRelationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seniorName, setSeniorName] = useState<string | null>(null);

  const normalized = normalizeCode(code);

  if (loading) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: t('family.joinTitle') }} />
        <Muted>{t('family.loading')}</Muted>
      </ScrollView>
    );
  }

  if (!session || !user) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: t('family.joinTitle') }} />
        <H1>{t('family.joinTitle')}</H1>
        <Card style={styles.card}>
          <Body>{t('family.errorSignIn')}</Body>
          <Button
            label={t('common.signIn')}
            onPress={() => {
              markLoginIntent();
              router.push('/login');
            }}
          />
        </Card>
      </ScrollView>
    );
  }

  async function submit() {
    if (!session || !relationship) return;
    setError(null);
    setBusy(true);
    try {
      const { link } = await joinByCode(session.access_token, {
        code: normalized,
        relationship,
      });
      setSeniorName(link.parentName || null);
      setStep('done');
    } catch (e) {
      const err = e as Error & { status?: number };
      // A 404 here means "that code did not match", not "you have no access" —
      // the shared mapper's 404 copy is about a link the user already has.
      setError(
        err?.status === 404
          ? t('family.errorCodeNoMatch')
          : friendlyFamilyError(e, t),
      );
      // Back to the code field: the code is the only thing they can fix, and
      // leaving them on the relationship step hides the input that is wrong.
      if (err?.status === 404 || err?.status === 400) setStep('code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('family.joinTitle') }} />

      <View style={styles.hero}>
        <H1>{t('family.joinTitle')}</H1>
        <Muted>{t('family.joinIntro')}</Muted>
      </View>

      {error ? (
        <View style={styles.notice}>
          <Feather name="alert-circle" size={18} color={colors.danger} />
          <Text style={[styles.noticeText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      {step === 'code' ? (
        <Card style={styles.card}>
          <H2>{t('family.joinCodeHeading')}</H2>
          <Muted>{t('family.joinCodeHint')}</Muted>
          <TextInput
            style={[
              styles.codeInput,
              { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text },
            ]}
            value={grouped(normalized)}
            onChangeText={(next) => setCode(normalizeCode(next).slice(0, CODE_LENGTH))}
            placeholder={t('family.joinCodePlaceholder')}
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={t('family.joinCodeHeading')}
            maxLength={CODE_LENGTH + 1}
          />
          <Button
            label={t('family.joinContinue')}
            onPress={() => {
              setError(null);
              setStep('about');
            }}
            disabled={normalized.length !== CODE_LENGTH}
          />
        </Card>
      ) : null}

      {step === 'about' ? (
        <>
          <Card style={styles.card}>
            <H2>{t('family.joinSeeTitle')}</H2>
            {['joinSeeReminders', 'joinSeeServices', 'joinSeeWellbeing'].map((key) => (
              <View key={key} style={styles.bullet}>
                <Feather name="check" size={18} color={colors.success} style={styles.bulletIcon} />
                <Text style={styles.bulletText}>{t(`family.${key}`)}</Text>
              </View>
            ))}
          </Card>

          <Card style={styles.card}>
            <H2>{t('family.joinRespectTitle')}</H2>
            <Body>{t('family.joinRespectBody')}</Body>
            <Muted>{t('family.joinRespectNote')}</Muted>
          </Card>

          <Button label={t('family.joinContinue')} onPress={() => setStep('relationship')} />
          <Button label={t('family.back')} variant="secondary" onPress={() => setStep('code')} />
        </>
      ) : null}

      {step === 'relationship' ? (
        <Card style={styles.card}>
          <H2>{t('family.joinRelationshipHeading')}</H2>
          <Muted>{t('family.joinRelationshipHint')}</Muted>
          <View style={styles.chipGrid}>
            {RELATIONSHIPS.map((option) => {
              const active = relationship === option;
              return (
                <Text
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setRelationship(option)}
                  style={[
                    styles.relChip,
                    {
                      backgroundColor: active ? colors.primary : colors.cardStrong,
                      borderColor: active ? colors.primary : colors.border,
                      color: active ? colors.primaryFg : colors.text,
                    },
                  ]}
                >
                  {t(`family.relationships.${option}`)}
                </Text>
              );
            })}
          </View>
          <Button
            label={t('family.joinSubmit')}
            onPress={submit}
            loading={busy}
            disabled={!relationship}
          />
          <Button label={t('family.back')} variant="secondary" onPress={() => setStep('about')} />
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card style={styles.card}>
          <View style={[styles.doneBadge, { backgroundColor: colors.successSoft }]}>
            <Feather name="check" size={26} color={colors.success} />
          </View>
          <H2>
            {seniorName
              ? t('family.joinDoneTitleNamed', { name: seniorName })
              : t('family.joinDoneTitle')}
          </H2>
          <Body>{t('family.joinDoneBody')}</Body>
          <Button label={t('family.joinDoneCta')} onPress={() => router.replace('/guardian')} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
      padding: tk.space.md,
      paddingBottom: tk.space.xl,
      gap: tk.space.md,
    },
    hero: { paddingHorizontal: tk.space.xs, gap: tk.space.xs },
    card: { gap: tk.space.md },
    // Wide letter spacing and a tall box: this is read off one screen and typed
    // into another, often by somebody holding a phone at arm's length.
    codeInput: {
      minHeight: tk.TAP + 12,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: tk.space.md,
      fontFamily: family.heavy,
      fontSize: tk.font.xl,
      letterSpacing: 6,
      textAlign: 'center',
    },
    bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm },
    bulletIcon: { marginTop: 3 },
    bulletText: {
      flex: 1,
      fontFamily: family.regular,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.5,
      color: colors.text,
    },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tk.space.sm },
    // A Text with onPress rather than the shared Chip: these are a required
    // single choice, not scroll-rail filters, so they wrap and stay tall.
    relChip: {
      minHeight: tk.TAP,
      lineHeight: tk.TAP,
      paddingHorizontal: tk.space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      overflow: 'hidden',
      fontFamily: family.semibold,
      fontSize: tk.font.md,
    },
    doneBadge: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm, paddingHorizontal: tk.space.xs },
    noticeText: {
      flex: 1,
      fontFamily: family.medium,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.45,
    },
  });
}
