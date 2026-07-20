import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { Body, Button, Card, Dialog, H1, H2, Muted } from '../../src/components/ui';
import { AppColors, family, font, radius, space, TAB_BAR_CLEARANCE, TAP, tracking, ROW_MIN_HEIGHT } from '../../src/lib/theme';
import {
  EMERGENCY_LINES,
  EMERGENCY_PRIMARY_DISPLAY,
  EMERGENCY_PRIMARY_NUMBER,
  HELPLINE_DISPLAY,
  HELPLINE_NUMBER,
} from '../../src/lib/config';
import { createCallbackRequest } from '../../src/lib/api';
import { listFamilyLinks, revokeFamilyLink } from '../../src/lib/family';
import { FamilyLink } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function Help() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, isCityStaff } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [guardians, setGuardians] = useState<FamilyLink[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<FamilyLink | null>(null);
  const [revoking, setRevoking] = useState(false);
  const callNumber = (number: string) => Linking.openURL(`tel:${number}`);

  // Trust surface: the parent must always be able to see, and remove, every
  // family member who can manage their account.
  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setGuardians([]);
      return;
    }
    let active = true;
    listFamilyLinks(token)
      .then((r) => {
        if (active) setGuardians(r.asParent.filter((link) => link.status !== 'revoked'));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function confirmRevoke() {
    const token = session?.access_token;
    if (!revokeTarget || !token || revoking) return;
    setRevoking(true);
    try {
      await revokeFamilyLink(token, revokeTarget.id);
      setGuardians((prev) => prev.filter((link) => link.id !== revokeTarget.id));
    } catch {
      // Leave the row in place so the user can retry.
    }
    setRevoking(false);
    setRevokeTarget(null);
  }

  // Guard against a malformed/empty config so the list still renders instead
  // of throwing during the map below.
  const emergencyLines = Array.isArray(EMERGENCY_LINES) ? EMERGENCY_LINES : [];

  async function submitCallback() {
    if (!name.trim() || !phone.trim() || saving) return;
    setSaving(true);
    setError('');
    const result = await createCallbackRequest({
      name: name.trim(),
      phone: phone.trim(),
      issue: issue.trim(),
      source: 'help',
      token: session?.access_token,
    });
    setSaving(false);
    if (result.ok) {
      setDone(true);
      setIssue('');
      return;
    }
    setError(result.error || t('help.callbackError'));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={t('help.title')} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <H1>{t('help.title')}</H1>
        <Muted style={styles.subtitle}>{t('help.subtitle')}</Muted>

        <Card style={styles.sosCard}>
          <Text style={styles.sosNumber}>{EMERGENCY_PRIMARY_DISPLAY}</Text>
          <Button label={t('help.callEmergency')} variant="danger" onPress={() => callNumber(EMERGENCY_PRIMARY_NUMBER)} />
          <Muted style={styles.sosHint}>{t('help.emergencyHint')}</Muted>
        </Card>

        <H2 style={styles.sectionHeader}>{t('help.directLinesTitle')}</H2>
        <Muted style={styles.sectionBody}>{t('help.directLinesBody')}</Muted>
        {emergencyLines.length > 0 ? (
          <Card style={styles.listCard}>
            {emergencyLines.map((line, index) => (
              <View key={line.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t(`help.emergencyLines.${line.key}`)} ${line.display}`}
                  onPress={() => callNumber(line.number)}
                  style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surfaceTint } : null]}
                >
                  <View style={styles.rowLead}>
                    <Feather name="phone" size={20} color={colors.text} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{t(`help.emergencyLines.${line.key}`)}</Text>
                    <Text style={styles.rowMeta}>{line.display}</Text>
                  </View>
                  <Feather name="chevron-right" size={22} color={colors.textSubtle} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        <H2 style={styles.sectionHeader}>{t('help.helpDeskTitle')}</H2>
        <Card style={styles.card}>
          <Body>{t('help.helpDeskBody')}</Body>
          <Text style={styles.helpDeskNumber}>{HELPLINE_DISPLAY}</Text>
          <Button label={t('help.callNow')} variant="secondary" onPress={() => callNumber(HELPLINE_NUMBER)} />
          <Muted>{t('help.languages')}</Muted>
        </Card>

        <H2 style={styles.sectionHeader}>{t('help.requestCallback')}</H2>
        <Card style={styles.card}>
          {done ? (
            <View style={styles.doneRow}>
              <Feather name="check-circle" size={20} color={colors.success} />
              <Body style={styles.doneText}>{t('help.submitted')}</Body>
            </View>
          ) : (
            <View style={styles.formStack}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('help.yourName')}</Text>
                <TextInput
                  style={styles.input}
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  accessibilityLabel={t('help.yourName')}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('help.yourPhone')}</Text>
                <TextInput
                  style={styles.input}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  accessibilityLabel={t('help.yourPhone')}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('help.describeIssue')}</Text>
                <TextInput
                  style={[styles.input, styles.issueInput]}
                  placeholderTextColor={colors.textMuted}
                  value={issue}
                  onChangeText={setIssue}
                  multiline
                  accessibilityLabel={t('help.describeIssue')}
                />
              </View>
              <Button
                label={t('help.submit')}
                onPress={submitCallback}
                loading={saving}
                disabled={!name.trim() || !phone.trim()}
              />
              {error ? <Muted style={styles.errorText}>{error}</Muted> : null}
            </View>
          )}
        </Card>

        {session ? (
          <>
            <H2 style={styles.sectionHeader}>{t('family.accessTitle')}</H2>
            <Card style={styles.card}>
              <Body>{t('family.accessIntro')}</Body>
              {guardians.length ? (
                <View style={styles.accessList}>
                  {guardians.map((link, index) => (
                    <View key={link.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <View style={styles.accessRow}>
                        <View style={styles.rowLead}>
                          <Feather name="user" size={20} color={colors.text} />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>{link.guardianName || t('family.guardianLabel')}</Text>
                          <Text style={styles.rowMeta}>
                            {link.status === 'active' ? t('family.statusActive') : t('family.statusPending')}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('family.revoke')}
                          onPress={() => setRevokeTarget(link)}
                          style={({ pressed }) => [styles.revokeBtn, pressed ? { opacity: 0.7 } : null]}
                        >
                          <Text style={styles.revokeLabel}>{t('family.revoke')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Muted>{t('family.noAccess')}</Muted>
              )}
              <Muted style={styles.accessHint}>{t('family.accessHint')}</Muted>
            </Card>
          </>
        ) : null}

        <H2 style={styles.sectionHeader}>{t('help.privacyTitle')}</H2>
        <Card style={styles.card}>
          <Body>{t('help.privacyBody')}</Body>
          <Button label={t('help.privacyCta')} variant="secondary" onPress={() => router.push('/privacy')} />
        </Card>

        {isCityStaff ? (
          <>
            <H2 style={styles.sectionHeader}>{t('admin.portalTitle')}</H2>
            <Card style={styles.card}>
              <Body>{t('admin.portalBody')}</Body>
              <Button
                label={t('admin.openPortal')}
                variant="secondary"
                onPress={() => router.push('/admin')}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>

      <Dialog visible={!!revokeTarget} onClose={() => setRevokeTarget(null)} title={t('family.accessTitle')}>
        <Body style={styles.dialogBody}>
          {t('family.confirmRevoke', { name: revokeTarget?.guardianName || t('family.guardianLabel') })}
        </Body>
        <View style={styles.dialogActions}>
          <Button label={t('family.cancel')} variant="secondary" onPress={() => setRevokeTarget(null)} />
          <Button label={t('family.revoke')} variant="danger" onPress={confirmRevoke} loading={revoking} />
        </View>
      </Dialog>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: space.md,
      paddingTop: space.sm,
      paddingBottom: TAB_BAR_CLEARANCE,
      gap: 0,
    },
    subtitle: { marginTop: space.xs, marginBottom: space.lg },
    sosCard: { gap: space.sm, marginBottom: space.md },
    sosNumber: {
      textAlign: 'center',
      fontSize: 64,
      lineHeight: 68,
      fontFamily: family.heavy,
      letterSpacing: tracking.display,
      color: colors.text,
    },
    sosHint: { textAlign: 'center' },
    sectionHeader: { marginTop: space.lg, marginBottom: space.sm },
    sectionBody: { marginBottom: space.sm },
    card: { gap: space.md },
    listCard: { padding: 0 },
    row: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: space.md,
      paddingVertical: 12,
    },
    rowLead: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    rowMeta: { fontSize: font.sm, fontFamily: family.regular, color: colors.textMuted, marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
    helpDeskNumber: { fontSize: font.xl, fontFamily: family.bold, color: colors.text },
    formStack: { gap: space.md },
    field: { gap: 6 },
    fieldLabel: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
    input: {
      backgroundColor: colors.surfaceTint,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      minHeight: TAP,
    },
    issueInput: { minHeight: 120, textAlignVertical: 'top' },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    doneText: { color: colors.success },
    errorText: { color: colors.danger },
    accessList: { marginTop: space.xs },
    accessRow: { minHeight: ROW_MIN_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    revokeBtn: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.sm },
    revokeLabel: { fontSize: font.sm, fontFamily: family.semibold, color: colors.danger },
    accessHint: { marginTop: space.sm },
    dialogBody: { marginBottom: space.md },
    dialogActions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  });
}
