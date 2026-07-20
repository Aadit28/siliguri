import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Dialog, H1, H2, Muted } from '../../src/components/ui';
import { AppColors, family, font, radius, space, TAP } from '../../src/lib/theme';
import { FamilyLink, FamilyLinkStatus } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import {
  listFamilyLinks,
  requestFamilyLink,
  revokeFamilyLink,
  verifyFamilyLink,
} from '../../src/lib/family';
import { markLoginIntent } from '../../src/lib/authNavigation';

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  maxLength?: number;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrap}>
      <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          fieldStyles.input,
          {
            backgroundColor: colors.surfaceTint,
            borderColor: focused ? colors.glassBorder : colors.border,
            color: colors.text,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Notice({ kind, message }: { kind: 'error' | 'success'; message: string }) {
  const { colors } = useTheme();
  const tint = kind === 'error' ? colors.danger : colors.success;
  return (
    <View style={fieldStyles.notice}>
      <Feather name={kind === 'error' ? 'alert-circle' : 'check-circle'} size={16} color={tint} />
      <Text style={[fieldStyles.noticeText, { color: tint }]}>{message}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: FamilyLinkStatus }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const map: Record<FamilyLinkStatus, { label: string; tint: string; bg: string }> = {
    pending: { label: t('family.statusPending'), tint: colors.warningText, bg: colors.warningBg },
    active: { label: t('family.statusActive'), tint: colors.success, bg: colors.successSoft },
    revoked: { label: t('family.statusRevoked'), tint: colors.textSubtle, bg: colors.surfaceTint },
  };
  const s = map[status];
  return (
    <View style={[fieldStyles.pill, { backgroundColor: s.bg }]}>
      <Text style={[fieldStyles.pillText, { color: s.tint }]}>{s.label}</Text>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginTop: space.md },
  label: {
    fontSize: font.sm,
    fontFamily: family.medium,
    lineHeight: Math.round(font.sm * 1.45),
    marginBottom: space.sm,
  },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: font.md,
    fontFamily: family.regular,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  noticeText: {
    flex: 1,
    fontSize: font.sm,
    fontFamily: family.medium,
    lineHeight: Math.round(font.sm * 1.45),
  },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: font.xs, fontFamily: family.semibold },
});

type LinkPhase = 'phone' | 'code';

