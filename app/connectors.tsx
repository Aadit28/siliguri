import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card, H1, H2, Body, Muted, Badge } from '../src/components/ui';
import { AppColors, family, font, radius, space, ROW_MIN_HEIGHT } from '../src/lib/theme';
import { useTheme } from '../src/context/ThemeContext';
import { useLocale } from '../src/context/LocaleContext';
import { Connector, ConnectorStatus, CONNECTORS } from '../src/lib/connectors';

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

const KIND_META: Record<Connector['kind'], { icon: keyof typeof Feather.glyphMap; en: string; hi: string }> = {
  payment: { icon: 'credit-card', en: 'Payments', hi: 'भुगतान' },
  transport: { icon: 'truck', en: 'Travel', hi: 'यात्रा' },
  calendar: { icon: 'calendar', en: 'Calendar', hi: 'कैलेंडर' },
  family: { icon: 'users', en: 'Family', hi: 'परिवार' },
  emergency: { icon: 'life-buoy', en: 'Emergency', hi: 'आपातकाल' },
};

function StatusTag({ label, tone, colors }: { label: string; tone: 'strong' | 'soft'; colors: AppColors }) {
  return (
    <View
      style={[
        statusTagStyles.base,
        {
          backgroundColor: tone === 'strong' ? colors.chipBg : 'transparent',
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[statusTagStyles.text, { color: tone === 'strong' ? colors.text : colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const statusTagStyles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: { fontSize: font.xs, fontFamily: family.bold },
});

export default function ConnectorsScreen() {
  const { colors } = useTheme();
  const { lang } = useLocale();
  const styles = makeStyles(colors);

  const pick = (en: string, hi: string) => (lang === 'hi' ? hi : en);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: pick(COPY.title.en, COPY.title.hi) }} />
      <H1>{pick(COPY.title.en, COPY.title.hi)}</H1>
      <Body style={styles.intro}>{pick(COPY.intro.en, COPY.intro.hi)}</Body>

      {STATUS_ORDER.map((status) => {
        const group = CONNECTORS.filter((connector) => connector.status === status);
        if (group.length === 0) return null;
        return (
          <View key={status}>
            <H2 style={styles.sectionHeader}>{pick(COPY.sections[status].en, COPY.sections[status].hi)}</H2>
            <Card style={styles.listCard}>
              {group.map((connector, index) => {
                const kind = KIND_META[connector.kind];
                return (
                  <View key={connector.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.row}>
                      <View style={styles.rowLead}>
                        <Feather name={kind.icon} size={20} color={colors.text} />
                      </View>
                      <View style={styles.rowBody}>
                        <View style={styles.rowHeaderLine}>
                          <Text style={styles.connectorName}>{pick(connector.name, connector.nameHi)}</Text>
                          {connector.status === 'live' ? (
                            <Badge label={pick(STATUS_BADGE.live.en, STATUS_BADGE.live.hi)} />
                          ) : (
                            <StatusTag
                              label={pick(STATUS_BADGE[connector.status].en, STATUS_BADGE[connector.status].hi)}
                              tone={connector.status === 'partial' ? 'strong' : 'soft'}
                              colors={colors}
                            />
                          )}
                        </View>
                        <Muted style={styles.kindLabel}>{pick(kind.en, kind.hi)}</Muted>
                        <Body style={styles.description}>
                          {pick(connector.description, connector.descriptionHi)}
                        </Body>
                        {connector.configNote ? (
                          <Muted style={styles.configNote}>
                            {pick(connector.configNote, connector.configNoteHi ?? connector.configNote)}
                          </Muted>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    content: { padding: space.md, paddingBottom: space.xxl },
    intro: { marginTop: space.xs, marginBottom: space.sm },
    sectionHeader: { marginTop: space.lg, marginBottom: space.sm },
    listCard: { padding: 0 },
    row: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
    },
    rowLead: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, gap: 4 },
    rowHeaderLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
    connectorName: { fontSize: font.md, fontFamily: family.semibold, color: colors.text, flexShrink: 1 },
    kindLabel: { fontFamily: family.medium },
    description: { marginTop: 2 },
    configNote: { marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
  });
}
