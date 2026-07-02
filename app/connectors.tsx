import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card, H1, Body, Muted, Badge } from '../src/components/ui';
import { AppColors, font, space } from '../src/lib/theme';
import { useTheme } from '../src/context/ThemeContext';
import { useLocale } from '../src/context/LocaleContext';
import { Connector, ConnectorStatus, CONNECTORS } from '../src/lib/connectors';

// Theme has no warn accent; amber reads as "partly working" and keeps
// contrast with the badge text in both light and dark modes.
const PARTIAL_BADGE = '#B45309';

const STATUS_ORDER: ConnectorStatus[] = ['live', 'partial', 'planned'];

const COPY = {
  // hi must match home.connectors in hi.json so the tile label and the
  // screen title read the same for elderly users.
  title: { en: 'Connections', hi: 'जुड़ी सेवाएं' },
  intro: {
    en: 'These are the apps and services Saathi works with — what works today, and what is coming soon.',
    hi: 'ये वे ऐप और सेवाएँ हैं जिनके साथ साथी काम करता है — आज क्या चालू है, और आगे क्या आ रहा है।',
  },
  sections: {
    live: { en: 'Working now', hi: 'अभी चालू' },
    partial: { en: 'Partly working', hi: 'आंशिक रूप से चालू' },
    planned: { en: 'Coming soon', hi: 'जल्द आ रहा है' },
  },
} as const;

const STATUS_BADGE: Record<ConnectorStatus, { en: string; hi: string }> = {
  live: { en: 'Working', hi: 'चालू' },
  partial: { en: 'Partly working', hi: 'आंशिक' },
  planned: { en: 'Coming soon', hi: 'जल्द ही' },
};

const KIND_META: Record<Connector['kind'], { emoji: string; en: string; hi: string }> = {
  payment: { emoji: '💳', en: 'Payments', hi: 'भुगतान' },
  transport: { emoji: '🚗', en: 'Travel', hi: 'यात्रा' },
  calendar: { emoji: '📅', en: 'Calendar', hi: 'कैलेंडर' },
  family: { emoji: '👪', en: 'Family', hi: 'परिवार' },
  emergency: { emoji: '🚑', en: 'Emergency', hi: 'आपातकाल' },
};

export default function ConnectorsScreen() {
  const { colors } = useTheme();
  const { lang } = useLocale();
  const styles = makeStyles(colors);

  const pick = (en: string, hi: string) => (lang === 'hi' ? hi : en);

  const statusColor = (status: ConnectorStatus) =>
    status === 'live' ? colors.success : status === 'partial' ? PARTIAL_BADGE : colors.textMuted;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: pick(COPY.title.en, COPY.title.hi) }} />
      <H1>{pick(COPY.title.en, COPY.title.hi)}</H1>
      <Body>{pick(COPY.intro.en, COPY.intro.hi)}</Body>

      {STATUS_ORDER.map((status) => {
        const group = CONNECTORS.filter((connector) => connector.status === status);
        if (group.length === 0) return null;
        return (
          <View key={status}>
            <Muted style={styles.sectionLabel}>
              {pick(COPY.sections[status].en, COPY.sections[status].hi)}
            </Muted>
            <View style={styles.cardList}>
              {group.map((connector) => {
                const kind = KIND_META[connector.kind];
                return (
                  <Card key={connector.id} style={styles.connectorCard}>
                    <View style={styles.headerRow}>
                      <Text style={styles.kindEmoji}>{kind.emoji}</Text>
                      <Text style={[styles.connectorName, { color: colors.text }]}>
                        {pick(connector.name, connector.nameHi)}
                      </Text>
                    </View>
                    <View style={styles.badgeRow}>
                      <Badge
                        label={pick(STATUS_BADGE[connector.status].en, STATUS_BADGE[connector.status].hi)}
                        color={statusColor(connector.status)}
                      />
                      <Muted style={styles.kindLabel}>{pick(kind.en, kind.hi)}</Muted>
                    </View>
                    <Body>{pick(connector.description, connector.descriptionHi)}</Body>
                    {connector.configNote ? (
                      <Muted style={styles.configNote}>
                        {pick(connector.configNote, connector.configNoteHi ?? connector.configNote)}
                      </Muted>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    content: { padding: space.md, gap: space.sm },
    sectionLabel: { marginTop: space.md, marginBottom: space.xs, fontWeight: '800' },
    cardList: { gap: space.sm },
    connectorCard: { gap: space.xs },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    kindEmoji: { fontSize: font.xl },
    connectorName: { fontSize: font.lg, fontWeight: '900', flexShrink: 1 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    kindLabel: { fontWeight: '700' },
    configNote: { fontStyle: 'italic' },
  });
}
