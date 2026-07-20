import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Chip, Muted, Sheet } from './ui';
import { useTheme } from '../context/ThemeContext';
import { addEvent, isValidISODate, normalizeTimeInput, toLocalISODate } from '../lib/calendar';
import { AppColors, family, font, radius, space, TAP } from '../lib/theme';
import { ReminderRepeat } from '../lib/types';

const TIME_PRESETS = ['08:00', '12:00', '18:00', '21:00'];
const REPEATS: ReminderRepeat[] = ['once', 'daily', 'weekly'];

function shiftedISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

export default function AddReminderSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [dateISO, setDateISO] = useState(shiftedISO(0));
  const [time, setTime] = useState('08:00');
  const [repeat, setRepeat] = useState<ReminderRepeat>('once');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayPresets = [
    { label: t('reminders.today'), value: shiftedISO(0) },
    { label: t('reminders.tomorrow'), value: shiftedISO(1) },
    { label: t('reminders.nextWeek'), value: shiftedISO(7) },
  ];

  function reset() {
    setTitle('');
    setDateISO(shiftedISO(0));
    setTime('08:00');
    setRepeat('once');
    setError(null);
  }

  async function handleSave() {
    if (!title.trim()) return;
    if (!isValidISODate(dateISO)) {
      setError(t('reminders.badDate'));
      return;
    }
    const trimmedTime = time.trim();
    const normalizedTime = trimmedTime ? normalizeTimeInput(trimmedTime) : null;
    if (trimmedTime && !normalizedTime) {
      setError(t('reminders.badTime'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await addEvent({ title: title.trim(), dateISO, time: normalizedTime, repeat });
      reset();
      onSaved();
      onClose();
    } catch {
      setError(t('reminders.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reminders.newTitle')}>
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('reminders.what')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('reminders.whatPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel={t('reminders.what')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('reminders.when')}</Text>
          <View style={styles.chipRow}>
            {dayPresets.map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                active={dateISO === preset.value}
                onPress={() => {
                  setDateISO(preset.value);
                  setError(null);
                }}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={dateISO}
            onChangeText={(value) => {
              setDateISO(value);
              setError(null);
            }}
            accessibilityLabel={t('calendar.date')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('reminders.atTime')}</Text>
          <View style={styles.chipRow}>
            {TIME_PRESETS.map((preset) => (
              <Chip
                key={preset}
                label={preset}
                active={time === preset}
                onPress={() => {
                  setTime(preset);
                  setError(null);
                }}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={(value) => {
              setTime(value);
              setError(null);
            }}
            placeholder="HH:MM"
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel={t('calendar.time')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('reminders.repeatLabel')}</Text>
          <View style={styles.chipRow}>
            {REPEATS.map((option) => (
              <Chip
                key={option}
                label={t(`reminders.repeat.${option}`)}
                active={repeat === option}
                onPress={() => setRepeat(option)}
              />
            ))}
          </View>
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={t('reminders.save')}
          onPress={handleSave}
          loading={saving}
          disabled={!title.trim()}
        />
        <Muted style={styles.footnote}>{t('reminders.alertNote')}</Muted>
      </View>
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    form: { gap: space.md },
    field: { gap: space.xs },
    label: { fontFamily: family.medium, fontSize: font.sm, color: colors.textMuted },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xs },
    input: {
      minHeight: TAP,
      backgroundColor: colors.surfaceTint,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontFamily: family.regular,
      fontSize: font.md,
      color: colors.text,
    },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    errorText: { fontFamily: family.medium, fontSize: font.sm },
    footnote: { fontSize: font.xs, textAlign: 'center' },
  });
}
