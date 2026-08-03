// The nine guardian analytics metrics, defined once. The dashboard renders only
// each metric's headline number and label as a tile; the /guardian/metric screen
// renders the same metric's visual, breakdown and prose. Keeping both readings
// of a metric in one file is what stops a tile and its detail screen from
// drifting apart.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppColors, family, font, radius, space, TAP } from '../lib/theme';
import { ParentAnalytics } from '../lib/types';
import { formatISTStamp, relativeDayLabel } from '../lib/istDates';

export type MetricKey =
  | 'lastActive'
  | 'assistant7d'
  | 'assistant30d'
  | 'upcoming'
  | 'overdue'
  | 'done7d'
  | 'careTeam'
  | 'favorites'
  | 'callbacks';

export const METRIC_KEYS: MetricKey[] = [
  'lastActive',
  'assistant7d',
  'assistant30d',
  'upcoming',
  'overdue',
  'done7d',
  'careTeam',
  'favorites',
  'callbacks',
];

export function isMetricKey(value: unknown): value is MetricKey {
  return typeof value === 'string' && (METRIC_KEYS as string[]).includes(value);
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const METRIC_LABEL_KEYS: Record<MetricKey, string> = {
  lastActive: 'family.lastActiveLabel',
  assistant7d: 'family.assistantEvents7d',
  assistant30d: 'family.assistantEvents30d',
  upcoming: 'family.upcomingCount',
  overdue: 'family.overdueCount',
  done7d: 'family.doneThisWeek',
  careTeam: 'family.careTeamCount',
  favorites: 'family.favoritesCount',
  callbacks: 'family.tile.callbacksLabel',
};

export function metricLabel(key: MetricKey, t: Translate) {
  return t(METRIC_LABEL_KEYS[key]);
}

export function openCallbacksOf(data: ParentAnalytics) {
  return data.callbacks.filter((cb) => cb.status !== 'closed' && cb.status !== 'spam');
}

// The short form: what fits on a tile. A relative day for last-active (a full
// IST stamp would clip), a plain count for everything else.
export function metricValue(key: MetricKey, data: ParentAnalytics, t: Translate) {
  switch (key) {
    case 'lastActive':
      return data.lastActiveAt
        ? relativeDayLabel(data.lastActiveAt, t) ?? formatISTStamp(data.lastActiveAt)
        : t('family.neverActive');
    case 'assistant7d':
      return String(data.assistantEvents7d);
    case 'assistant30d':
      return String(data.assistantEvents30d);
    case 'upcoming':
      return String(data.reminders.upcoming);
    case 'overdue':
      return String(data.reminders.overdue);
    case 'done7d':
      return String(data.reminders.done7d);
    case 'careTeam':
      return String(data.careTeamCount);
    case 'favorites':
      return String(data.favoritesCount);
    case 'callbacks':
      return String(openCallbacksOf(data).length);
  }
}

// ----- Shared visual language -----

export type BarSegment = { key: string; value: number; color: string; emphasized: boolean };

type MetricStyles = ReturnType<typeof makeMetricStyles>;

// Proportion bar drawn from plain Views: each segment's percentage width is the
// number it represents. Purely decorative — every figure it encodes is also
// printed in the legend and summary line beneath it.
export function ProportionBar({ segments, styles }: { segments: BarSegment[]; styles: MetricStyles }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) return null;
  return (
    <View style={styles.barTrack} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {segments.map((s) => {
        const value = Math.max(0, s.value);
        if (value === 0) return null;
        return (
          <View
            key={s.key}
            testID={`bar-seg-${s.key}`}
            style={[
              styles.barSegment,
              { width: `${(value / total) * 100}%`, backgroundColor: s.color, opacity: s.emphasized ? 1 : 0.4 },
            ]}
          />
        );
      })}
    </View>
  );
}

