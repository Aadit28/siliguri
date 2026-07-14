import React, { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Body, Button, H1, H2, Muted } from '../../src/components/ui';
import { AppColors, font, radius, shadow, space } from '../../src/lib/theme';
import {
  EMERGENCY_LINES,
  EMERGENCY_PRIMARY_DISPLAY,
  EMERGENCY_PRIMARY_NUMBER,
  HELPLINE_DISPLAY,
  HELPLINE_NUMBER,
} from '../../src/lib/config';
import { createCallbackRequest } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function Help() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const styles = makeStyles(colors, isWide);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const callNumber = (number: string) => Linking.openURL(`tel:${number}`);

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
      <View style={styles.stageGlow} />
      <AppHeader title={t('help.title')} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.sosPanel}>
          <View style={styles.sosCopy}>
            <Text style={styles.sosKicker}>{t('help.emergency')}</Text>
            <Text selectable style={styles.sosNumber}>
              {EMERGENCY_PRIMARY_DISPLAY}
            </Text>
            <H1 style={styles.sosTitle}>{t('help.title')}</H1>
            <Body style={styles.sosBody}>{t('help.subtitle')}</Body>
          </View>
          <View style={styles.sosActionStack}>
            <TouchableOpacity
              style={styles.bigCall}
              onPress={() => callNumber(EMERGENCY_PRIMARY_NUMBER)}
              activeOpacity={0.86}
            >
              <Text style={styles.bigCallText}>{t('help.callEmergency')}</Text>
            </TouchableOpacity>
            <Text style={styles.sosHint}>{t('help.emergencyHint')}</Text>
          </View>
        </View>

        <View style={styles.directPanel}>
          <View style={styles.directCopy}>
            <Text style={styles.kicker}>{t('help.directLinesTitle')}</Text>
            <H2>{t('help.directLinesTitle')}</H2>
            <Muted style={styles.directBody}>{t('help.directLinesBody')}</Muted>
          </View>
          <View style={styles.directGrid}>
            {EMERGENCY_LINES.map((line) => (
              <TouchableOpacity
                key={line.key}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={`${t(`help.emergencyLines.${line.key}`)} ${line.display}`}
                onPress={() => callNumber(line.number)}
                style={styles.directLine}
              >
                <Text style={styles.directLabel}>{t(`help.emergencyLines.${line.key}`)}</Text>
                <Text selectable style={styles.directNumber}>
                  {line.display}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.supportShell}>
          <View style={styles.helpDeskPanel}>
            <Text style={styles.kicker}>{t('help.helpDeskTitle')}</Text>
            <H2>{t('help.helpDeskTitle')}</H2>
            <Muted style={styles.panelBody}>{t('help.helpDeskBody')}</Muted>
            <Text selectable style={styles.helpDeskNumber}>
              {HELPLINE_DISPLAY}
            </Text>
            <Button label={t('help.callNow')} variant="secondary" onPress={() => callNumber(HELPLINE_NUMBER)} />
            <Muted style={styles.panelBody}>{t('help.languages')}</Muted>
          </View>

          <View style={styles.callbackPanel}>
            <Text style={styles.kicker}>{t('help.requestCallback')}</Text>
            <H2>{t('help.requestCallback')}</H2>
            {done ? (
              <View style={styles.donePanel}>
                <Body style={styles.doneText}>Done: {t('help.submitted')}</Body>
              </View>
            ) : (
              <View style={styles.formStack}>
                <View>
                  <Text style={styles.label}>{t('help.yourName')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
                <View>
                  <Text style={styles.label}>{t('help.yourPhone')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
                <View>
                  <Text style={styles.label}>{t('help.describeIssue')}</Text>
                  <TextInput
                    style={[styles.input, styles.issueInput]}
                    placeholderTextColor={colors.textMuted}
                    value={issue}
                    onChangeText={setIssue}
                    multiline
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
          </View>
        </View>

        <View style={styles.privacyPanel}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{t('help.privacyTitle')}</Text>
            <H2>{t('help.privacyTitle')}</H2>
            <Muted style={styles.panelBody}>{t('help.privacyBody')}</Muted>
          </View>
          <Button label={t('help.privacyCta')} variant="secondary" onPress={() => router.push('/privacy')} />
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    stageGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 360,
      backgroundColor: colors.emergencySoft,
    },
    content: {
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: isWide ? space.xl * 2 : 118,
      gap: space.lg,
    },
    sosPanel: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: 'stretch',
      gap: space.lg,
      borderRadius: 16,
      backgroundColor: colors.emergency,
      borderWidth: 1,
      borderColor: colors.emergencySoft,
      padding: isWide ? space.xl : space.lg,
      ...shadow.md,
    },
    sosCopy: { flex: 1, gap: space.sm },
    sosKicker: { color: 'rgba(255,255,255,0.72)', fontSize: font.xs, fontWeight: '900', textTransform: 'uppercase' },
    sosNumber: { color: '#fff', fontSize: isWide ? 104 : 82, lineHeight: isWide ? 110 : 88, fontWeight: '900' },
    sosTitle: { color: '#fff' },
    sosBody: { color: 'rgba(255,255,255,0.84)', maxWidth: 720 },
    sosActionStack: {
      flex: isWide ? 0.75 : undefined,
      justifyContent: 'center',
      gap: space.sm,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      padding: space.lg,
    },
    bigCall: {
      minHeight: 74,
      borderRadius: radius.lg,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
    },
    bigCallText: { color: colors.emergencyDark, fontSize: font.lg, fontWeight: '900', textAlign: 'center' },
    sosHint: { color: 'rgba(255,255,255,0.82)', fontSize: font.sm, lineHeight: 22, fontWeight: '800' },
    directPanel: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.lg,
      borderRadius: 16,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isWide ? space.xl : space.lg,
      ...shadow.sm,
    },
    directCopy: { flex: 0.75, gap: space.xs },
    kicker: { color: colors.accentDark, fontSize: font.xs, fontWeight: '900', textTransform: 'uppercase' },
    directBody: { marginTop: space.xs },
    directGrid: { flex: 1.2, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    directLine: {
      flexGrow: 1,
      flexBasis: isWide ? '22%' : '47%',
      minHeight: 116,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.emergencySoft,
      backgroundColor: colors.dangerSoft,
      padding: space.md,
      justifyContent: 'space-between',
    },
    directLabel: { color: colors.text, fontSize: font.sm, lineHeight: 22, fontWeight: '900' },
    directNumber: { color: colors.emergencyDark, fontSize: font.xl, lineHeight: 36, fontWeight: '900' },
    supportShell: { flexDirection: isWide ? 'row' : 'column', gap: space.lg },
    helpDeskPanel: {
      flex: 0.85,
      gap: space.md,
      borderRadius: 16,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isWide ? space.xl : space.lg,
      ...shadow.sm,
    },
    callbackPanel: {
      flex: 1.15,
      gap: space.md,
      borderRadius: 16,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isWide ? space.xl : space.lg,
      ...shadow.sm,
    },
    panelBody: { marginTop: space.xs },
    helpDeskNumber: { color: colors.text, fontSize: font.xl, lineHeight: 36, fontWeight: '900' },
    formStack: { gap: space.md },
    label: { fontSize: font.sm, fontWeight: '900', color: colors.text, marginBottom: 6 },
    input: {
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      color: colors.text,
      minHeight: 58,
    },
    issueInput: { minHeight: 120, textAlignVertical: 'top' },
    donePanel: {
      borderRadius: radius.lg,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.md,
    },
    doneText: { color: colors.success, fontWeight: '900' },
    errorText: { color: colors.emergencyDark, fontWeight: '900' },
    privacyPanel: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      gap: space.lg,
      borderRadius: 16,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      padding: isWide ? space.xl : space.lg,
      ...shadow.sm,
    },
  });
}
