import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import ConsentPanel from '../src/components/ConsentPanel';
import { Button, Card, H1, Muted } from '../src/components/ui';
import { AppColors, Tokens } from '../src/lib/theme';
import { useTokens } from '../src/lib/useTokens';
import { useTheme } from '../src/context/ThemeContext';

/**
 * The permanent home of the four consent toggles. Onboarding shows the same
 * panel once as a step; this screen is where a person comes back to change an
 * answer, which DPDP requires to be as easy as giving it was — so it is a
 * first-class row on the profile screen, not a paragraph inside a policy page.
 */
export default function ConsentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('consent.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <H1>{t('consent.title')}</H1>
        <Muted>{t('consent.intro')}</Muted>

        <ConsentPanel />

        <Card style={styles.card}>
          <Muted>{t('consent.privacyBody')}</Muted>
          <Button
            label={t('consent.privacyCta')}
            variant="secondary"
            onPress={() => router.push('/privacy')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: tk.space.md,
      paddingBottom: tk.space.xxl,
      gap: tk.space.md,
    },
    card: { gap: tk.space.sm },
  });
}
