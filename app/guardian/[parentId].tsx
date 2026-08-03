import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from '../../src/components/AppHeader';
import { Button, Card, Chip, Dialog, H1, H2, Muted } from '../../src/components/ui';
import {
  METRIC_KEYS,
  MetricKey,
  metricLabel,
  metricValue,
} from '../../src/components/GuardianMetric';
import { AppColors, family, font, radius, shadow, space, TAB_BAR_CLEARANCE, TAP } from '../../src/lib/theme';
import {
  CareTeamCategory,
  CareTeamMember,
  FamilyFavorite,
  FamilyReminder,
  FamilyReminderRepeat,
  ParentAnalytics,
  Service,
} from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchServices } from '../../src/lib/api';
import { useLivePoll } from '../../src/lib/useLivePoll';
import {
  addFamilyFavorite,
  addFamilyReminder,
  fetchParentAnalytics,
  friendlyFamilyError,
  listCareTeam,
  listFamilyFavorites,
  listFamilyLinks,
  listFamilyReminders,
  markFamilyReminderDone,
  removeCareTeamMember,
  removeFamilyFavorite,
  removeFamilyReminder,
  setCareTeamMember,
  updateFamilyReminder,
} from '../../src/lib/family';
import { markLoginIntent } from '../../src/lib/authNavigation';
import { requestAssistantPlan, ProposedReminder } from '../../src/lib/assistant';
import { requestMicPermission, speechRecognitionSupported, startListening, voiceErrorKey } from '../../src/lib/voice';
import { useKeyboardInset } from '../../src/lib/useKeyboardInset';
import { isValidISODate, normalizeTimeInput } from '../../src/lib/calendar';
import { todayISO } from '../../src/lib/notifications';
import {
  MONTHS_SHORT,
  daysBetweenISO,
  formatISTStamp,
  istDateISO,
  pad,
  relativeDayLabel,
  shiftISO,
  toISO,
} from '../../src/lib/istDates';

type SectionKey = 'overview' | 'reminders' | 'places' | 'care';

const SECTION_KEYS: SectionKey[] = ['overview', 'reminders', 'places', 'care'];

const REMINDER_REPEATS: FamilyReminderRepeat[] = ['once', 'daily', 'weekly', 'monthly'];
const CARE_CATEGORIES: CareTeamCategory[] = ['doctor', 'grocery', 'pharmacy', 'hospital', 'helper', 'other'];

// Reminder times are the parent's local (Asia/Kolkata) wall clock. Guardians
// abroad see the same numbers relabelled so there's no ambiguity — "8:30 AM IST".
function formatISTTime(time?: string | null) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period} IST`;
}

// A reminder's dateISO is the parent's local day. Rendered the same way as the
// calendar screen renders an event date, never as a raw 2026-08-04.
function formatReadableDate(dateISO: string) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return dateISO;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Success notices are transient: "Saved." must not still be sitting next to a
// form the guardian has since started editing again.
function useAutoClear(active: boolean, clear: () => void, ms = 4000) {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(clear, ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

function monthName(year: number, month: number) {
  return `${MONTHS_SHORT[((month % 12) + 12) % 12]} ${year + Math.floor(month / 12)}`;
}

// Weeks of day numbers for the given month; null = blank leading/trailing cell.
function monthMatrix(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Inline month-grid date picker, mirroring the calendar screen's pattern so a
// guardian taps a real day instead of typing a raw YYYY-MM-DD string.
function DatePicker({
  valueISO,
  onChange,
  colors,
  styles,
}: {
  valueISO: string;
  onChange: (iso: string) => void;
  colors: AppColors;
  styles: Styles;
}) {
  const [cursor, setCursor] = useState(() => {
    // Fall back to the IST "today" the rest of the screen uses, so the grid
    // never opens on the guardian's own (possibly different) calendar month.
    const [y, m] = (valueISO || todayISO()).split('-').map(Number);
    const base = y && m ? new Date(y, m - 1, 1) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const weeks = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' })),
    [],
  );
  const today = todayISO();

  function goMonth(delta: number) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <View style={[styles.pickerCard, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}>
      <View style={styles.pickerHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={monthName(cursor.year, cursor.month - 1)}
          onPress={() => goMonth(-1)}
          hitSlop={8}
          style={({ pressed }) => [styles.pickerNav, pressed ? { backgroundColor: colors.overlay } : null]}
        >
          <Feather name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.pickerMonth}>{monthName(cursor.year, cursor.month)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={monthName(cursor.year, cursor.month + 1)}
          onPress={() => goMonth(1)}
          hitSlop={8}
          style={({ pressed }) => [styles.pickerNav, pressed ? { backgroundColor: colors.overlay } : null]}
        >
          <Feather name="chevron-right" size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.pickerWeekRow}>
        {weekdayLabels.map((label, i) => (
          <View key={`wd-${i}`} style={styles.pickerCell}>
            <Text style={styles.pickerWeekday}>{label}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={`w-${wi}`} style={styles.pickerWeekRow}>
          {week.map((day, di) => {
            if (!day) return <View key={`d-${wi}-${di}`} style={styles.pickerCell} />;
            const iso = toISO(cursor.year, cursor.month, day);
            const isSelected = iso === valueISO;
            const isToday = iso === today;
            return (
              <Pressable
                key={`d-${wi}-${di}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onChange(iso)}
                style={styles.pickerCell}
              >
                <View
                  style={[
                    styles.pickerDay,
                    isSelected
                      ? { backgroundColor: colors.accent }
                      : isToday
                        ? { borderWidth: 1.5, borderColor: colors.accent }
                        : null,
                  ]}
                >
                  <Text style={[styles.pickerDayNum, { color: isSelected ? colors.accentFg : colors.text }]}>{day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

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
});

export default function ParentDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId: rawParentId, section: rawSection } = useLocalSearchParams<{
    parentId: string;
    section?: string;
  }>();
  const parentId = Array.isArray(rawParentId) ? rawParentId[0] : rawParentId;
  const requestedSection = Array.isArray(rawSection) ? rawSection[0] : rawSection;
  const { session, user, loading } = useAuth();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const isWide = isComputerMode && width >= 900;
  const styles = makeStyles(colors, isWide);

  const [parentName, setParentName] = useState('');
  // The metric screen links back here with ?section=care, so a deep link can
  // land on a section the dock would otherwise have to be tapped to reach.
  const [section, setSection] = useState<SectionKey>(() =>
    SECTION_KEYS.includes(requestedSection as SectionKey) ? (requestedSection as SectionKey) : 'overview',
  );

  useEffect(() => {
    if (SECTION_KEYS.includes(requestedSection as SectionKey)) setSection(requestedSection as SectionKey);
  }, [requestedSection]);

  useEffect(() => {
    if (!session || !parentId) return;
    let active = true;
    listFamilyLinks(session.access_token)
      .then(({ asGuardian }) => {
        if (!active) return;
        const link = asGuardian.find((l) => l.parentId === parentId);
        setParentName(link?.parentName || link?.parentPhone || '');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session?.access_token, parentId]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <AppHeader title={t('family.title')} />
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.gateContainer}>
          <Stack.Screen options={{ title: t('family.title') }} />
          <ActivityIndicator color={colors.textMuted} />
        </ScrollView>
      </View>
    );
  }

  if (!session || !user) {
    return (
      <View style={styles.screen}>
        <AppHeader title={t('family.title')} />
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.gateContainer}>
        <Stack.Screen options={{ title: t('family.title') }} />
        <Card style={styles.gateCard}>
          <View style={styles.gateIconBlock}>
            <Feather name="lock" size={28} color={colors.text} />
          </View>
          <H2 style={styles.gateTitle}>{t('family.errorSignIn')}</H2>
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
      </View>
    );
  }

  const token = session.access_token;
  const heading = parentName || t('family.title');
  const sections: { key: SectionKey; label: string; icon: FeatherName }[] = [
    { key: 'overview', label: t('family.analyticsTitle'), icon: 'activity' },
    { key: 'reminders', label: t('family.remindersTitle'), icon: 'bell' },
    { key: 'places', label: t('family.favoritesTitle'), icon: 'star' },
    { key: 'care', label: t('family.careTeamTitle'), icon: 'users' },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.pageOuter}>
      <AppHeader title={heading} />
      <Stack.Screen options={{ title: heading }} />
      {/* The keyboard inset is added, not maxed: the Ask box sits low on this
          page, and without the extra run-off there is nothing to scroll it up
          into once the keyboard is open. The dock floats over the scroll view,
          so TAB_BAR_CLEARANCE keeps the last row from hiding underneath it. */}
      <View
        style={[
          styles.page,
          { paddingBottom: Math.max(insets.bottom, space.lg) + keyboardInset + TAB_BAR_CLEARANCE },
        ]}
      >
      <View style={styles.shell}>
        <Pressable
          accessibilityRole="button"
          // A direct load or refresh of this URL has no history to pop, so back
          // has to fall through to the parents list rather than dead-end.
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/guardian'))}
          style={styles.backRow}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={18} color={colors.textMuted} />
          <Text style={styles.backText}>{t('family.back')}</Text>
        </Pressable>

        <H1>{heading}</H1>
        <Text style={styles.sectionCaption}>{sections.find((s) => s.key === section)?.label}</Text>

        {!parentId ? (
          <Card style={styles.stateCard}>
            <Muted style={styles.stateText}>{t('family.errorNotLinked')}</Muted>
          </Card>
        ) : section === 'overview' ? (
          <OverviewSection
            token={token}
            parentId={parentId}
            parentName={parentName}
            styles={styles}
            colors={colors}
            isWide={isWide}
          />
        ) : section === 'reminders' ? (
          <RemindersSection token={token} parentId={parentId} styles={styles} colors={colors} currentUserId={user.id} />
        ) : section === 'places' ? (
          <PlacesSection token={token} parentId={parentId} styles={styles} colors={colors} />
        ) : (
          <CareTeamSection token={token} parentId={parentId} styles={styles} colors={colors} />
        )}
      </View>
      </View>
      </ScrollView>
      <SectionDock sections={sections} active={section} onSelect={setSection} colors={colors} mode={mode} />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

