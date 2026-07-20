import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useTheme } from '../../src/context/ThemeContext';
import { fetchServices } from '../../src/lib/api';
import {
  addFamilyFavorite,
  addFamilyReminder,
  fetchParentAnalytics,
  listCareTeam,
  listFamilyFavorites,
  listFamilyLinks,
  listFamilyReminders,
  markFamilyReminderDone,
  removeCareTeamMember,
  removeFamilyFavorite,
  removeFamilyReminder,
  setCareTeamMember,
} from '../../src/lib/family';
import { markLoginIntent } from '../../src/lib/authNavigation';

type SectionKey = 'overview' | 'reminders' | 'places' | 'care';

const REMINDER_REPEATS: FamilyReminderRepeat[] = ['once', 'daily', 'weekly', 'monthly'];
const CARE_CATEGORIES: CareTeamCategory[] = ['doctor', 'grocery', 'pharmacy', 'hospital', 'helper', 'other'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
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
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.gateContainer}>
        <Stack.Screen options={{ title: t('family.title') }} />
        <ActivityIndicator color={colors.textMuted} />
      </ScrollView>
    );
  }

  if (!session || !user) {
    return (
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
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.page, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
    >
      <Stack.Screen options={{ title: heading }} />
      <View style={styles.shell}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
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
          <OverviewSection token={token} parentId={parentId} styles={styles} colors={colors} isWide={isWide} />
        ) : section === 'reminders' ? (
          <RemindersSection token={token} parentId={parentId} styles={styles} colors={colors} />
        ) : section === 'places' ? (
          <PlacesSection token={token} parentId={parentId} styles={styles} colors={colors} />
        ) : (
          <CareTeamSection token={token} parentId={parentId} styles={styles} colors={colors} />
        )}
      </View>
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

// ----- Overview -----

function OverviewSection({
  token,
  parentId,
  styles,
  colors,
  isWide,
}: {
  token: string;
  parentId: string;
  styles: Styles;
  colors: AppColors;
  isWide: boolean;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ParentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchParentAnalytics(token, parentId)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, parentId]);

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
    ? new Date(data.lastActiveAt).toLocaleDateString()
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
                    {t(`family.callbackStatus.${cb.status}`, { defaultValue: cb.status })} · {new Date(cb.created_at).toLocaleDateString()}
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
}: {
  token: string;
  parentId: string;
  styles: Styles;
  colors: AppColors;
}) {
  const { t } = useTranslation();
  const [reminders, setReminders] = useState<FamilyReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<FamilyReminderRepeat>('once');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<FamilyReminder | null>(null);

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

  const groups = useMemo(() => {
    const today = todayISO();
    const active = reminders.filter((r) => r.status === 'active');
    return {
      overdue: active.filter((r) => r.dateISO < today),
      upcoming: active.filter((r) => r.dateISO >= today),
      done: reminders.filter((r) => r.status === 'done'),
    };
  }, [reminders]);

  async function add() {
    setError(null);
    setSuccess(false);
    if (!title.trim()) return;
    if (!DATE_RE.test(date.trim())) {
      setError(t('family.badDate'));
      return;
    }
    if (time.trim() && !TIME_RE.test(time.trim())) {
      setError(t('family.badTime'));
      return;
    }
    setSaving(true);
    try {
      await addFamilyReminder(token, {
        parentId,
        title: title.trim(),
        note: note.trim() || null,
        dateISO: date.trim(),
        time: time.trim() || null,
        repeat,
      });
      setTitle('');
      setNote('');
      setDate(todayISO());
      setTime('');
      setRepeat('once');
      setSuccess(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
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

  function renderReminder(r: FamilyReminder, done: boolean) {
    return (
      <Card key={r.id} style={styles.itemCard}>
        <View style={styles.itemMain}>
          <Text style={[styles.itemTitle, done ? styles.itemTitleDone : null]}>{r.title}</Text>
          {r.note ? <Text style={styles.itemNote}>{r.note}</Text> : null}
          <Text style={styles.itemMeta}>
            {r.dateISO}
            {r.time ? ` · ${r.time}` : ''}
            {r.repeat !== 'once' ? ` · ${t(`family.repeat.${r.repeat}`)}` : ''}
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
        <Text style={styles.cardTitle}>{t('family.addReminder')}</Text>
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
        <Field
          label={t('family.reminderDateLabel')}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={10}
        />
        <Field
          label={t('family.reminderTimeLabel')}
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={5}
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
          <Button label={t('family.saveReminder')} onPress={add} loading={saving} disabled={!title.trim()} />
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
              {groups.overdue.map((r) => renderReminder(r, false))}
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
  const [removeTarget, setRemoveTarget] = useState<FamilyFavorite | null>(null);

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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return services
      .filter((s) => !savedIds.has(s.id))
      .filter((s) => {
        const text = [s.name, s.address, s.town, t(`categories.${s.category}`)].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      })
      .slice(0, 12);
  }, [query, services, savedIds, t]);

  async function add(service: Service) {
    setError(null);
    setBusyId(service.id);
    try {
      await addFamilyFavorite(token, { parentId, serviceId: service.id, note: note.trim() || null });
      setNote('');
      setQuery('');
      await loadFavorites();
    } catch (e) {
      setError((e as Error).message);
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
        {query.trim() && matches.length > 0 ? (
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
          </View>
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

  const [category, setCategory] = useState<CareTeamCategory>('doctor');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CareTeamMember | null>(null);

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

  async function add() {
    setError(null);
    setSuccess(false);
    if (!name.trim()) return;
    setSaving(true);
    try {
      await setCareTeamMember(token, {
        parentId,
        category,
        name: name.trim(),
        phone: phone.trim() || null,
        note: note.trim() || null,
      });
      setName('');
      setPhone('');
      setNote('');
      setSuccess(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
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
        <Text style={styles.cardTitle}>{t('family.addContact')}</Text>
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
          <Button label={t('family.saveContact')} onPress={add} loading={saving} disabled={!name.trim()} />
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
              {m.phone ? <Text style={styles.itemMeta} numberOfLines={1}>{m.phone}</Text> : null}
              {m.note ? <Text style={styles.itemNote}>{m.note}</Text> : null}
            </View>
            <View style={styles.itemActions}>
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