export function LegendRow({
  color,
  label,
  value,
  emphasized,
  styles,
}: {
  color: string;
  label: string;
  value: number | string;
  emphasized: boolean;
  styles: MetricStyles;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color, opacity: emphasized ? 1 : 0.4 }]} />
      <Text style={[styles.legendLabel, emphasized ? styles.legendLabelOn : null]}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

// ----- Metric body: visual + breakdown, then prose -----

export function MetricVisual({
  metricKey,
  data,
  colors,
}: {
  metricKey: MetricKey;
  data: ParentAnalytics;
  colors: AppColors;
}) {
  const { t } = useTranslation();
  const styles = makeMetricStyles(colors);

  const upcoming = Math.max(0, data.reminders.upcoming);
  const overdue = Math.max(0, data.reminders.overdue);
  const done7d = Math.max(0, data.reminders.done7d);
  const reminderTotal = upcoming + overdue + done7d;

  const events7d = Math.max(0, data.assistantEvents7d);
  const events30d = Math.max(0, data.assistantEvents30d);
  // 30d should contain 7d, but never trust it: a negative remainder would draw
  // a bar that lies. Clamp at zero and widen the denominator instead.
  const eventsEarlier = Math.max(0, events30d - events7d);
  const eventsTotal = events7d + eventsEarlier;

  const openCallbacks = openCallbacksOf(data);
  const closedCallbacks = Math.max(0, data.callbacks.length - openCallbacks.length);

  if (metricKey === 'upcoming' || metricKey === 'overdue' || metricKey === 'done7d') {
    const emphasis = metricKey === 'done7d' ? 'done' : metricKey;
    if (reminderTotal === 0) return <Text style={styles.text}>{t('family.tile.remindersEmpty')}</Text>;
    return (
      <View style={styles.block}>
        <ProportionBar
          styles={styles}
          segments={[
            { key: 'upcoming', value: upcoming, color: colors.accent, emphasized: emphasis === 'upcoming' },
            { key: 'overdue', value: overdue, color: colors.danger, emphasized: emphasis === 'overdue' },
            { key: 'done', value: done7d, color: colors.success, emphasized: emphasis === 'done' },
          ]}
        />
        <LegendRow
          styles={styles}
          color={colors.accent}
          label={t('family.upcomingCount')}
          value={upcoming}
          emphasized={emphasis === 'upcoming'}
        />
        <LegendRow
          styles={styles}
          color={colors.danger}
          label={t('family.overdueCount')}
          value={overdue}
          emphasized={emphasis === 'overdue'}
        />
        <LegendRow
          styles={styles}
          color={colors.success}
          label={t('family.doneThisWeek')}
          value={done7d}
          emphasized={emphasis === 'done'}
        />
        <Text style={styles.text}>
          {t('family.tile.remindersSummary', { total: reminderTotal, upcoming, overdue, done: done7d })}
        </Text>
      </View>
    );
  }

  if (metricKey === 'assistant7d' || metricKey === 'assistant30d') {
    const emphasis = metricKey === 'assistant7d' ? 'recent' : 'earlier';
    if (eventsTotal === 0) return <Text style={styles.text}>{t('family.tile.assistantEmpty')}</Text>;
    return (
      <View style={styles.block}>
        <ProportionBar
          styles={styles}
          segments={[
            { key: 'recent', value: events7d, color: colors.accent, emphasized: emphasis === 'recent' },
            { key: 'earlier', value: eventsEarlier, color: colors.primary, emphasized: emphasis === 'earlier' },
          ]}
        />
        <LegendRow
          styles={styles}
          color={colors.accent}
          label={t('family.tile.assistantLegendRecent')}
          value={events7d}
          emphasized={emphasis === 'recent'}
        />
        <LegendRow
          styles={styles}
          color={colors.primary}
          label={t('family.tile.assistantLegendEarlier')}
          value={eventsEarlier}
          emphasized={emphasis === 'earlier'}
        />
        <Text style={styles.text}>
          {t('family.tile.assistantSummary', { total: eventsTotal, recent: events7d, earlier: eventsEarlier })}
        </Text>
      </View>
    );
  }

  if (metricKey === 'callbacks') {
    if (data.callbacks.length === 0) return <Text style={styles.text}>{t('family.tile.callbacksNone')}</Text>;
    return (
      <View style={styles.block}>
        <ProportionBar
          styles={styles}
          segments={[
            { key: 'open', value: openCallbacks.length, color: colors.accent, emphasized: true },
            { key: 'closed', value: closedCallbacks, color: colors.success, emphasized: false },
          ]}
        />
        <LegendRow
          styles={styles}
          color={colors.accent}
          label={t('family.tile.callbacksLabel')}
          value={openCallbacks.length}
          emphasized
        />
        <LegendRow
          styles={styles}
          color={colors.success}
          label={t('family.metric.callbacksClosed')}
          value={closedCallbacks}
          emphasized={false}
        />
        <Text style={styles.text}>
          {t('family.tile.callbacksSummary', { open: openCallbacks.length, total: data.callbacks.length })}
        </Text>
      </View>
    );
  }

  if (metricKey === 'careTeam' || metricKey === 'favorites') {
    const saved = metricKey === 'careTeam' ? Math.max(0, data.careTeamCount) : Math.max(0, data.favoritesCount);
    const other = metricKey === 'careTeam' ? Math.max(0, data.favoritesCount) : Math.max(0, data.careTeamCount);
    if (saved + other === 0) return <Text style={styles.text}>{t('family.metric.savedEmpty')}</Text>;
    return (
      <View style={styles.block}>
        <ProportionBar
          styles={styles}
          segments={[
            { key: 'this', value: saved, color: colors.accent, emphasized: true },
            { key: 'other', value: other, color: colors.primary, emphasized: false },
          ]}
        />
        <LegendRow
          styles={styles}
          color={colors.accent}
          label={t('family.careTeamCount')}
          value={Math.max(0, data.careTeamCount)}
          emphasized={metricKey === 'careTeam'}
        />
        <LegendRow
          styles={styles}
          color={colors.primary}
          label={t('family.favoritesCount')}
          value={Math.max(0, data.favoritesCount)}
          emphasized={metricKey === 'favorites'}
        />
        <Text style={styles.text}>
          {t('family.metric.savedSummary', {
            careTeam: Math.max(0, data.careTeamCount),
            favorites: Math.max(0, data.favoritesCount),
          })}
        </Text>
      </View>
    );
  }

  // lastActive: a single instant has no proportion to draw. The bar would be a
  // decoration standing in for nothing, so the stamp itself is the visual.
  return (
    <View style={styles.block}>
      <View style={[styles.stampBlock, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}>
        <Feather name={data.lastActiveAt ? 'clock' : 'alert-circle'} size={22} color={colors.textMuted} />
        <Text style={styles.stampText}>
          {data.lastActiveAt ? formatISTStamp(data.lastActiveAt) : t('family.neverActive')}
        </Text>
      </View>
    </View>
  );
}

export function MetricDetail({
  metricKey,
  data,
  colors,
  parentId,
}: {
  metricKey: MetricKey;
  data: ParentAnalytics;
  colors: AppColors;
  parentId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const styles = makeMetricStyles(colors);

  if (metricKey === 'lastActive') {
    return (
      <Text style={styles.text}>
        {data.lastActiveAt
          ? t('family.tile.lastActiveFull', { stamp: formatISTStamp(data.lastActiveAt) })
          : t('family.tile.lastActiveNever')}
      </Text>
    );
  }

  if (metricKey === 'assistant7d' || metricKey === 'assistant30d') {
    return <Text style={styles.text}>{t('family.tile.assistantWhat')}</Text>;
  }

  if (metricKey === 'upcoming' || metricKey === 'overdue' || metricKey === 'done7d') {
    return <Text style={styles.text}>{t(`family.metric.${metricKey}Detail`)}</Text>;
  }

  if (metricKey === 'careTeam') {
    return (
      <View style={styles.block}>
        <Text style={styles.text}>{t('family.tile.careTeamSummary', { n: data.careTeamCount })}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.tile.careTeamOpen')}
          testID="metric-open-care-team"
          onPress={() => router.replace({ pathname: '/guardian/[parentId]', params: { parentId, section: 'care' } })}
          style={({ pressed }) => [styles.link, pressed ? { backgroundColor: colors.surfaceTint } : null]}
        >
          <Feather name="users" size={16} color={colors.accent} />
          <Text style={[styles.linkText, { color: colors.accent }]}>{t('family.tile.careTeamOpen')}</Text>
        </Pressable>
      </View>
    );
  }

  if (metricKey === 'favorites') {
    return (
      <View style={styles.block}>
        <Text style={styles.text}>{t('family.tile.favoritesSummary', { n: data.favoritesCount })}</Text>
        <Text style={styles.text}>{t('family.tile.favoritesWhat')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.metric.favoritesOpen')}
          testID="metric-open-favorites"
          onPress={() => router.replace({ pathname: '/guardian/[parentId]', params: { parentId, section: 'places' } })}
          style={({ pressed }) => [styles.link, pressed ? { backgroundColor: colors.surfaceTint } : null]}
        >
          <Feather name="star" size={16} color={colors.accent} />
          <Text style={[styles.linkText, { color: colors.accent }]}>{t('family.metric.favoritesOpen')}</Text>
        </Pressable>
      </View>
    );
  }

  // callbacks
  if (data.callbacks.length === 0) {
    return <Text style={styles.text}>{t('family.tile.callbacksNone')}</Text>;
  }
  return (
    <View style={styles.block}>
      <Text style={styles.text}>{t('family.metric.callbacksDetail')}</Text>
      {data.callbacks.map((cb) => (
        // Keyed by the row's own data, not its index: the live poll swaps the
        // array wholesale and index keys would remount every row.
        <View key={`${cb.created_at}|${cb.status}|${cb.issue ?? ''}`} style={styles.callbackRow}>
          <Text style={styles.callbackIssue}>{cb.issue || t('family.tile.callbackNoIssue')}</Text>
          <Text style={styles.callbackMeta}>
            {[
              t(`family.callbackStatus.${cb.status}`, { defaultValue: cb.status }),
              relativeDayLabel(cb.created_at, t),
              formatISTStamp(cb.created_at),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function makeMetricStyles(colors: AppColors) {
  return StyleSheet.create({
    block: { gap: space.xs },
    text: {
      fontSize: font.sm,
      fontFamily: family.regular,
      color: colors.textMuted,
      lineHeight: Math.round(font.sm * 1.45),
      marginTop: space.xs,
    },
    barTrack: {
      flexDirection: 'row',
      height: 18,
      borderRadius: radius.pill,
      overflow: 'hidden',
      backgroundColor: colors.surfaceTint,
      marginTop: space.xs,
      marginBottom: space.xs,
    },
    barSegment: { height: '100%' },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
    legendDot: { width: 12, height: 12, borderRadius: radius.pill },
    legendLabel: { flex: 1, minWidth: 0, fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
    legendLabelOn: { fontFamily: family.semibold, color: colors.text },
    legendValue: { fontSize: font.sm, fontFamily: family.semibold, color: colors.text },
    stampBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: space.md,
    },
    stampText: {
      flex: 1,
      minWidth: 0,
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.text,
      lineHeight: Math.round(font.md * 1.4),
    },
    link: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: space.sm,
      marginLeft: -space.sm,
      borderRadius: radius.pill,
    },
    linkText: { fontSize: font.sm, fontFamily: family.semibold },
    callbackRow: {
      gap: 2,
      paddingVertical: space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    callbackIssue: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.text,
      lineHeight: Math.round(font.sm * 1.45),
    },
    callbackMeta: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
      lineHeight: Math.round(font.xs * 1.4),
    },
  });
}
