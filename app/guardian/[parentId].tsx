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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { Button, Card, Chip, Dialog, H1, H2, Muted } from '../../src/components/ui';
import { AppColors, family, font, radius, space, TAP } from '../../src/lib/theme';
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

type SectionKey = 'overview' | 'reminders' | 'places' | 'care';

const REMINDER_REPEATS: FamilyReminderRepeat[] = ['once', 'daily', 'weekly', 'monthly'];
const CARE_CATEGORIES: CareTeamCategory[] = ['doctor', 'grocery', 'pharmacy', 'hospital', 'helper', 'other'];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toISO(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

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

// lastActiveAt is an absolute server timestamp; render it as the parent's own
// Kolkata wall time rather than the guardian's local zone.
function formatISTStamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const k = new Date(d.getTime() + IST_OFFSET_MS);
  const period = k.getUTCHours() < 12 ? 'AM' : 'PM';
  const hour12 = k.getUTCHours() % 12 === 0 ? 12 : k.getUTCHours() % 12;
  return `${k.getUTCDate()} ${MONTHS_SHORT[k.getUTCMonth()]} ${k.getUTCFullYear()}, ${hour12}:${pad(
    k.getUTCMinutes(),
  )} ${period} IST`;
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
  const { parentId: rawParentId } = useLocalSearchParams<{ parentId: string }>();
  const parentId = Array.isArray(rawParentId) ? rawParentId[0] : rawParentId;
  const { session, user, loading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const isWide = isComputerMode && width >= 900;
  const styles = makeStyles(colors, isWide);

  const [parentName, setParentName] = useState('');
  const [section, setSection] = useState<SectionKey>('overview');

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
  const sections: { key: SectionKey; label: string }[] = [
    { key: 'overview', label: t('family.analyticsTitle') },
    { key: 'reminders', label: t('family.remindersTitle') },
    { key: 'places', label: t('family.favoritesTitle') },
    { key: 'care', label: t('family.careTeamTitle') },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.pageOuter}>
      <AppHeader title={heading} />
      <Stack.Screen options={{ title: heading }} />
      {/* The keyboard inset is added, not maxed: the Ask box sits low on this
          page, and without the extra run-off there is nothing to scroll it up
          into once the keyboard is open. */}
      <View
        style={[styles.page, { paddingBottom: Math.max(insets.bottom, space.lg) + keyboardInset }]}
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

        <View style={styles.chipRow}>
          {sections.map((s) => (
            <Chip key={s.key} label={s.label} active={section === s.key} onPress={() => setSection(s.key)} />
          ))}
        </View>

        {!parentId ? (
          <Card style={styles.stateCard}>
            <Muted style={styles.stateText}>{t('family.errorNotLinked')}</Muted>
          </Card>
        ) : section === 'overview' ? (
          <OverviewSection token={token} parentId={parentId} parentName={parentName} styles={styles} colors={colors} isWide={isWide} />
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
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

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
  const [data, setData] = useState<ParentAnalytics | null>(null);
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

  // Adherence, last-active and the overdue count all move when the senior acts.
  // Quiet refresh for the same reason as the reminder list: the numbers update
  // in place rather than collapsing the card into a spinner.
  useLivePoll(() => {
    fetchParentAnalytics(token, parentId)
      .then((d) => setData(d))
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

  const lastActive = data.lastActiveAt
    ? formatISTStamp(data.lastActiveAt)
    : t('family.neverActive');

  const stats: { label: string; value: string | number }[] = [
    { label: t('family.lastActiveLabel'), value: lastActive },
    { label: t('family.assistantEvents7d'), value: data.assistantEvents7d },
    { label: t('family.assistantEvents30d'), value: data.assistantEvents30d },
    { label: t('family.upcomingCount'), value: data.reminders.upcoming },
    { label: t('family.overdueCount'), value: data.reminders.overdue },
    { label: t('family.doneThisWeek'), value: data.reminders.done7d },
    { label: t('family.careTeamCount'), value: data.careTeamCount },
    { label: t('family.favoritesCount'), value: data.favoritesCount },
  ];

  return (
    <View style={styles.sectionBody}>
      <View style={styles.statGrid}>
        {stats.map((s) => (
          <Card key={s.label} style={[styles.statCard, { flexBasis: isWide ? '31%' : '47%' }]}>
            <Text style={styles.statValue} numberOfLines={1}>{String(s.value)}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </Card>
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

      <H2 style={styles.subHeader}>{t('family.recentCallbacks')}</H2>
      <Card style={styles.listCard}>
        {data.callbacks.length === 0 ? (
          <View style={styles.stateBlock}>
            <Muted style={styles.stateText}>{t('family.noCallbacks')}</Muted>
          </View>
        ) : (
          data.callbacks.map((cb, index) => (
            <View key={`${cb.created_at}-${index}`}>
              <View style={styles.listRow}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{cb.issue || '—'}</Text>
                  <Text style={styles.rowMeta}>
                    {t(`family.callbackStatus.${cb.status}`, { defaultValue: cb.status })} · {formatISTStamp(cb.created_at)}
                  </Text>
                </View>
              </View>
              {index < data.callbacks.length - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))
        )}
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
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm, marginTop: space.md, marginBottom: space.lg },
    wrapChipRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
    sectionBody: { gap: space.md },
    sectionIntro: { marginBottom: space.xs },
    subHeader: { marginTop: space.md, marginBottom: space.sm },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
    statCard: { flexGrow: 1, gap: 4, paddingVertical: space.lg },
    statValue: { fontSize: font.xl, fontFamily: family.semibold, color: colors.text },
    statLabel: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted, lineHeight: Math.round(font.sm * 1.4) },
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