export default function GuardianDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, user, loading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isWide);

  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  // Link flow state.
  const [linkOpen, setLinkOpen] = useState(false);
  const [phase, setPhase] = useState<LinkPhase>('phone');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<FamilyLink | null>(null);

  async function loadLinks() {
    if (!session) return;
    setLoadingLinks(true);
    try {
      const { asGuardian } = await listFamilyLinks(session.access_token);
      setLinks(asGuardian);
    } catch {
      setLinks([]);
    } finally {
      setLoadingLinks(false);
    }
  }

  useEffect(() => {
    if (session) loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  if (loading) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.gateContainer}>
        <Stack.Screen options={{ title: t('family.title') }} />
        <ActivityIndicator color={colors.textMuted} />
      </ScrollView>
    );
  }

  if (!session || !user) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.gateContainer}>
        <Stack.Screen options={{ title: t('family.title') }} />
        <Card style={styles.gateCard}>
          <View style={styles.gateIconBlock}>
            <Feather name="users" size={28} color={colors.text} />
          </View>
          <H2 style={styles.gateTitle}>{t('family.title')}</H2>
          <Muted style={styles.gateBody}>{t('family.errorSignIn')}</Muted>
          <View style={styles.gateAction}>
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

  function resetLinkFlow() {
    setPhase('phone');
    setPhone('');
    setRelationship('');
    setCode('');
    setDevCode(null);
    setError(null);
    setSuccess(null);
    setBusy(false);
  }

  function openAddParent() {
    resetLinkFlow();
    setLinkOpen(true);
  }

  function resumeLink(link: FamilyLink) {
    resetLinkFlow();
    setPhone(link.parentPhone ?? '');
    setRelationship(link.relationship ?? '');
    setPhase('code');
    setLinkOpen(true);
  }

  async function sendCode() {
    if (!session) return;
    setError(null);
    setSuccess(null);
    if (!phone.trim()) {
      setError(t('family.errorPhoneRequired'));
      return;
    }
    setBusy(true);
    try {
      const { devCode: dc } = await requestFamilyLink(session.access_token, {
        parentPhone: phone.trim(),
        relationship: relationship.trim() || null,
      });
      setDevCode(dc ?? null);
      setPhase('code');
      setCode('');
      await loadLinks();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!session) return;
    setError(null);
    if (code.replace(/\D/g, '').length !== 6) {
      setError(t('family.errorCodeRequired'));
      return;
    }
    setBusy(true);
    try {
      const { link } = await verifyFamilyLink(session.access_token, {
        parentPhone: phone.trim(),
        code: code.replace(/\D/g, ''),
      });
      setLinkOpen(false);
      await loadLinks();
      if (link.parentId) {
        router.push({ pathname: '/guardian/[parentId]', params: { parentId: link.parentId } });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget || !session) return;
    const id = revokeTarget.id;
    setRevokeTarget(null);
    try {
      await revokeFamilyLink(session.access_token, id);
      await loadLinks();
    } catch {
      // Reload reflects the true state either way.
      await loadLinks();
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.page,
        { paddingBottom: Math.max(insets.bottom, space.lg) },
      ]}
    >
      <Stack.Screen options={{ title: t('family.title') }} />
      <View style={styles.shell}>
        <H1>{t('family.title')}</H1>
        <Muted style={styles.subtitle}>{t('family.intro')}</Muted>

        <View style={styles.headerRow}>
          <H2 style={styles.sectionHeader}>{t('family.parentsHeading')}</H2>
          <Button label={t('family.addParent')} icon={<Feather name="plus" size={18} color={colors.primaryFg} />} onPress={openAddParent} />
        </View>

        {loadingLinks ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={colors.textMuted} />
            <Muted style={styles.stateText}>{t('family.loading')}</Muted>
          </Card>
        ) : links.length === 0 ? (
          <Card style={styles.stateCard}>
            <Feather name="user-plus" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('family.noParentsYet')}</Muted>
          </Card>
        ) : (
          <View style={styles.grid}>
            {links.map((link) => {
              const name = link.parentName || link.parentPhone || t('family.guardianLabel');
              const pid = link.parentId ?? null;
              const canOpen = link.status === 'active' && pid !== null;
              return (
                <Card key={link.id} style={styles.parentCard}>
                  <View style={styles.parentTop}>
                    <View style={styles.parentAvatar}>
                      <Feather name="user" size={22} color={colors.text} />
                    </View>
                    <View style={styles.parentInfo}>
                      <Text style={styles.parentName} numberOfLines={1}>{name}</Text>
                      {link.parentPhone ? (
                        <Text style={styles.parentPhone} numberOfLines={1}>{link.parentPhone}</Text>
                      ) : null}
                      <View style={styles.parentMetaRow}>
                        <StatusPill status={link.status} />
                        {link.relationship ? (
                          <Text style={styles.parentRelationship}>{link.relationship}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View style={styles.parentActions}>
                    {canOpen && pid ? (
                      <Button
                        label={t('family.openDashboard')}
                        onPress={() =>
                          router.push({
                            pathname: '/guardian/[parentId]',
                            params: { parentId: pid },
                          })
                        }
                      />
                    ) : link.status === 'pending' ? (
                      <Button label={t('family.verify')} variant="accent" onPress={() => resumeLink(link)} />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('family.revoke')}
                      onPress={() => setRevokeTarget(link)}
                      style={({ pressed }) => [
                        styles.ghostDanger,
                        pressed ? { backgroundColor: colors.dangerSoft } : null,
                      ]}
                    >
                      <Text style={styles.ghostDangerText}>{t('family.revoke')}</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      {/* Link a parent flow */}
      <Dialog
        visible={linkOpen}
        onClose={() => setLinkOpen(false)}
        title={t('family.linkTitle')}
      >
        {phase === 'phone' ? (
          <>
            <Muted style={styles.dialogIntro}>{t('family.linkIntro')}</Muted>
            <Field
              label={t('family.parentPhone')}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('family.parentPhonePlaceholder')}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <Field
              label={t('family.relationship')}
              value={relationship}
              onChangeText={setRelationship}
              placeholder={t('family.relationshipPlaceholder')}
            />
            {error ? <Notice kind="error" message={error} /> : null}
            <View style={styles.dialogActions}>
              <Button label={t('family.sendCode')} onPress={sendCode} loading={busy} disabled={!phone.trim()} />
              <Button label={t('family.cancel')} variant="secondary" onPress={() => setLinkOpen(false)} />
            </View>
          </>
        ) : (
          <>
            <Muted style={styles.dialogIntro}>{t('family.codeSent', { phone: phone.trim() })}</Muted>
            <Muted style={styles.dialogHint}>{t('family.askParentForCode')}</Muted>
            {devCode ? <Notice kind="success" message={t('family.devCodeNotice', { code: devCode })} /> : null}
            <Field
              label={t('family.enterCode')}
              value={code}
              onChangeText={setCode}
              placeholder={t('family.codePlaceholder')}
              keyboardType="number-pad"
              maxLength={6}
            />
            {error ? <Notice kind="error" message={error} /> : null}
            <View style={styles.dialogActions}>
              <Button label={t('family.verify')} onPress={submitCode} loading={busy} disabled={code.replace(/\D/g, '').length !== 6} />
              <Pressable
                accessibilityRole="button"
                onPress={sendCode}
                style={styles.linkBtn}
                hitSlop={8}
              >
                <Text style={[styles.linkBtnText, { color: colors.accent }]}>{t('family.resendCode')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPhase('phone');
                  setError(null);
                }}
                style={styles.linkBtn}
                hitSlop={8}
              >
                <Text style={[styles.linkBtnText, { color: colors.accent }]}>{t('family.changeNumber')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog
        visible={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title={t('family.revoke')}
      >
        {revokeTarget ? (
          <Text style={styles.dialogBody}>
            {t('family.confirmRevoke', {
              name: revokeTarget.parentName || revokeTarget.parentPhone || '',
            })}
          </Text>
        ) : null}
        <View style={styles.dialogActions}>
          <Button label={t('family.revoke')} variant="danger" onPress={confirmRevoke} />
          <Button label={t('family.cancel')} variant="secondary" onPress={() => setRevokeTarget(null)} />
        </View>
      </Dialog>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    page: {
      padding: isWide ? space.xl : space.md,
      paddingTop: space.md,
    },
    shell: {
      width: '100%',
      maxWidth: 960,
      alignSelf: 'center',
    },
    subtitle: { marginTop: space.xs, maxWidth: 620 },
    headerRow: {
      marginTop: space.xl,
      marginBottom: space.md,
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      justifyContent: 'space-between',
      gap: space.md,
    },
    sectionHeader: {},
    stateCard: {
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.xl,
    },
    stateText: { textAlign: 'center' },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.md,
    },
    parentCard: {
      flexGrow: 1,
      flexBasis: isWide ? '46%' : '100%',
      gap: space.md,
    },
    parentTop: { flexDirection: 'row', gap: space.md },
    parentAvatar: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    parentInfo: { flex: 1, minWidth: 0, gap: 4 },
    parentName: { fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    parentPhone: { fontSize: font.sm, fontFamily: family.regular, color: colors.textMuted },
    parentMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: 2,
    },
    parentRelationship: { fontSize: font.xs, fontFamily: family.medium, color: colors.textSubtle },
    parentActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    ghostDanger: {
      minHeight: TAP,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostDangerText: { fontSize: font.sm, fontFamily: family.semibold, color: colors.danger },
    dialogIntro: {
      fontSize: font.md,
      lineHeight: Math.round(font.md * 1.5),
      color: colors.textMuted,
    },
    dialogHint: { marginTop: space.sm },
    dialogBody: {
      fontSize: font.md,
      fontFamily: family.regular,
      lineHeight: Math.round(font.md * 1.5),
      color: colors.textMuted,
      marginTop: space.sm,
    },
    dialogActions: { marginTop: space.lg, gap: 12 },
    linkBtn: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
    linkBtnText: { fontFamily: family.semibold, fontSize: font.md },
    gateContainer: { padding: space.md, paddingTop: space.xl },
    gateCard: { alignItems: 'center', padding: space.lg, maxWidth: 460, alignSelf: 'center', width: '100%' },
    gateIconBlock: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gateTitle: { marginTop: space.md, textAlign: 'center' },
    gateBody: { marginTop: space.sm, textAlign: 'center' },
    gateAction: { marginTop: space.lg, alignSelf: 'stretch' },
  });
}