// ----- Overview tiles -----

type FeatherName = React.ComponentProps<typeof Feather>['name'];

// A tile is now a link, not an accordion: the number and its label stay, and
// tapping opens /guardian/metric where the same metric gets a full screen.
function StatTile({
  metricKey,
  label,
  value,
  basis,
  onPress,
  colors,
  styles,
}: {
  metricKey: MetricKey;
  label: string;
  value: string;
  basis: `${number}%`;
  onPress: () => void;
  colors: AppColors;
  styles: Styles;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.statTileOuter, { flexBasis: basis }]}>
      <Card style={styles.statCard}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${label}: ${value}`}
          accessibilityHint={t('family.tile.openDetail')}
          onPress={onPress}
          testID={`tile-${metricKey}`}
          style={({ pressed }) => [styles.statHeader, pressed ? { opacity: 0.72 } : null]}
        >
          <View style={styles.statHeaderText}>
            {/* No numberOfLines: a full date must wrap, never truncate to "3 Aug 202…". */}
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>
    </View>
  );
}

// ----- Home view: adherence, calendar, recent activity -----

// Adherence is measured over this many calendar days ending today.
const ADHERENCE_WINDOW_DAYS = 30;

// One reminder row can fire on many days. An *active* repeating reminder is
// expanded across the month from its start date; a finished one (done or
// cancelled) is a single event on the day it was set for, because the row
// stops repeating the moment it is closed. Without this a daily medicine would
// paint one cell where it should paint thirty.
function occursOn(r: FamilyReminder, dayISO: string) {
  if (r.dateISO > dayISO) return false;
  if (r.status !== 'active' || r.repeat === 'once') return r.dateISO === dayISO;
  if (r.repeat === 'daily') return true;
  if (r.repeat === 'weekly') return daysBetweenISO(r.dateISO, dayISO) % 7 === 0;
  // Monthly: the same day number. Months without it (the 31st in April) are
  // skipped rather than rolled forward, matching nextMonthlyISO.
  return r.dateISO.slice(8, 10) === dayISO.slice(8, 10);
}

type Adherence = { done: number; missed: number; total: number; percent: number | null };

// done / (done + missed) over the window. Counted per reminder ROW, never per
// expanded occurrence: a daily reminder is one row and the data does not say
// which individual days were taken, so expanding here would invent history.
function computeAdherence(reminders: FamilyReminder[], today: string): Adherence {
  const start = shiftISO(today, -(ADHERENCE_WINDOW_DAYS - 1));
  let done = 0;
  let missed = 0;
  for (const r of reminders) {
    if (r.status === 'done') {
      // Dated by when it was actually completed where the server tells us
      // (updatedAt), and by the day it was due otherwise.
      const day = (r.updatedAt ? istDateISO(r.updatedAt) : null) ?? r.dateISO;
      if (day >= start && day <= today) done += 1;
    } else if (r.status === 'active' && r.dateISO < today && r.dateISO >= start) {
      missed += 1;
    }
  }
  const total = done + missed;
  return { done, missed, total, percent: total === 0 ? null : Math.round((done / total) * 100) };
}

const RING_SIZE = 148;
const RING_WIDTH = 16;

// Progress ring from plain Views: a full circle whose top and right borders are
// painted forms a 180° arc once rotated 45°, so one clipped half draws the
// first 50% and a second clipped half draws the rest. No SVG, no chart library.
function AdherenceRing({
  percent,
  colors,
  styles,
}: {
  percent: number;
  colors: AppColors;
  styles: Styles;
}) {
  const target = Math.max(0, Math.min(100, percent)) * 3.6;
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withTiming(target, {
      duration: 620,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [target, sweep]);

  // Unrotated, the painted top+right borders cover -45°..135°. Rotating by
  // (angle - 135) puts the arc's end exactly at `angle`; the clip mask throws
  // away whatever spills into the other half.
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value <= 180 ? sweep.value - 135 : 45}deg` }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: sweep.value > 180 ? 1 : 0,
    transform: [{ rotate: `${Math.max(sweep.value, 180) - 135}deg` }],
  }));

  const arc = { borderTopColor: colors.success, borderRightColor: colors.success };

  return (
    <View style={styles.ring} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[StyleSheet.absoluteFill, styles.ringTrack, { borderColor: colors.dangerSoft }]} />
      <View style={[styles.ringClip, { left: RING_SIZE / 2 }]}>
        <Animated.View style={[styles.ringArc, { left: -RING_SIZE / 2 }, arc, rightStyle]} />
      </View>
      <View style={[styles.ringClip, { left: 0 }]}>
        <Animated.View style={[styles.ringArc, { left: 0 }, arc, leftStyle]} />
      </View>
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
        <Text style={styles.ringPercent}>{`${Math.round(percent)}%`}</Text>
      </View>
    </View>
  );
}

function AdherenceCard({
  reminders,
  loading,
  colors,
  styles,
}: {
  reminders: FamilyReminder[];
  loading: boolean;
  colors: AppColors;
  styles: Styles;
}) {
  const { t } = useTranslation();
  const today = todayISO();
  const score = useMemo(() => computeAdherence(reminders, today), [reminders, today]);

  return (
    <Card style={styles.homeCard} testID="home-adherence">
      <Text style={styles.homeCardTitle}>{t('family.home.adherenceTitle')}</Text>
      <Muted style={styles.homeCardHint}>{t('family.home.adherenceWhat', { days: ADHERENCE_WINDOW_DAYS })}</Muted>
      {loading && reminders.length === 0 ? (
        <ActivityIndicator color={colors.textMuted} style={styles.homeSpinner} />
      ) : score.percent === null ? (
        <View style={styles.scoreEmpty}>
          <Feather name="inbox" size={22} color={colors.textSubtle} />
          <Text style={styles.scoreEmptyText} testID="home-adherence-value">
            {t('family.home.adherenceNotEnough')}
          </Text>
          <Text style={styles.homeText}>{t('family.home.adherenceNotEnoughWhy')}</Text>
        </View>
      ) : (
        <View style={styles.scoreBody}>
          <AdherenceRing percent={score.percent} colors={colors} styles={styles} />
          <View style={styles.scoreText}>
            {/* The ring is decoration; this line is the actual reading. */}
            <Text style={styles.scoreHeadline} testID="home-adherence-value">
              {t('family.home.adherenceValue', { percent: score.percent })}
            </Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendLabel}>{t('family.home.adherenceDone')}</Text>
              <Text style={styles.legendValue} testID="home-adherence-done">
                {score.done}
              </Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger }]} />
              <Text style={styles.legendLabel}>{t('family.home.adherenceMissed')}</Text>
              <Text style={styles.legendValue} testID="home-adherence-missed">
                {score.missed}
              </Text>
            </View>
            <Text style={styles.homeText}>
              {t('family.home.adherenceSummary', {
                percent: score.percent,
                done: score.done,
                total: score.total,
                missed: score.missed,
                days: ADHERENCE_WINDOW_DAYS,
              })}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

