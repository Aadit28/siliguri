import React, { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Card, H1, H2, Body, Muted, Button } from '../../src/components/ui';
import { colors, font, radius, space } from '../../src/lib/theme';
import { HELPLINE_NUMBER, HELPLINE_DISPLAY } from '../../src/lib/config';

export default function Help() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [done, setDone] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={t('help.title')} />
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xl }}>
        <H1 style={{ color: colors.danger }}>🆘 {t('help.title')}</H1>
        <Body style={{ marginTop: 4 }}>{t('help.subtitle')}</Body>
        <Muted style={{ marginTop: 6 }}>🌐 {t('help.languages')}</Muted>

        <Card style={{ marginTop: space.lg }}>
          <H2>☎ {HELPLINE_DISPLAY}</H2>
          <View style={{ marginTop: space.md }}>
            <Button
              label={t('help.callNow')}
              icon="☎"
              variant="danger"
              onPress={() => Linking.openURL(`tel:${HELPLINE_NUMBER}`)}
            />
          </View>
        </Card>

        <H2 style={{ marginTop: space.lg, marginBottom: space.sm }}>{t('help.requestCallback')}</H2>
        {done ? (
          <Card style={{ backgroundColor: '#EAF6EC', borderColor: '#BFE3C6' }}>
            <Body style={{ color: colors.accent }}>✓ {t('help.submitted')}</Body>
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            <TextInput
              style={styles.input}
              placeholder={t('help.yourName')}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder={t('help.yourPhone')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              placeholder={t('help.describeIssue')}
              placeholderTextColor={colors.textMuted}
              value={issue}
              onChangeText={setIssue}
              multiline
            />
            <Button
              label={t('help.submit')}
              onPress={() => setDone(true)}
              disabled={!name.trim() || !phone.trim()}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.md,
    color: colors.text,
    minHeight: 54,
  },
});
