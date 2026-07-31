import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Chip, Muted, Sheet } from './ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { addEvent, isValidISODate, normalizeTimeInput, toLocalISODate } from '../lib/calendar';
import { addFamilyReminder, friendlyFamilyError, listFamilyLinks } from '../lib/family';
import { refreshFamilyForSelf } from '../lib/familySync';
import { todayISO } from '../lib/notifications';
import { AppColors, family, font, radius, space, TAP } from '../lib/theme';
import { FamilyLink, FamilyReminderRepeat, ReminderRepeat } from '../lib/types';

const TIME_PRESETS = ['08:00', '12:00', '18:00', '21:00'];
const REPEATS: FamilyReminderRepeat[] = ['once', 'daily', 'weekly'];
// The local calendar store cannot hold a monthly repeat; only a reminder written
// to a parent's account (which can) offers it.
const FAMILY_REPEATS: FamilyReminderRepeat[] = ['once', 'daily', 'weekly', 'monthly'];

// Reminder days are the parent's Asia/Kolkata day, so the Today/Tomorrow
// presets shift from that anchor rather than the device's own calendar.
function shiftedISO(days: number) {
  const [year, month, day] = todayISO().split('-').map(Number);
  return toLocalISODate(new Date(year, month - 1, day + days));
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
  const { session, user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [dateISO, setDateISO] = useState(shiftedISO(0));
  const [time, setTime] = useState('08:00');
  const [repeat, setRepeat] = useState<FamilyReminderRepeat>('once');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A guardian's own device has no reminders of its own to keep — what they add
  // here belongs on a linked parent's account, or the parent never sees it.
  const [wards, setWards] = useState<FamilyLink[]>([]);
  const [wardId, setWardId] = useState<string | null>(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!visible || !token) return;
    let active = true;
    listFamilyLinks(token)
      .then(({ asGuardian }) => {
        if (!active) return;
        const live = asGuardian.filter((link) => link.status === 'active' && link.parentId);
        setWards(live);
        setWardId((current) => current ?? live[0]?.parentId ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [visible, session?.access_token]);

  const forParent = wards.length > 0 && wardId !== null;
  const repeatOptions = forParent ? FAMILY_REPEATS : REPEATS;

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
      if (forParent && session) {
        await addFamilyReminder(session.access_token, {
          parentId: wardId as string,
          title: title.trim(),
          dateISO,
          time: normalizedTime,
          repeat,
        });
        // Pull it straight back so this device's calendar, bell and alert show
        // it now rather than after the next foreground sync.
        await refreshFamilyForSelf(session.access_token, user?.id);
      } else {
        // 'monthly' is never offered outside the family path — the local store
        // has no way to represent it.
        const localRepeat: ReminderRepeat = repeat === 'monthly' ? 'once' : repeat;
        await addEvent({ title: title.trim(), dateISO, time: normalizedTime, repeat: localRepeat });
      }
      reset();
      onSaved();
      onClose();
    } catch (e) {
      setError(forParent ? friendlyFamilyError(e, t) : t('reminders.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reminders.newTitle')}>
      <View style={styles.form}>
        {forParent ? (
          <View style={styles.field}>
            <Text style={styles.label}>
              {t('reminders.forWhom', { defaultValue: 'Who is this for?' })}
            </Text>
            {wards.length > 1 ? (
              <View style={styles.chipRow}>
                {wards.map((link) => (
                  <Chip
                    key={link.id}
                    label={link.parentName || link.parentPhone || t('family.guardianLabel')}
                    active={wardId === link.parentId}
                    onPress={() => setWardId(link.parentId ?? null)}
                  />
                ))}
              </View>
            ) : (
              <Muted style={styles.forWhom}>
                {t('reminders.savesToParent', {
                  name: wards[0]?.parentName || wards[0]?.parentPhone || '',
                  defaultValue: 'Saves to {{name}}’s account.',
                })}
              </Muted>
            )}
          </View>
        ) : null}

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
            {repeatOptions.map((option) => (
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
        <Muted style={styles.footnote}>
          {forParent
            ? t('reminders.alertNoteParent', {
                defaultValue: 'Their phone will alert them at this time.',
              })
            : t('reminders.alertNote')}
        </Muted>
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
    forWhom: { fontSize: font.sm },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    errorText: { fontFamily: family.medium, fontSize: font.sm },
    footnote: { fontSize: font.xs, textAlign: 'center' },
  });
}