type DayTone = 'none' | 'done' | 'missed' | 'upcoming';

function toneFor(dayISO: string, occurrences: FamilyReminder[], today: string): DayTone {
  if (occurrences.length === 0) return 'none';
  const anyActive = occurrences.some((r) => r.status === 'active');
  if (anyActive) return dayISO < today ? 'missed' : 'upcoming';
  return occurrences.some((r) => r.status === 'done') ? 'done' : 'none';
}

function MonthCalendarCard({
  reminders,
  loading,
  colors,
  styles,
}: {
  reminders: FamilyReminder[];
  loading: boolean;
  colors: AppColors;
  styles: Styles;
}) {
  const { t } = useTranslation();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, month: (month || 1) - 1 };
  });

  const weeks = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
      ),
    [],
  );

  // One pass over the month: every day gets its occurrence list and a tone.
  const days = useMemo(() => {
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const map = new Map<string, { tone: DayTone; titles: string[] }>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayISO = toISO(cursor.year, cursor.month, day);
      const occurrences = reminders.filter((r) => occursOn(r, dayISO));
      map.set(dayISO, { tone: toneFor(dayISO, occurrences, today), titles: occurrences.map((r) => r.title) });
    }
    return map;
  }, [reminders, cursor, today]);

  const counts = useMemo(() => {
    let done = 0;
    let missed = 0;
    let upcoming = 0;
    days.forEach(({ tone }) => {
      if (tone === 'done') done += 1;
      else if (tone === 'missed') missed += 1;
      else if (tone === 'upcoming') upcoming += 1;
    });
    return { done, missed, upcoming, marked: done + missed + upcoming };
  }, [days]);

  const toneColor: Record<DayTone, string | null> = {
    none: null,
    done: colors.success,
    missed: colors.danger,
    upcoming: colors.accent,
  };

  function goMonth(delta: number) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <Card style={styles.homeCard} testID="home-calendar">
      <Text style={styles.homeCardTitle}>{t('family.home.calendarTitle')}</Text>
      <View style={styles.calHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={monthName(cursor.year, cursor.month - 1)}
          testID="home-calendar-prev"
          onPress={() => goMonth(-1)}
          hitSlop={8}
          style={({ pressed }) => [styles.calNav, pressed ? { backgroundColor: colors.overlay } : null]}
        >
          <Feather name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.calMonth} testID="home-calendar-month">
          {monthName(cursor.year, cursor.month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={monthName(cursor.year, cursor.month + 1)}
          testID="home-calendar-next"
          onPress={() => goMonth(1)}
          hitSlop={8}
          style={({ pressed }) => [styles.calNav, pressed ? { backgroundColor: colors.overlay } : null]}
        >
          <Feather name="chevron-right" size={20} color={colors.text} />
        </Pressable>
      </View>

      {loading && reminders.length === 0 ? <ActivityIndicator color={colors.textMuted} style={styles.homeSpinner} /> : null}

      <View style={styles.calWeekRow}>
        {weekdayLabels.map((label, i) => (
          <View key={`cwd-${i}`} style={styles.calCell}>
            <Text style={styles.calWeekday}>{label}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={`cw-${wi}`} style={styles.calWeekRow}>
          {week.map((day, di) => {
            if (!day) return <View key={`cd-${wi}-${di}`} style={styles.calCell} />;
            const dayISO = toISO(cursor.year, cursor.month, day);
            const entry = days.get(dayISO);
            const tone = entry?.tone ?? 'none';
            const tint = toneColor[tone];
            const isToday = dayISO === today;
            return (
              <View
                key={`cd-${wi}-${di}`}
                style={styles.calCell}
                testID={`cal-day-${dayISO}`}
                accessible
                accessibilityLabel={[
                  formatReadableDate(dayISO),
                  t(`family.home.dayTone.${tone}`),
                  entry && entry.titles.length > 0 ? entry.titles.join(', ') : null,
                ]
                  .filter(Boolean)
                  .join('. ')}
              >
                <View
                  // The dot below the number carries the colour so the number
                  // itself always keeps full text contrast.
                  style={[styles.calDay, isToday ? { borderWidth: 1.5, borderColor: colors.text } : null]}
                >
                  <Text style={styles.calDayNum}>{day}</Text>
                  <View style={[styles.calDot, tint ? { backgroundColor: tint } : { backgroundColor: 'transparent' }]} />
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.calLegend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendLabel}>{t('family.home.dayTone.done')}</Text>
          <Text style={styles.legendValue} testID="cal-count-done">{counts.done}</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendLabel}>{t('family.home.dayTone.missed')}</Text>
          <Text style={styles.legendValue} testID="cal-count-missed">{counts.missed}</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendLabel}>{t('family.home.dayTone.upcoming')}</Text>
          <Text style={styles.legendValue} testID="cal-count-upcoming">{counts.upcoming}</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text style={styles.legendLabel}>{t('family.home.dayTone.none')}</Text>
        </View>
      </View>
      <Text style={styles.homeText} testID="home-calendar-summary">
        {counts.marked === 0
          ? t('family.home.calendarEmpty', { month: monthName(cursor.year, cursor.month) })
          : t('family.home.calendarSummary', {
              month: monthName(cursor.year, cursor.month),
              marked: counts.marked,
              done: counts.done,
              missed: counts.missed,
              upcoming: counts.upcoming,
            })}
      </Text>
    </Card>
  );
}

type ActivityRow = { key: string; at: string; icon: FeatherName; tint: string; title: string; meta: string };

const RECENT_ACTIVITY_LIMIT = 6;

function RecentActivityCard({
  reminders,
  callbacks,
  loading,
  colors,
  styles,
}: {
  reminders: FamilyReminder[];
  callbacks: ParentAnalytics['callbacks'];
  loading: boolean;
  colors: AppColors;
  styles: Styles;
}) {
  const { t } = useTranslation();

  // Only things that actually happened, each carrying its own real timestamp.
  // There is no activity log behind this — it is the reminder rows and the
  // callback list re-read as events.
  const rows = useMemo<ActivityRow[]>(() => {
    const out: ActivityRow[] = [];
    for (const r of reminders) {
      if (r.status === 'done') {
        const at = r.updatedAt ?? r.createdAt ?? `${r.dateISO}T00:00:00.000Z`;
        out.push({
          key: `done-${r.id}`,
          at,
          icon: 'check-circle',
          tint: colors.success,
          title: t('family.home.activityCompleted', { title: r.title }),
          meta: [relativeDayLabel(at, t), formatISTStamp(at)].filter(Boolean).join(' · '),
        });
      }
      if (r.createdAt) {
        out.push({
          key: `added-${r.id}`,
          at: r.createdAt,
          icon: 'plus-circle',
          tint: colors.accent,
          title: t('family.home.activityAdded', { title: r.title }),
          meta: [relativeDayLabel(r.createdAt, t), formatISTStamp(r.createdAt)].filter(Boolean).join(' · '),
        });
      }
    }
    for (const cb of callbacks) {
      out.push({
        key: `cb-${cb.created_at}-${cb.status}`,
        at: cb.created_at,
        icon: 'phone-call',
        tint: colors.primary,
        title: t('family.home.activityCallback', { issue: cb.issue || t('family.tile.callbackNoIssue') }),
        meta: [
          t(`family.callbackStatus.${cb.status}`, { defaultValue: cb.status }),
          relativeDayLabel(cb.created_at, t),
          formatISTStamp(cb.created_at),
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_ACTIVITY_LIMIT);
  }, [reminders, callbacks, colors, t]);

  return (
    <Card style={styles.homeCard} testID="home-activity">
      <Text style={styles.homeCardTitle}>{t('family.home.recentTitle')}</Text>
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={colors.textMuted} style={styles.homeSpinner} />
      ) : rows.length === 0 ? (
        <Text style={styles.homeText} testID="home-activity-empty">
          {t('family.home.recentEmpty')}
        </Text>
      ) : (
        rows.map((row) => (
          <View key={row.key} style={styles.activityRow} testID="home-activity-row">
            <Feather name={row.icon} size={18} color={row.tint} />
            <View style={styles.activityBody}>
              <Text style={styles.activityTitle}>{row.title}</Text>
              <Text style={styles.activityMeta}>{row.meta}</Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

// ----- Bottom section dock -----

// The same recipe as the app's tab bar (LinearGradient bevel, blurred glass,
// sliding pill) but driven by this screen's own section state — GlassTabBar is
// bound to react-navigation's tab props and cannot be reused here.
const DOCK_RADIUS = 24;
const DOCK_PAD = 6;
// GSAP power4.out equivalent: fast launch, long soft landing.
const DOCK_SLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

function SectionDock({
  sections,
  active,
  onSelect,
  colors,
  mode,
}: {
  sections: { key: SectionKey; label: string; icon: FeatherName }[];
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
  colors: AppColors;
  mode: 'light' | 'dark';
}) {
  const [innerWidth, setInnerWidth] = useState(0);
  const index = Math.max(0, sections.findIndex((s) => s.key === active));
  const slide = useSharedValue(index);
  const itemWidth = innerWidth > 0 ? innerWidth / sections.length : 0;

  useEffect(() => {
    // ReduceMotion.Never: a short state-conveying translate — OS "animation
    // effects off" would otherwise make the pill teleport and read as broken.
    slide.value = withTiming(index, {
      duration: 520,
      easing: DOCK_SLIDE_EASING,
      reduceMotion: ReduceMotion.Never,
    });
  }, [index, slide]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * itemWidth }],
  }));

  return (
    <View style={[dockStyles.dock, shadow.md]} testID="section-dock">
      <View style={[StyleSheet.absoluteFill, dockStyles.dockClip]}>
        {/* Bevel: light catches the top-left edge, falls off bottom-right. */}
        <LinearGradient
          colors={[colors.navEdgeHi, colors.navEdgeLo]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={dockStyles.dockInner}>
          <BlurView
            intensity={48}
            tint={mode}
            experimentalBlurMethod="dimezisBlurView"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.navGlass }]}
          />
        </View>
      </View>

      <View style={dockStyles.itemRow} onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width)}>
        {itemWidth > 0 ? (
          <Animated.View
            style={[
              dockStyles.pill,
              pillStyle,
              { width: itemWidth, backgroundColor: colors.navPill, borderColor: colors.navPillEdge },
            ]}
          />
        ) : null}
        {sections.map((s) => {
          const focused = s.key === active;
          const tint = focused ? colors.text : colors.textSubtle;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              // react-native-web does not forward accessibilityState.selected to
              // the DOM; the aria prop is what reaches a browser screen reader.
              aria-selected={focused}
              accessibilityLabel={s.label}
              testID={`dock-${s.key}`}
              style={dockStyles.item}
              onPress={() => onSelect(s.key)}
            >
              <Feather name={s.icon} size={24} color={tint} />
              <Text style={[dockStyles.label, { color: tint }]} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const dockStyles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 72,
    borderRadius: DOCK_RADIUS,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  dockClip: { borderRadius: DOCK_RADIUS, overflow: 'hidden' },
  // Inset so the gradient underneath reads as a 1.5px bevel ring.
  dockInner: {
    position: 'absolute',
    top: 1.5,
    right: 1.5,
    bottom: 1.5,
    left: 1.5,
    borderRadius: DOCK_RADIUS - 1.5,
    overflow: 'hidden',
  },
  itemRow: { flexDirection: 'row', alignItems: 'stretch', margin: DOCK_PAD },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: DOCK_RADIUS - DOCK_PAD,
    borderWidth: 1,
  },
  item: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  label: { fontFamily: family.medium, fontSize: font.xs, lineHeight: 18 },
});

// ----- Overview -----

function OverviewSection({
  token,
  parentId,
  parentName,
  styles,
  colors,
  isWide,
}: {
  token: string;
  parentId: string;
  parentName: string;
  styles: Styles;
  colors: AppColors;
  isWide: boolean;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [data, setData] = useState<ParentAnalytics | null>(null);
  // The calendar and the adherence score need the reminder ROWS, not the
  // pre-aggregated counts in the analytics payload — repeating reminders and
  // completion dates only exist there.
  const [reminders, setReminders] = useState<FamilyReminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedReminder | null>(null);
  const [savingProposal, setSavingProposal] = useState(false);
  const [proposalSaved, setProposalSaved] = useState(false);
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  const canDictate = speechRecognitionSupported();

  function toggleDictation() {
    if (dictationRef.current) {
      dictationRef.current.stop();
      dictationRef.current = null;
      setListening(false);
      return;
    }
    beginDictation();
  }

  /**
   * Synchronous on purpose — see the note on requestMicPermission. Awaiting a
   * permission check before start() costs the user gesture, and iOS Safari then
   * refuses to listen even with the microphone already granted.
   */
  function beginDictation() {
    const handle = startListening({
      lang: i18n.language?.startsWith('hi') ? 'hi' : 'en',
      onInterim: (text) => setQuestion(text),
      onResult: (text) => {
        setQuestion(text);
        void ask(text);
      },
      onEnd: () => {
        dictationRef.current = null;
        setListening(false);
      },
      onError: (code) => {
        const key = voiceErrorKey(code);
        if (key === 'micBlocked') {
          void requestMicPermission().then((result) => {
            setAnswer(t(result === 'granted' ? 'assistant.voice.micReady' : 'assistant.voice.micBlocked'));
          });
          return;
        }
        setAnswer(t(`assistant.voice.${key}`));
      },
    });
    if (!handle) return;
    dictationRef.current = handle;
    setListening(true);
  }

  useEffect(
    () => () => {
      dictationRef.current?.stop();
      dictationRef.current = null;
    },
    [],
  );

  // The guardian's agent: the ward's live summary goes in as facts, so "how is
  // Ma doing" is answered from data, not generalities. A reminder request
  // ("remind Ma to take her medicine at 8") comes back as a proposal card;
  // saving it writes a family reminder, which also pings the parent's device.
  async function ask(text = question) {
    const messageText = text.trim();
    if (!messageText || asking || !data) return;
    setAsking(true);
    setAnswer(null);
    setProposal(null);
    setProposalSaved(false);
    try {
      const lastActive = data.lastActiveAt ? formatISTStamp(data.lastActiveAt) : t('family.neverActive');
      const plan = await requestAssistantPlan({
        message: messageText,
        services: [],
        lang: i18n.language?.startsWith('hi') ? 'hi' : 'en',
        token,
        context: {
          todayISO: todayISO(),
          facts: [
            `You are talking to the guardian ABOUT their parent ${parentName || ''}`.trim(),
            `Parent last active: ${lastActive}`,
            `Parent reminders: ${data.reminders.upcoming} upcoming, ${data.reminders.overdue} overdue, ${data.reminders.done7d} completed this week`,
            `Parent used the assistant ${data.assistantEvents7d} times in 7 days`,
            `Care team members saved: ${data.careTeamCount}`,
            `Recent help requests: ${data.callbacks.length}`,
          ],
        },
      });
      setAnswer([plan.summary, plan.followUpQuestion].filter(Boolean).join('\n\n'));
      setProposal(plan.proposedReminder ?? null);
    } catch {
      setAnswer(t('family.errorGeneric'));
    } finally {
      setAsking(false);
    }
  }

  async function saveProposal() {
    if (!proposal || savingProposal || proposalSaved) return;
    setSavingProposal(true);
    try {
      await addFamilyReminder(token, {
        parentId,
        title: proposal.title,
        dateISO: proposal.dateISO,
        time: proposal.time,
        repeat: proposal.repeat,
      });
      setProposalSaved(true);
    } catch (e) {
      setAnswer(friendlyFamilyError(e, t));
    } finally {
      setSavingProposal(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchParentAnalytics(token, parentId)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(friendlyFamilyError(e, t));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, parentId]);

  useEffect(() => {
    let active = true;
    setRemindersLoading(true);
    listFamilyReminders(token, parentId)
      .then(({ reminders: rows }) => {
        if (active) setReminders(rows);
      })
      .catch(() => {
        if (active) setReminders([]);
      })
      .finally(() => {
        if (active) setRemindersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, parentId]);

  // Adherence, last-active and the overdue count all move when the senior acts.
  // Quiet refresh for the same reason as the reminder list: the numbers update
  // in place rather than collapsing the card into a spinner.
  useLivePoll(() => {
    fetchParentAnalytics(token, parentId)
      .then((d) => setData(d))
      .catch(() => undefined);
    listFamilyReminders(token, parentId)
      .then(({ reminders: rows }) => setReminders(rows))
      .catch(() => undefined);
  });

  if (loading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={colors.textMuted} />
        <Muted style={styles.stateText}>{t('family.loading')}</Muted>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card style={styles.stateCard}>
        <Feather name="alert-circle" size={20} color={colors.textSubtle} />
        <Muted style={styles.stateText}>{error || t('family.errorGeneric')}</Muted>
      </Card>
    );
  }

  return (
    <View style={styles.sectionBody}>
      <AdherenceCard reminders={reminders} loading={remindersLoading} colors={colors} styles={styles} />
      <MonthCalendarCard reminders={reminders} loading={remindersLoading} colors={colors} styles={styles} />
      <RecentActivityCard
        reminders={reminders}
        callbacks={data.callbacks}
        loading={remindersLoading}
        colors={colors}
        styles={styles}
      />

      <H2 style={styles.subHeader}>{t('family.home.metricsTitle')}</H2>
      <View style={styles.statGrid}>
        {METRIC_KEYS.map((key) => (
          <StatTile
            key={key}
            metricKey={key}
            label={metricLabel(key, t)}
            value={metricValue(key, data, t)}
            basis={isWide ? '31%' : '47%'}
            onPress={() => router.push({ pathname: '/guardian/metric', params: { parentId, key } })}
            colors={colors}
            styles={styles}
          />
        ))}
      </View>

      <H2 style={styles.subHeader}>{t('family.askSaathiTitle')}</H2>
      <Card style={styles.listCard}>
        <Muted style={styles.askHint}>{t('family.askSaathiHint', { name: parentName || t('family.title') })}</Muted>
        <View style={styles.askRow}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => void ask()}
            returnKeyType="send"
            placeholder={t('family.askSaathiPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            style={[styles.askInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bgAlt }]}
          />
          {canDictate ? (
            <Pressable
              onPress={toggleDictation}
              accessibilityRole="button"
              accessibilityLabel={t(listening ? 'assistant.voice.stop' : 'assistant.voice.start')}
              style={({ pressed }) => [
                styles.askMic,
                {
                  borderColor: listening ? colors.danger : colors.border,
                  backgroundColor: listening ? colors.dangerSoft : 'transparent',
                },
                pressed && { opacity: 0.72 },
              ]}
            >
              <Feather name={listening ? 'mic-off' : 'mic'} size={20} color={listening ? colors.danger : colors.text} />
            </Pressable>
          ) : null}
          <Button
            label={asking ? t('family.asking') : t('family.askButton')}
            onPress={() => void ask()}
            disabled={asking || !question.trim()}
          />
        </View>
        {asking ? <ActivityIndicator color={colors.textMuted} style={styles.askSpinner} /> : null}
        {answer ? (
          <View style={[styles.askAnswer, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <Text style={styles.askAnswerText}>{answer}</Text>
          </View>
        ) : null}
        {proposal ? (
          <View style={[styles.askAnswer, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <Text style={styles.askProposalHeading}>{t('family.askProposalHeading', { name: parentName || t('family.title') })}</Text>
            <Text style={styles.askProposalTitle}>{proposal.title}</Text>
            <Text style={styles.askProposalMeta}>
              {[proposal.dateISO, proposal.time, t(`family.repeat.${proposal.repeat}`)].filter(Boolean).join(' · ')}
            </Text>
            {proposalSaved ? (
              <Text style={styles.askProposalSaved}>{t('family.askProposalSaved', { name: parentName || t('family.title') })}</Text>
            ) : (
              <View style={styles.askProposalAction}>
                <Button
                  label={savingProposal ? t('family.saving') : t('family.askProposalSave', { name: parentName || t('family.title') })}
                  onPress={() => void saveProposal()}
                  disabled={savingProposal}
                />
              </View>
            )}
          </View>
        ) : null}
      </Card>

    </View>
  );
}

// ----- Reminders -----

function RemindersSection({
  token,
  parentId,
  styles,
  colors,
  currentUserId,
}: {
  token: string;
  parentId: string;
  styles: Styles;
  colors: AppColors;
  currentUserId: string;
}) {
  const { t } = useTranslation();
  const [reminders, setReminders] = useState<FamilyReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<FamilyReminderRepeat>('once');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState(false);
  const [timeError, setTimeError] = useState(false);
  const [success, setSuccess] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<FamilyReminder | null>(null);

  useAutoClear(success, () => setSuccess(false));

  async function load() {
    setLoading(true);
    try {
      const { reminders: rows } = await listFamilyReminders(token, parentId);
      setReminders(rows);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, parentId]);

  // The senior marks a dose done on their own phone; this list is how the
  // guardian finds out. Quiet refresh — no spinner, since the rows are already
  // on screen and flashing a loading state every few seconds would be worse
  // than the stale row it replaces.
  useLivePoll(() => {
    listFamilyReminders(token, parentId)
      .then(({ reminders: rows }) => setReminders(rows))
      .catch(() => undefined);
  });

  const groups = useMemo(() => {
    const today = todayISO();
    const active = reminders.filter((r) => r.status === 'active');
    return {
      overdue: active.filter((r) => r.dateISO < today),
      upcoming: active.filter((r) => r.dateISO >= today),
      done: reminders.filter((r) => r.status === 'done'),
    };
  }, [reminders]);

  function resetForm() {
    setEditId(null);
    setTitle('');
    setNote('');
    setDate(todayISO());
    setTime('');
    setRepeat('once');
    setDateError(false);
    setTimeError(false);
  }

  function startEdit(r: FamilyReminder) {
    setError(null);
    setSuccess(false);
    setEditId(r.id);
    setTitle(r.title);
    setNote(r.note ?? '');
    setDate(r.dateISO);
    setTime(r.time ?? '');
    setRepeat(r.repeat);
    setDateError(false);
    setTimeError(false);
  }

  async function save() {
    setError(null);
    setSuccess(false);
    if (!title.trim()) return;
    if (!isValidISODate(date)) {
      setDateError(true);
      setError(t('family.badDate'));
      return;
    }
    const trimmedTime = time.trim();
    const normalizedTime = trimmedTime ? normalizeTimeInput(trimmedTime) : null;
    if (trimmedTime && !normalizedTime) {
      setTimeError(true);
      setError(t('family.badTime'));
      return;
    }
    setDateError(false);
    setTimeError(false);
    setSaving(true);
    try {
      if (editId) {
        await updateFamilyReminder(token, {
          parentId,
          id: editId,
          title: title.trim(),
          note: note.trim() || null,
          dateISO: date,
          time: normalizedTime,
          repeat,
        });
      } else {
        await addFamilyReminder(token, {
          parentId,
          title: title.trim(),
          note: note.trim() || null,
          dateISO: date,
          time: normalizedTime,
          repeat,
        });
      }
      resetForm();
      setSuccess(true);
      await load();
    } catch (e) {
      setError(friendlyFamilyError(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function markDone(id: string) {
    try {
      await markFamilyReminderDone(token, { parentId, id });
      await load();
    } catch {
      await load();
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    setRemoveTarget(null);
    try {
      await removeFamilyReminder(token, { parentId, id });
      await load();
    } catch {
      await load();
    }
  }

  function renderReminder(r: FamilyReminder, done: boolean, overdue = false) {
    const createdByYou = r.createdBy === currentUserId;
    return (
      <Card key={r.id} style={[styles.itemCard, overdue ? styles.itemCardOverdue : null]}>
        <View style={styles.itemMain}>
          {overdue ? (
            <View style={styles.overdueTag}>
              <Feather name="alert-triangle" size={13} color={colors.danger} />
              <Text style={[styles.overdueTagText, { color: colors.danger }]}>{t('family.overdueReminders')}</Text>
            </View>
          ) : null}
          <Text style={[styles.itemTitle, done ? styles.itemTitleDone : null]}>{r.title}</Text>
          {r.note ? <Text style={styles.itemNote}>{r.note}</Text> : null}
          <Text style={[styles.itemMeta, overdue ? { color: colors.danger } : null]}>
            {formatReadableDate(r.dateISO)}
            {r.time ? ` · ${formatISTTime(r.time)}` : ''}
            {r.repeat !== 'once' ? ` · ${t(`family.repeat.${r.repeat}`)}` : ''}
          </Text>
          <Text style={styles.itemByline}>
            {createdByYou
              ? t('family.createdByYou', { defaultValue: 'Added by you' })
              : t('family.createdByOther', { defaultValue: 'Added by a family member' })}
          </Text>
        </View>
        <View style={styles.itemActions}>
          {!done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('family.markDone')}
              onPress={() => markDone(r.id)}
              style={({ pressed }) => [styles.ghostAction, pressed ? { backgroundColor: colors.surfaceTint } : null]}
            >
              <Feather name="check" size={16} color={colors.success} />
              <Text style={[styles.ghostActionText, { color: colors.success }]}>{t('family.markDone')}</Text>
            </Pressable>
          ) : null}
          {!done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('family.editReminder')}
              onPress={() => startEdit(r)}
              style={({ pressed }) => [styles.ghostAction, pressed ? { backgroundColor: colors.surfaceTint } : null]}
            >
              <Feather name="edit-2" size={16} color={colors.textMuted} />
              <Text style={[styles.ghostActionText, { color: colors.textMuted }]}>{t('family.edit')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('family.deleteReminder')}
            onPress={() => setRemoveTarget(r)}
            style={({ pressed }) => [styles.ghostAction, pressed ? { backgroundColor: colors.dangerSoft } : null]}
          >
            <Feather name="trash-2" size={16} color={colors.danger} />
            <Text style={[styles.ghostActionText, { color: colors.danger }]}>{t('family.delete')}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.sectionBody}>
      <Card>
        <Text style={styles.cardTitle}>{editId ? t('family.editReminder') : t('family.addReminder')}</Text>
        <Field
          label={t('family.reminderTitleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('family.reminderTitlePlaceholder')}
        />
        <Field
          label={t('family.reminderNoteLabel')}
          value={note}
          onChangeText={setNote}
          placeholder={t('family.reminderNotePlaceholder')}
        />
        <View style={fieldStyles.wrap}>
          <Text style={[fieldStyles.label, { color: dateError ? colors.danger : colors.textMuted }]}>
            {t('family.reminderDateLabel')}
          </Text>
          <DatePicker
            valueISO={date}
            onChange={(iso) => {
              setDate(iso);
              setDateError(false);
            }}
            colors={colors}
            styles={styles}
          />
        </View>
        <Field
          label={t('family.reminderTimeLabel')}
          value={time}
          onChangeText={(value) => {
            setTime(value);
            setTimeError(false);
          }}
          placeholder={t('family.reminderTimePlaceholder', { defaultValue: 'e.g. 8:30 am' })}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={8}
        />
        <View style={fieldStyles.wrap}>
          <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{t('family.reminderRepeatLabel')}</Text>
          <View style={styles.wrapChipRow}>
            {REMINDER_REPEATS.map((r) => (
              <Chip key={r} label={t(`family.repeat.${r}`)} active={repeat === r} onPress={() => setRepeat(r)} />
            ))}
          </View>
        </View>
        {error ? <Notice kind="error" message={error} /> : null}
        {success ? <Notice kind="success" message={t('family.saved')} /> : null}
        <View style={styles.formAction}>
          <Button
            label={editId ? t('family.save') : t('family.saveReminder')}
            onPress={save}
            loading={saving}
            disabled={!title.trim()}
          />
          {editId ? (
            <View style={{ marginTop: 12 }}>
              <Button label={t('family.cancel')} variant="secondary" onPress={resetForm} />
            </View>
          ) : null}
        </View>
      </Card>

      {loading ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator color={colors.textMuted} />
        </Card>
      ) : reminders.length === 0 ? (
        <Card style={styles.stateCard}>
          <Feather name="bell-off" size={20} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{t('family.noReminders')}</Muted>
        </Card>
      ) : (
        <>
          {groups.overdue.length > 0 ? (
            <>
              <H2 style={styles.subHeader}>{t('family.overdueReminders')}</H2>
              {groups.overdue.map((r) => renderReminder(r, false, true))}
            </>
          ) : null}
          {groups.upcoming.length > 0 ? (
            <>
              <H2 style={styles.subHeader}>{t('family.upcomingReminders')}</H2>
              {groups.upcoming.map((r) => renderReminder(r, false))}
            </>
          ) : null}
          {groups.done.length > 0 ? (
            <>
              <H2 style={styles.subHeader}>{t('family.doneReminders')}</H2>
              {groups.done.map((r) => renderReminder(r, true))}
            </>
          ) : null}
        </>
      )}

      <Dialog visible={removeTarget !== null} onClose={() => setRemoveTarget(null)} title={t('family.deleteReminder')}>
        {removeTarget ? <Text style={styles.dialogBody}>{t('family.confirmDeleteReminder')}</Text> : null}
        <View style={styles.dialogActions}>
          <Button label={t('family.delete')} variant="danger" onPress={confirmRemove} />
          <Button label={t('family.cancel')} variant="secondary" onPress={() => setRemoveTarget(null)} />
        </View>
      </Dialog>
    </View>
  );
}

// ----- Places (favorites) -----

function PlacesSection({
  token,
  parentId,
  styles,
  colors,
}: {
  token: string;
  parentId: string;
  styles: Styles;
  colors: AppColors;
}) {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<FamilyFavorite[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<FamilyFavorite | null>(null);

  useAutoClear(success, () => setSuccess(false));

  async function loadFavorites() {
    try {
      const { favorites: rows } = await listFamilyFavorites(token, parentId);
      setFavorites(rows);
    } catch {
      setFavorites([]);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([listFamilyFavorites(token, parentId).catch(() => ({ favorites: [] })), fetchServices()])
      .then(([favRes, svc]) => {
        if (!active) return;
        setFavorites(favRes.favorites);
        setServices(svc);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, parentId]);

  const savedIds = useMemo(() => new Set(favorites.map((f) => f.serviceId)), [favorites]);

  const allMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return services
      .filter((s) => !savedIds.has(s.id))
      .filter((s) => {
        const text = [s.name, s.address, s.town, t(`categories.${s.category}`)].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      });
  }, [query, services, savedIds, t]);

  const MATCH_LIMIT = 12;
  const matches = allMatches.slice(0, MATCH_LIMIT);

  async function add(service: Service) {
    setError(null);
    setSuccess(false);
    setBusyId(service.id);
    try {
      await addFamilyFavorite(token, { parentId, serviceId: service.id, note: note.trim() || null });
      setNote('');
      setQuery('');
      setSuccess(true);
      await loadFavorites();
    } catch (e) {
      setError(friendlyFamilyError(e, t));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    setRemoveTarget(null);
    try {
      await removeFamilyFavorite(token, { parentId, id });
      await loadFavorites();
    } catch {
      await loadFavorites();
    }
  }

  return (
    <View style={styles.sectionBody}>
      <Muted style={styles.sectionIntro}>{t('family.favoritesIntro')}</Muted>

      <Card>
        <Text style={styles.cardTitle}>{t('family.addFavorite')}</Text>
        <Field label={t('family.favoriteNoteLabel')} value={note} onChangeText={setNote} />
        <View style={fieldStyles.wrap}>
          <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{t('common.search')}</Text>
          <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}>
            <Feather name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('services.title')}
              placeholderTextColor={colors.textSubtle}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
          </View>
        </View>
        {error ? <Notice kind="error" message={error} /> : null}
        {success ? <Notice kind="success" message={t('family.saved')} /> : null}
        {query.trim() ? (
          allMatches.length === 0 ? (
            <View style={styles.searchEmpty}>
              <Feather name="search" size={18} color={colors.textSubtle} />
              <Muted style={styles.stateText}>
                {t('family.noMatches', { defaultValue: 'No services match your search.' })}
              </Muted>
            </View>
          ) : (
            <View style={styles.resultList}>
              {matches.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  onPress={() => add(s)}
                  disabled={busyId !== null}
                  style={({ pressed }) => [styles.resultRow, pressed ? { backgroundColor: colors.surfaceTint } : null]}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {t(`categories.${s.category}`)}
                      {s.town ? ` · ${s.town}` : ''}
                    </Text>
                  </View>
                  {busyId === s.id ? (
                    <ActivityIndicator color={colors.textMuted} />
                  ) : (
                    <Feather name="plus-circle" size={20} color={colors.accent} />
                  )}
                </Pressable>
              ))}
              {allMatches.length > MATCH_LIMIT ? (
                <Text style={styles.resultCount}>
                  {t('family.showingMatches', {
                    count: matches.length,
                    total: allMatches.length,
                    defaultValue: 'Showing {{count}} of {{total}} matches. Refine your search to narrow it down.',
                  })}
                </Text>
              ) : null}
            </View>
          )
        ) : null}
      </Card>

      {loading ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator color={colors.textMuted} />
        </Card>
      ) : favorites.length === 0 ? (
        <Card style={styles.stateCard}>
          <Feather name="star" size={20} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{t('family.noFavorites')}</Muted>
        </Card>
      ) : (
        favorites.map((f) => (
          <Card key={f.id} style={styles.itemCard}>
            <View style={styles.itemMain}>
              <Text style={styles.itemTitle} numberOfLines={1}>{f.name}</Text>
              <Text style={styles.itemMeta} numberOfLines={1}>
                {f.category ? t(`categories.${f.category}`) : ''}
                {f.phone ? ` · ${f.phone}` : ''}
              </Text>
              {f.note ? <Text style={styles.itemNote}>{f.note}</Text> : null}
            </View>
            <View style={styles.itemActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('family.removeFavorite')}
                onPress={() => setRemoveTarget(f)}
                style={({ pressed }) => [styles.ghostAction, pressed ? { backgroundColor: colors.dangerSoft } : null]}
              >
                <Feather name="x" size={16} color={colors.danger} />
                <Text style={[styles.ghostActionText, { color: colors.danger }]}>{t('family.removeFavorite')}</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}

      <Dialog visible={removeTarget !== null} onClose={() => setRemoveTarget(null)} title={t('family.removeFavorite')}>
        {removeTarget ? <Text style={styles.dialogBody}>{t('family.confirmRemoveFavorite')}</Text> : null}
        <View style={styles.dialogActions}>
          <Button label={t('family.removeFavorite')} variant="danger" onPress={confirmRemove} />
          <Button label={t('family.cancel')} variant="secondary" onPress={() => setRemoveTarget(null)} />
        </View>
      </Dialog>
    </View>
  );
}

// ----- Care team -----

function CareTeamSection({
  token,
  parentId,
  styles,
  colors,
}: {
  token: string;
  parentId: string;
  styles: Styles;
  colors: AppColors;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<CareTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [editId, setEditId] = useState<string | null>(null);
  const [category, setCategory] = useState<CareTeamCategory>('doctor');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CareTeamMember | null>(null);

  useAutoClear(success, () => setSuccess(false));

  async function load() {
    setLoading(true);
    try {
      const { members: rows } = await listCareTeam(token, parentId);
      setMembers(rows);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, parentId]);

  function resetForm() {
    setEditId(null);
    setCategory('doctor');
    setName('');
    setPhone('');
    setNote('');
  }

  function startEdit(m: CareTeamMember) {
    setError(null);
    setSuccess(false);
    setEditId(m.id);
    setCategory(m.category);
    setName(m.name);
    setPhone(m.phone ?? '');
    setNote(m.note ?? '');
  }

  async function save() {
    setError(null);
    setSuccess(false);
    if (!name.trim()) return;
    setSaving(true);
    try {
      await setCareTeamMember(token, {
        parentId,
        id: editId ?? undefined,
        category,
        name: name.trim(),
        phone: phone.trim() || null,
        note: note.trim() || null,
      });
      resetForm();
      setSuccess(true);
      await load();
    } catch (e) {
      setError(friendlyFamilyError(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    setRemoveTarget(null);
    try {
      await removeCareTeamMember(token, { parentId, id });
      await load();
    } catch {
      await load();
    }
  }

  return (
    <View style={styles.sectionBody}>
      <Muted style={styles.sectionIntro}>{t('family.careTeamIntro')}</Muted>

      <Card>
        <Text style={styles.cardTitle}>{editId ? t('family.editContact') : t('family.addContact')}</Text>
        <View style={fieldStyles.wrap}>
          <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{t('family.categoryLabel')}</Text>
          <View style={styles.wrapChipRow}>
            {CARE_CATEGORIES.map((c) => (
              <Chip key={c} label={t(`family.categories.${c}`)} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        </View>
        <Field
          label={t('family.contactNameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('family.contactNamePlaceholder')}
        />
        <Field
          label={t('family.contactPhoneLabel')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <Field label={t('family.contactNoteLabel')} value={note} onChangeText={setNote} />
        {error ? <Notice kind="error" message={error} /> : null}
        {success ? <Notice kind="success" message={t('family.saved')} /> : null}
        <View style={styles.formAction}>
          <Button
            label={editId ? t('family.save') : t('family.saveContact')}
            onPress={save}
            loading={saving}
            disabled={!name.trim()}
          />
          {editId ? (
            <View style={{ marginTop: 12 }}>
              <Button label={t('family.cancel')} variant="secondary" onPress={resetForm} />
            </View>
          ) : null}
        </View>
      </Card>

      {loading ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator color={colors.textMuted} />
        </Card>
      ) : members.length === 0 ? (
        <Card style={styles.stateCard}>
          <Feather name="users" size={20} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{t('family.noCareTeam')}</Muted>
        </Card>
      ) : (
        members.map((m) => (
          <Card key={m.id} style={styles.itemCard}>
            <View style={styles.itemMain}>
              <Text style={styles.itemCategory}>{t(`family.categories.${m.category}`)}</Text>
              <Text style={styles.itemTitle} numberOfLines={1}>{m.name}</Text>
              {m.phone ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${t('family.callContact')} ${m.phone}`}
                  onPress={() => Linking.openURL(`tel:${m.phone!.replace(/\s+/g, '')}`)}
                  hitSlop={6}
                  style={styles.phoneRow}
                >
                  <Feather name="phone" size={14} color={colors.accent} />
                  <Text style={[styles.itemMeta, styles.phoneLink, { color: colors.accent }]} numberOfLines={1}>
                    {m.phone}
                  </Text>
                </Pressable>
              ) : null}
              {m.note ? <Text style={styles.itemNote}>{m.note}</Text> : null}
            </View>
            <View style={styles.itemActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('family.editContact')}
                onPress={() => startEdit(m)}
                style={({ pressed }) => [styles.ghostAction, pressed ? { backgroundColor: colors.surfaceTint } : null]}
              >
                <Feather name="edit-2" size={16} color={colors.textMuted} />
                <Text style={[styles.ghostActionText, { color: colors.textMuted }]}>{t('family.edit')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('family.deleteContact')}
                onPress={() => setRemoveTarget(m)}
                style={({ pressed }) => [styles.ghostAction, pressed ? { backgroundColor: colors.dangerSoft } : null]}
              >
                <Feather name="trash-2" size={16} color={colors.danger} />
                <Text style={[styles.ghostActionText, { color: colors.danger }]}>{t('family.delete')}</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}

      <Dialog visible={removeTarget !== null} onClose={() => setRemoveTarget(null)} title={t('family.deleteContact')}>
        {removeTarget ? <Text style={styles.dialogBody}>{t('family.confirmDeleteContact')}</Text> : null}
        <View style={styles.dialogActions}>
          <Button label={t('family.deleteContact')} variant="danger" onPress={confirmRemove} />
          <Button label={t('family.cancel')} variant="secondary" onPress={() => setRemoveTarget(null)} />
        </View>
      </Dialog>
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    // The header scrolls with the page, so the outer container stays
    // full-bleed and the padding lives on the block beneath it.
    pageOuter: { width: '100%' },
    page: { padding: isWide ? space.xl : space.md, paddingTop: space.md },
    shell: { width: '100%', maxWidth: 960, alignSelf: 'center' },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.sm, alignSelf: 'flex-start' },
    backText: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
    sectionCaption: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: space.xs,
      marginBottom: space.md,
    },
    wrapChipRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
    sectionBody: { gap: space.md },
    sectionIntro: { marginBottom: space.xs },
    subHeader: { marginTop: space.md, marginBottom: space.sm },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
    statTileOuter: { flexGrow: 1, minWidth: 0 },
    statCard: { flexGrow: 1, gap: 4, paddingVertical: space.sm },
    statHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TAP, paddingVertical: space.sm },
    statHeaderText: { flex: 1, minWidth: 0, gap: 4 },
    statValue: { fontSize: font.xl, fontFamily: family.semibold, color: colors.text },
    statLabel: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted, lineHeight: Math.round(font.sm * 1.4) },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
    legendDot: { width: 12, height: 12, borderRadius: radius.pill },
    legendLabel: { flex: 1, minWidth: 0, fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
    legendValue: { fontSize: font.sm, fontFamily: family.semibold, color: colors.text },

    // ----- Home view (score, calendar, recent activity) -----
    homeCard: { gap: space.xs },
    homeCardTitle: {
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.text,
      lineHeight: Math.round(font.md * 1.4),
    },
    homeCardHint: { marginBottom: space.xs },
    homeText: {
      fontSize: font.sm,
      fontFamily: family.regular,
      color: colors.textMuted,
      lineHeight: Math.round(font.sm * 1.45),
      marginTop: space.xs,
    },
    homeSpinner: { paddingVertical: space.lg },
    scoreBody: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      gap: space.lg,
      marginTop: space.sm,
    },
    scoreText: { flex: 1, minWidth: 0 },
    scoreHeadline: {
      fontSize: font.lg,
      fontFamily: family.bold,
      color: colors.text,
      lineHeight: Math.round(font.lg * 1.3),
      marginBottom: space.xs,
    },
    scoreEmpty: { alignItems: 'flex-start', gap: space.xs, paddingVertical: space.md },
    scoreEmptyText: {
      fontSize: font.lg,
      fontFamily: family.bold,
      color: colors.text,
      lineHeight: Math.round(font.lg * 1.3),
    },
    ring: { width: RING_SIZE, height: RING_SIZE, alignSelf: isWide ? 'auto' : 'center' },
    ringTrack: { borderRadius: RING_SIZE / 2, borderWidth: RING_WIDTH },
    ringClip: { position: 'absolute', top: 0, width: RING_SIZE / 2, height: RING_SIZE, overflow: 'hidden' },
    ringArc: {
      position: 'absolute',
      top: 0,
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius: RING_SIZE / 2,
      borderWidth: RING_WIDTH,
      borderColor: 'transparent',
    },
    ringCenter: { alignItems: 'center', justifyContent: 'center' },
    ringPercent: { fontSize: font.xl, fontFamily: family.bold, color: colors.text },

    calHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
    calNav: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    calMonth: { flex: 1, textAlign: 'center', fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    calWeekRow: { flexDirection: 'row' },
    calCell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    calWeekday: { fontSize: font.xs, fontFamily: family.medium, color: colors.textSubtle },
    calDay: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: 2 },
    calDayNum: { fontSize: font.sm, fontFamily: family.medium, color: colors.text },
    calDot: { width: 8, height: 8, borderRadius: radius.pill },
    calLegend: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

    activityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      paddingVertical: space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    activityBody: { flex: 1, minWidth: 0, gap: 2 },
    activityTitle: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.text,
      lineHeight: Math.round(font.sm * 1.45),
    },
    activityMeta: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
      lineHeight: Math.round(font.xs * 1.4),
    },
    cardTitle: { fontSize: font.md, fontFamily: family.semibold, lineHeight: Math.round(font.md * 1.5), color: colors.text },
    formAction: { marginTop: space.lg },
    listCard: { paddingHorizontal: 0, paddingVertical: space.xs },
    askHint: { paddingHorizontal: space.md, paddingTop: space.sm },
    askRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
    askInput: {
      flex: 1,
      minHeight: TAP,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      fontSize: font.md,
      fontFamily: family.regular,
    },
    askSpinner: { paddingBottom: space.md },
    askAnswer: {
      marginHorizontal: space.md,
      marginBottom: space.md,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: space.md,
    },
    askAnswerText: {
      fontSize: font.md,
      fontFamily: family.regular,
      lineHeight: Math.round(font.md * 1.4),
      color: colors.text,
    },
    askProposalHeading: { fontSize: font.sm, fontFamily: family.semibold, color: colors.textMuted },
    askProposalTitle: { fontSize: font.md, fontFamily: family.bold, color: colors.text, marginTop: 4 },
    askProposalMeta: { fontSize: font.sm, fontFamily: family.regular, color: colors.textMuted, marginTop: 2 },
    askProposalSaved: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.text,
      marginTop: space.sm,
    },
    askProposalAction: { marginTop: space.sm },
    askMic: {
      width: TAP,
      height: TAP,
      borderRadius: radius.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateCard: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
    stateText: { textAlign: 'center' },
    stateBlock: { alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: space.md },
    listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 12 },
    rowBody: { flex: 1, minWidth: 0, gap: 2 },
    rowTitle: { fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    rowMeta: { fontSize: font.xs, fontFamily: family.medium, color: colors.textSubtle, marginTop: 2 },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: space.md },
    itemCard: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      justifyContent: 'space-between',
      gap: space.md,
    },
    itemMain: { flex: 1, minWidth: 0, gap: 2 },
    itemCategory: { fontSize: font.xs, fontFamily: family.semibold, color: colors.textSubtle, textTransform: 'uppercase' },
    itemTitle: { fontSize: font.md, fontFamily: family.semibold, color: colors.text },
    itemTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    itemNote: { fontSize: font.sm, fontFamily: family.regular, color: colors.textMuted, lineHeight: Math.round(font.sm * 1.45), marginTop: 2 },
    itemMeta: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted, marginTop: 2 },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    ghostAction: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
    },
    ghostActionText: { fontSize: font.sm, fontFamily: family.semibold },
    searchRow: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
    },
    searchInput: { flex: 1, height: TAP, fontFamily: family.regular, fontSize: font.md },
    resultList: { marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    resultCount: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
      lineHeight: Math.round(font.xs * 1.5),
      paddingTop: space.sm,
    },
    searchEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.md,
      paddingVertical: space.md,
    },
    itemCardOverdue: {
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    overdueTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    overdueTagText: {
      fontSize: font.xs,
      fontFamily: family.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    itemByline: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
      marginTop: 4,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
      alignSelf: 'flex-start',
    },
    phoneLink: {
      marginTop: 0,
      textDecorationLine: 'underline',
    },
    pickerCard: {
      borderWidth: 1,
      borderRadius: radius.md,
      padding: space.sm,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginBottom: space.xs,
    },
    pickerNav: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerMonth: {
      flex: 1,
      textAlign: 'center',
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.text,
    },
    pickerWeekRow: { flexDirection: 'row' },
    pickerCell: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerWeekday: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
    },
    pickerDay: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerDayNum: { fontSize: font.sm, fontFamily: family.medium },
    dialogBody: {
      fontSize: font.md,
      fontFamily: family.regular,
      lineHeight: Math.round(font.md * 1.5),
      color: colors.textMuted,
      marginTop: space.sm,
    },
    dialogActions: { marginTop: space.lg, gap: 12 },
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
    gateAction: { marginTop: space.lg, alignSelf: 'stretch' },
  });
}
