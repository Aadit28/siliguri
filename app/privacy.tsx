import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { H1, H2, Body, Muted, Card } from '../src/components/ui';
import { AppColors, space } from '../src/lib/theme';
import { useTheme } from '../src/context/ThemeContext';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const sections = [
    { title: t('privacy.dataTitle'), body: t('privacy.dataBody') },
    { title: t('privacy.consentTitle'), body: t('privacy.consentBody') },
    { title: t('privacy.medicalTitle'), body: t('privacy.medicalBody') },
    { title: t('privacy.grievanceTitle'), body: t('privacy.grievanceBody') },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: t('privacy.title') }} />
      <View style={styles.hero}>
        <H1>{t('privacy.title')}</H1>
        <Body style={styles.intro}>{t('privacy.intro')}</Body>
      </View>

      {sections.map((section) => (
        <Card key={section.title} style={styles.card}>
          <H2>{section.title}</H2>
          <Muted style={styles.body}>{section.body}</Muted>
        </Card>
      ))}
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: space.md,
      paddingBottom: space.xl,
      gap: space.md,
    },
    hero: {
      paddingHorizontal: space.xs,
      gap: space.sm,
    },
    card: { gap: space.xs },
    intro: {
      color: colors.textMuted,
    },
    body: {
      lineHeight: 26,
    },
  });
}
