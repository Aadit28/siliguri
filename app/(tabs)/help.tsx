import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import SiteFooter from '../../src/components/SiteFooter';
import { Body, Button, Card, H1, H2, Muted } from '../../src/components/ui';
import { AppColors, family, font, radius, space, TAP, tracking } from '../../src/lib/theme';
import { HELPLINE_NUMBER, HELPLINE_DISPLAY } from '../../src/lib/config';
import { useTheme } from '../../src/context/ThemeContext';

type Field = 'name' | 'phone' | 'issue';

export default function Help() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [done, setDone] = useState(false);
  const [focused, setFocused] = useState<Field | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={t('help.title')} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View>
          <View style={styles.kicker}>
            <Feather name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.kickerText}>{t('help.emergency')}</Text>
          </View>
          <H1>{t('help.title')}</H1>
          <Muted style={styles.subtitle}>{t('help.subtitle')}</Muted>
        </View>

        <Card>
          <View style={styles.helplineRow}>
            <View style={styles.helplineBlock}>
              <Feather name="phone-call" size={28} color={colors.danger} />
            </View>
            <View style={styles.helplineInfo}>
              <Text style={styles.helplineNumber} numberOfLines={1} adjustsFontSizeToFit>
                {HELPLINE_DISPLAY}
              </Text>
              <View style={styles.helplineMetaRow}>
                <Feather name="globe" size={16} color={colors.textMuted} />
                <Muted style={styles.helplineMeta} numberOfLines={2}>
                  {t('help.languages')}
                </Muted>
              </View>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <Button
            label={t('help.callNow')}
            variant="danger"
            icon={<Feather name="phone" size={20} color={colors.dangerFg} />}
            onPress={() => Linking.openURL(`tel:${HELPLINE_NUMBER}`)}
          />
        </Card>

        <View style={styles.section}>
          <H2>{t('help.requestCallback')}</H2>
          {done ? (
            <View style={styles.successCard} accessibilityLiveRegion="polite">
              <View style={styles.successDisc}>
                <Feather name="check-circle" size={22} color={colors.successFg} />
              </View>
              <Body style={styles.successText}>{t('help.submitted')}</Body>
            </View>
          ) : (
            <Card style={styles.formCard}>
              <View>
                <Text style={styles.label}>{t('help.yourName')}</Text>
                <TextInput
                  style={[styles.input, focused === 'name' && styles.inputFocused]}
                  accessibilityLabel={t('help.yourName')}
                  placeholderTextColor={colors.textSubtle}
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                />
              </View>
              <View>
                <Text style={styles.label}>{t('help.yourPhone')}</Text>
                <TextInput
                  style={[styles.input, focused === 'phone' && styles.inputFocused]}
                  accessibilityLabel={t('help.yourPhone')}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => setFocused('phone')}
                  onBlur={() => setFocused(null)}
                />
              </View>
              <View>
                <Text style={styles.label}>{t('help.describeIssue')}</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    focused === 'issue' && styles.inputFocused,
                  ]}
                  accessibilityLabel={t('help.describeIssue')}
                  placeholderTextColor={colors.textSubtle}
                  value={issue}
                  onChangeText={setIssue}
                  onFocus={() => setFocused('issue')}
                  onBlur={() => setFocused(null)}
                  multiline
                />
              </View>
              <Button
                label={t('help.submit')}
                icon={<Feather name="phone-incoming" size={20} color={colors.primaryFg} />}
                onPress={() => setDone(true)}
                disabled={!name.trim() || !phone.trim()}
              />
            </Card>
          )}
        </View>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: {
      padding: space.md,
      paddingTop: space.sm,
      paddingBottom: 0,
      gap: space.lg,
      flexGrow: 1,
    },
    kicker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: space.xs,
      marginBottom: space.sm,
    },
    kickerText: {
      color: colors.danger,
      fontSize: font.xs,
      fontFamily: family.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    subtitle: { marginTop: space.xs },
    helplineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    helplineBlock: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      backgroundColor: colors.dangerSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helplineInfo: { flex: 1, minWidth: 0 },
    helplineNumber: {
      color: colors.text,
      fontSize: font.xl,
      fontFamily: family.heavy,
      letterSpacing: tracking.xl,
      lineHeight: Math.round(font.xl * 1.25),
    },
    helplineMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: space.xs,
    },
    helplineMeta: { flex: 1, minWidth: 0 },
    cardDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: space.md,
    },
    section: { gap: 12 },
    successCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: space.md,
      minHeight: TAP,
    },
    successDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successText: { flex: 1, fontFamily: family.semibold },
    formCard: { gap: space.md },
    label: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.text,
      marginBottom: space.sm,
    },
    input: {
      backgroundColor: colors.surfaceTint,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: 14,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      minHeight: TAP,
    },
    inputFocused: { borderColor: colors.glassBorder },
    inputMultiline: {
      minHeight: 120,
      paddingTop: 14,
      textAlignVertical: 'top',
    },
  });
}
