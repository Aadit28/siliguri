import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, H1, Muted, Button } from '../src/components/ui';
import { AppColors, font, radius, space } from '../src/lib/theme';
import { useTheme } from '../src/context/ThemeContext';
import { addEvent, googleCalendarUrl, listEvents, removeEvent } from '../src/lib/calendar';
import { CalendarEvent } from '../src/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatReadableDate(dateISO: string) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return dateISO;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('calendar.title') }} />
      <H1>{t('calendar.title')}</H1>

      <Muted style={styles.sectionLabel}>{t('calendar.upcoming')}</Muted>
      {events.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Muted>{t('calendar.empty')}</Muted>
        </Card>
      ) : (
        <View style={styles.eventList}>
          {events.map((event) => (
            <Card key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeaderRow}>
                <Text style={[styles.eventDate, { color: colors.text }]}>{formatReadableDate(event.dateISO)}</Text>
                {event.time ? <Text style={[styles.eventTime, { color: colors.textMuted }]}>{event.time}</Text> : null}
              </View>
              <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
              {event.note ? <Muted style={styles.eventNote}>{event.note}</Muted> : null}

              <View style={styles.eventActions}>
                <Button
                  label={t('calendar.openGoogle')}
                  variant="secondary"
                  onPress={() => Linking.openURL(googleCalendarUrl(event))}
                />
                {event.servicePhone ? (
                  <Button
                    label={t('calendar.call')}
                    variant="secondary"
                    onPress={() => Linking.openURL(`tel:${event.servicePhone}`)}
                  />
                ) : null}
                <Button label={t('calendar.delete')} variant="danger" onPress={() => handleDelete(event.id)} />
              </View>
            </Card>
          ))}
        </View>
      )}

      <Muted style={styles.sectionLabel}>{t('calendar.add')}</Muted>
      <Card style={styles.formCard}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('calendar.eventTitle')}
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, dateError ? { borderColor: colors.danger } : null]}
          value={dateISO}
          onChangeText={(value) => {
            setDateISO(value);
            setDateError(false);
          }}
          placeholder={t('calendar.date')}
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder={t('calendar.time')}
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder={t('calendar.note')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Button
          label={t('calendar.save')}
          onPress={handleSave}
          loading={saving}
          disabled={!title.trim()}
        />
        {savedMessage ? <Muted style={{ color: colors.success }}>{t('calendar.added')}</Muted> : null}
      </Card>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    content: { padding: space.md, gap: space.sm },
    sectionLabel: { marginTop: space.md, marginBottom: space.xs, fontWeight: '800' },
    emptyCard: { gap: space.xs },
    eventList: { gap: space.sm },
    eventCard: { gap: space.xs },
    eventHeaderRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space.sm,
    },
    eventDate: { fontSize: font.lg, fontWeight: '900' },
    eventTime: { fontSize: font.md, fontWeight: '700' },
    eventTitle: { fontSize: font.md, fontWeight: '800' },
    eventNote: { marginTop: 2 },
    eventActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: space.sm,
    },
    formCard: { gap: space.sm },
    input: {
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      color: colors.text,
      minHeight: 54,
    },
    noteInput: { minHeight: 90, textAlignVertical: 'top' },
  });
}
