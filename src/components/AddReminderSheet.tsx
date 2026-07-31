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
import { FamilyLink, FamilyReminderRepeat } from '../lib/types';

const TIME_PRESETS = ['08:00', '12:00', '18:00', '21:00'];
const REPEATS: FamilyReminderRepeat[] = ['once', 'daily', 'weekly', 'monthly'];

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

  // A guardian can write to their own device or to a linked parent's account.
  // The target is never inferred: writing to someone else's phone has to be a
  // deliberate tap, so this starts on 'self' and the picker stays on screen.
  const [wards, setWards] = useState<FamilyLink[]>([]);
  const [target, setTarget] = useState<'self' | string>('self');

  useEffect(() => {
    const token = session?.access_token;
    if (!visible || !token) return;
    let active = true;
    listFamilyLinks(token)
      .then(({ asGuardian }) => {
        if (!active) return;
        const live = asGuardian.filter((link) => link.status === 'active' && link.parentId);
        setWards(live);
        // A link revoked since the last open must not stay selected.
        setTarget((current) =>
          current !== 'self' && !live.some((link) => link.parentId === current) ? 'self' : current,
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [visible, session?.access_token]);

  const selectedWard = target === 'self' ? null : (wards.find((w) => w.parentId === target) ?? null);
  const forParent = selectedWard !== null;
  const wardLabel = (link: FamilyLink) =>
    link.parentName || link.parentPhone || t('family.guardianLabel');

  function chooseTarget(next: 'self' | string) {
    setTarget(next);
    setError(null);
  }

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
    setTarget('self');
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
          parentId: selectedWard.parentId as string,
          title: title.trim(),
          dateISO,
          time: normalizedTime,
          repeat,
        });
        // Pull it straight back so this device's calendar, bell and alert show
        // it now rather than after the next foreground sync.
        await refreshFamilyForSelf(session.access_token, user?.id);
      } else {
        await addEvent({ title: title.trim(), dateISO, time: normalizedTime, repeat });
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
        {wards.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.label}>
              {t('reminders.forWhom', { defaultValue: 'Who is this for?' })}
            </Text>
            <View style={styles.chipRow}>
              <Chip
                label={t('reminders.forMe', { defaultValue: 'For me' })}
                active={target === 'self'}
                onPress={() => chooseTarget('self')}
              />
              {wards.map((link) => (
                <Chip
                  key={link.id}
                  label={wardLabel(link)}
                  active={target === link.parentId}
                  onPress={() => chooseTarget(link.parentId as string)}
                />
              ))}
            </View>
            <View style={styles.destinationRow}>
              <Feather
                name={forParent ? 'send' : 'user'}
                size={14}
                color={forParent ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.destinationText,
                  { color: forParent ? colors.accent : colors.textMuted },
                ]}
              >
                {forParent
                  ? t('reminders.savesToParent', {
                      name: wardLabel(selectedWard),
                      defaultValue: 'Saves to {{name}}’s account.',
                    })
                  : t('reminders.savesToSelf', {
                      defaultValue: 'Saves to your own account.',
                    })}
              </Text>
            </View>
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
        <Muted style={styles.footnote}>
          {forParent
            ? t('reminders.alertNoteParentNamed', {
                name: wardLabel(selectedWard),
                defaultValue: '{{name}}’s phone will alert them at this time.',
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
    destinationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      marginTop: space.xs,
    },
    destinationText: { flex: 1, fontFamily: family.semibold, fontSize: font.sm },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    errorText: { fontFamily: family.medium, fontSize: font.sm },
    footnote: { fontSize: font.xs, textAlign: 'center' },
  });
}
