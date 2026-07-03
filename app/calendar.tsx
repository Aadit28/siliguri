import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Body, Button, Card, Dialog, H1, H2, Muted, Sheet } from '../src/components/ui';
import { AppColors, family, font, radius, space, TAP, tracking } from '../src/lib/theme';
import { useTheme } from '../src/context/ThemeContext';
import { addEvent, googleCalendarUrl, listEvents, removeEvent } from '../src/lib/calendar';
import { CalendarEvent } from '../src/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toISO(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatReadableDate(dateISO: string) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return dateISO;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function monthName(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState('');
  const [dateISO, setDateISO] = useState(tomorrowISO());
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [dateError, setDateError] = useState(false);

  const now = new Date();
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const [sheetEvent, setSheetEvent] = useState<CalendarEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(() => {
    let mounted = true;
    listEvents().then((items) => {
      if (mounted) setEvents(items);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cleanup = load();
      return cleanup;
    }, [load]),
  );

  async function handleDelete(id: string) {
    await removeEvent(id);
    load();
  }

  async function handleSave() {
    if (!title.trim() || !DATE_RE.test(dateISO)) {
      setDateError(!DATE_RE.test(dateISO));
      return;
    }
    setDateError(false);
    setSaving(true);
    await addEvent({
      title: title.trim(),
      dateISO,
      time: time.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    setTitle('');
    setDateISO(tomorrowISO());
    setTime('');
    setNote('');
    setSavedMessage(true);
    load();
    setTimeout(() => setSavedMessage(false), 2500);
  }

  const weeks = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        // Jan 7 2024 is a Sunday; gives locale-aware narrow weekday initials.
        new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
      ),
    [],
  );
  const eventDates = useMemo(() => new Set(events.map((event) => event.dateISO)), [events]);

  function goMonth(delta: number) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function openEvent(event: CalendarEvent) {
    setSheetEvent(event);
    setSheetOpen(true);
  }

  function askDelete(event: CalendarEvent) {
    setSheetOpen(false);
    setPendingDelete(event);
    setConfirmOpen(true);
  }

  function confirmDelete() {
    setConfirmOpen(false);
    if (pendingDelete) handleDelete(pendingDelete.id);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('calendar.title') }} />
      <H1 style={styles.screenTitle}>{t('calendar.title')}</H1>

      <Card style={styles.monthCard}>
        <View style={styles.monthHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={monthName(cursor.year, cursor.month - 1)}
            onPress={() => goMonth(-1)}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint },
            ]}
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.text }]} numberOfLines={1}>
            {monthName(cursor.year, cursor.month)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={monthName(cursor.year, cursor.month + 1)}
            onPress={() => goMonth(1)}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint },
            ]}
          >
            <Feather name="chevron-right" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {weekdayLabels.map((label, i) => (
            <View key={`wd-${i}`} style={styles.weekdayCell}>
              <Text style={[styles.weekdayLabel, { color: colors.textSubtle }]}>{label}</Text>
            </View>
          ))}
        </View>

        {weeks.map((week, wi) => (
          <View key={`w-${wi}`} style={styles.weekRow}>
            {week.map((day, di) => {
              if (!day) return <View key={`d-${wi}-${di}`} style={styles.dayCell} />;
              const iso = toISO(cursor.year, cursor.month, day);
              const isToday = iso === todayISO;
              const isSelected = iso === dateISO;
              const hasEvent = eventDates.has(iso);
              return (
                <Pressable
                  key={`d-${wi}-${di}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={new Date(cursor.year, cursor.month, day).toLocaleDateString(
                    undefined,
                    { weekday: 'long', day: 'numeric', month: 'long' },
                  )}
                  onPress={() => {
                    setDateISO(iso);
                    setDateError(false);
                  }}
                  style={styles.dayCell}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.dayDisc,
                        isToday
                          ? { backgroundColor: colors.accent }
                          : isSelected
                            ? { borderWidth: 2, borderColor: colors.accent }
                            : pressed
                              ? { backgroundColor: colors.overlayStrong }
                              : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          {
                            color: isToday
                              ? colors.accentFg
                              : isSelected
                                ? colors.accent
                                : colors.text,
                          },
                          isToday || isSelected ? styles.dayNumStrong : null,
                        ]}
                      >
                        {day}
                      </Text>
                      {hasEvent ? (
                        <View
                          style={[
                            styles.dayDot,
                            { backgroundColor: isToday ? colors.accentFg : colors.textMuted },
                          ]}
                        />
                      ) : null}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      <H2 style={styles.sectionTitle}>{t('calendar.upcoming')}</H2>
      {events.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={[styles.leadDisc, { backgroundColor: colors.surfaceTint }]}>
            <Feather name="calendar" size={20} color={colors.text} />
          </View>
          <Muted style={styles.emptyText}>{t('calendar.empty')}</Muted>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {events.map((event, index) => (
            <View key={event.id}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={event.title}
                onPress={() => openEvent(event)}
                style={({ pressed }) => [
                  styles.eventRow,
                  pressed ? { backgroundColor: colors.overlay } : null,
                ]}
              >
                <View style={[styles.leadDisc, { backgroundColor: colors.surfaceTint }]}>
                  <Feather name="calendar" size={20} color={colors.text} />
                </View>
                <View style={styles.eventTextBlock}>
                  <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={[styles.eventMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {formatReadableDate(event.dateISO)}
                    {event.time ? ` · ${event.time}` : ''}
                  </Text>
                </View>
                <Feather name="chevron-right" size={22} color={colors.textSubtle} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <H2 style={styles.sectionTitle}>{t('calendar.add')}</H2>
      <Card style={styles.formCard}>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
            {t('calendar.eventTitle')}
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            accessibilityLabel={t('calendar.eventTitle')}
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: dateError ? colors.danger : colors.textMuted }]}>
            {t('calendar.date')}
          </Text>
          <TextInput
            style={[
              styles.input,
              dateError ? { borderColor: colors.danger, borderWidth: 1.5 } : null,
            ]}
            value={dateISO}
            onChangeText={(value) => {
              setDateISO(value);
              setDateError(false);
            }}
            accessibilityLabel={t('calendar.date')}
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('calendar.time')}</Text>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            accessibilityLabel={t('calendar.time')}
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('calendar.note')}</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            accessibilityLabel={t('calendar.note')}
            multiline
          />
        </View>

        <Button
          label={t('calendar.save')}
          onPress={handleSave}
          loading={saving}
          disabled={!title.trim()}
        />
        {savedMessage ? (
          <View style={styles.savedRow}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={[styles.savedText, { color: colors.success }]}>{t('calendar.added')}</Text>
          </View>
        ) : null}
      </Card>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={sheetEvent?.title}>
        {sheetEvent ? (
          <View>
            <View style={styles.sheetMetaRow}>
              <Feather name="clock" size={16} color={colors.textMuted} />
              <Body style={{ color: colors.textMuted }}>
                {formatReadableDate(sheetEvent.dateISO)}
                {sheetEvent.time ? ` · ${sheetEvent.time}` : ''}
              </Body>
            </View>
            {sheetEvent.note ? (
              <Body style={[styles.sheetNote, { color: colors.textMuted }]}>{sheetEvent.note}</Body>
            ) : null}
            <View style={styles.sheetActions}>
              <Button
                label={t('calendar.openGoogle')}
                variant="accent"
                icon={<Feather name="calendar" size={20} color={colors.accentFg} />}
                onPress={() => Linking.openURL(googleCalendarUrl(sheetEvent))}
              />
              {sheetEvent.servicePhone ? (
                <Button
                  label={t('calendar.call')}
                  variant="secondary"
                  icon={<Feather name="phone" size={20} color={colors.primaryDark} />}
                  onPress={() => Linking.openURL(`tel:${sheetEvent.servicePhone}`)}
                />
              ) : null}
              <Button
                label={t('calendar.delete')}
                variant="danger"
                icon={<Feather name="trash-2" size={20} color={colors.dangerFg} />}
                onPress={() => askDelete(sheetEvent)}
              />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Dialog visible={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('calendar.delete')}>
        {pendingDelete ? (
          <Body style={{ color: colors.textMuted }}>
            {pendingDelete.title} · {formatReadableDate(pendingDelete.dateISO)}
          </Body>
        ) : null}
        <View style={styles.dialogActions}>
          <Button label={t('calendar.delete')} variant="danger" onPress={confirmDelete} />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setConfirmOpen(false)}
          />
        </View>
      </Dialog>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    content: {
      padding: space.md,
      paddingTop: space.sm,
      paddingBottom: space.xxl,
    },
    screenTitle: { marginBottom: space.md },
    sectionTitle: { marginTop: space.lg, marginBottom: space.sm },

    monthCard: { paddingHorizontal: space.sm },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginBottom: space.sm,
      paddingHorizontal: space.xs,
    },
    navBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: font.lg,
      fontFamily: family.bold,
      letterSpacing: tracking.lg,
      lineHeight: Math.round(font.lg * 1.3),
    },
    weekRow: { flexDirection: 'row' },
    weekdayCell: {
      flex: 1,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekdayLabel: {
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: Math.round(font.xs * 1.4),
    },
    dayCell: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNum: { fontSize: font.sm, fontFamily: family.medium },
    dayNumStrong: { fontFamily: family.bold },
    dayDot: {
      position: 'absolute',
      bottom: 5,
      width: 5,
      height: 5,
      borderRadius: radius.pill,
    },

    emptyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    emptyText: { flex: 1 },
    listCard: { padding: 0 },
    eventRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: space.md,
    },
    leadDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventTextBlock: { flex: 1 },
    eventTitle: {
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
    },
    eventMeta: {
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
      marginTop: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 72,
    },

    formCard: { gap: space.md },
    field: { gap: 6 },
    fieldLabel: {
      fontSize: font.sm,
      fontFamily: family.medium,
      lineHeight: Math.round(font.sm * 1.45),
    },
    input: {
      backgroundColor: colors.surfaceTint,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      fontFamily: family.regular,
      color: colors.text,
      minHeight: TAP,
    },
    noteInput: { minHeight: 96, textAlignVertical: 'top' },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    savedText: {
      fontSize: font.sm,
      fontFamily: family.medium,
      lineHeight: Math.round(font.sm * 1.45),
    },

    sheetMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    sheetNote: { marginTop: space.sm },
    sheetActions: { marginTop: space.lg, gap: 12 },
    dialogActions: { marginTop: space.lg, gap: 12 },
  });
}
