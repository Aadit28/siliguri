import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Chip, H1, H2, Muted, dateLocale } from '../../src/components/ui';
import { AppColors, family, radius, Tokens } from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { markLoginIntent } from '../../src/lib/authNavigation';
import { isDemoToken } from '../../src/lib/demoFamily';
import { rupeesFromPaise } from '../../src/lib/bookings';
import {
  VendorPendingBooking,
  VendorService,
  VendorSlot,
  decideVendorBooking,
  deleteVendorSlot,
  fetchVendorWeek,
  friendlyVendorError,
  isNotAVendorError,
  isVendorToolsUnavailable,
  saveVendorSlot,
} from '../../src/lib/vendor';

// The provider's calendar: the week they have published, the bookings waiting
// on their answer, and the controls to change both.
//
// Not an elder surface. The 64pt targets, the single-column grid and the
// simple-mode scaling that the senior screens carry are all absent on purpose —
// a vendor is a working adult on their own phone, and the density that would be
// hostile to a 78-year-old is what lets a shopkeeper lay out a week between two
// customers. What it does keep is the translation: a Siliguri shop is at least
// as likely to be read in Hindi as in English.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DEFAULT_DURATION_MIN = 15;
const DEFAULT_CAPACITY = 1;

/** The Kolkata calendar day an instant falls on — the day the vendor works. */
function istDayKey(iso: string) {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function istToday(offsetDays = 0) {
  return new Date(Date.now() + IST_OFFSET_MS + offsetDays * 86400000).toISOString().slice(0, 10);
}

function istClock(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function istDayLabel(dayKey: string, locale: string) {
  return new Date(`${dayKey}T12:00:00+05:30`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Builds the instant a "2026-08-09" + "14:30" pair means to the vendor typing
 * it. Always stamped +05:30: a shop's two o'clock is two o'clock in Siliguri
 * whatever timezone the phone believes it is in, and reading the device zone
 * here would put a slot an hour out for anyone travelling.
 */
function toIstInstant(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;
  if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return null;
  const [hour, minute] = time.trim().split(':').map(Number);
  if (hour > 23 || minute > 59) return null;
  const iso = `${date.trim()}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Rupees in the box, paise on the wire. Blank means "no price of my own". */
function paiseFromRupeeInput(value: string): number | null | undefined {
  const raw = value.trim();
  if (!raw) return null;
  const rupees = Number(raw);
  if (!Number.isFinite(rupees) || rupees < 0) return undefined;
  return Math.round(rupees * 100);
}

export default function VendorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { lang } = useLocale();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);
  const locale = dateLocale(lang);

  const token = session?.access_token ?? null;
  const demo = token ? isDemoToken(token) : false;

  const [vendors, setVendors] = useState<VendorService[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [slots, setSlots] = useState<VendorSlot[]>([]);
  const [pending, setPending] = useState<VendorPendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notVendor, setNotVendor] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newDate, setNewDate] = useState(istToday(0));
  const [newTime, setNewTime] = useState('10:00');
  const [newDuration, setNewDuration] = useState(String(DEFAULT_DURATION_MIN));
  const [newCapacity, setNewCapacity] = useState(String(DEFAULT_CAPACITY));
  const [newPrice, setNewPrice] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    async (targetVendorId?: string | null) => {
      if (!token || isDemoToken(token)) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      setNotVendor(false);
      setUnavailable(false);
      try {
        const week = await fetchVendorWeek(token, {
          vendorId: targetVendorId ?? undefined,
          dateFrom: istToday(0),
          dateTo: istToday(14),
        });
        setVendors(week.vendors);
        setVendorId(week.vendor?.id ?? targetVendorId ?? null);
        setSlots(week.slots);
        setPending(week.pending);
      } catch (error) {
        setSlots([]);
        setPending([]);
        // Three different dead ends, three different screens. "You manage no
        // listing" is not an error the vendor can retry out of, and neither is
        // a server without the migration — offering a Try again button for
        // either would be a button that can only ever fail.
        if (isVendorToolsUnavailable(error)) setUnavailable(true);
        else if (isNotAVendorError(error)) setNotVendor(true);
        else setLoadError(friendlyVendorError(error, t));
      } finally {
        setLoading(false);
      }
    },
    [t, token],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const byDay = useMemo(() => {
    const groups = new Map<string, VendorSlot[]>();
    for (const slot of slots) {
      const key = istDayKey(slot.startsAt);
      const list = groups.get(key);
      if (list) list.push(slot);
      else groups.set(key, [slot]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  async function addSlot() {
    if (!token) return;
    const startsAt = toIstInstant(newDate, newTime);
    if (!startsAt) {
      setActionError(t('vendor.errorBadTime'));
      return;
    }
    const pricePaise = paiseFromRupeeInput(newPrice);
    if (pricePaise === undefined) {
      setActionError(t('vendor.errorBadPrice'));
      return;
    }
    setAdding(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await saveVendorSlot(token, {
        vendorId: vendorId ?? undefined,
        startsAt,
        durationMin: Number(newDuration) || DEFAULT_DURATION_MIN,
        capacity: Number(newCapacity) || DEFAULT_CAPACITY,
        pricePaise,
      });
      // Told, not swallowed: a vendor who typed a rate and was never charged it
      // would find out from a customer.
      if (result.priceIgnored) setNotice(t('vendor.noticePriceIgnored'));
      setNewPrice('');
      await load(vendorId);
    } catch (error) {
      setActionError(friendlyVendorError(error, t));
    } finally {
      setAdding(false);
    }
  }

  async function updateSlot(slot: VendorSlot, changes: { capacity?: number; pricePaise?: number | null }) {
    if (!token) return;
    setBusyId(slot.id);
    setActionError(null);
    setNotice(null);
    try {
      const result = await saveVendorSlot(token, {
        vendorId: vendorId ?? undefined,
        slotId: slot.id,
        ...changes,
      });
      if (result.priceIgnored) setNotice(t('vendor.noticePriceIgnored'));
      setSlots((current) => current.map((row) => (row.id === slot.id ? result.slot : row)));
    } catch (error) {
      setActionError(friendlyVendorError(error, t));
      // The seat count on screen is stale whenever the server refused a shrink:
      // somebody booked while this was open.
      await load(vendorId);
    } finally {
      setBusyId(null);
    }
  }

  async function removeSlot(slot: VendorSlot) {
    if (!token) return;
    setBusyId(slot.id);
    setActionError(null);
    try {
      await deleteVendorSlot(token, { slotId: slot.id, vendorId: vendorId ?? undefined });
      setSlots((current) => current.filter((row) => row.id !== slot.id));
      setEditingId(null);
    } catch (error) {
      setActionError(friendlyVendorError(error, t));
      await load(vendorId);
    } finally {
      setBusyId(null);
    }
  }

  async function decide(booking: VendorPendingBooking, decision: 'accept' | 'decline') {
    if (!token) return;
    setBusyId(booking.id);
    setActionError(null);
    try {
      await decideVendorBooking(token, {
        bookingId: booking.id,
        decision,
        vendorId: vendorId ?? undefined,
      });
      setPending((current) => current.filter((row) => row.id !== booking.id));
      // The seat count moved on a decline, so the grid behind the card is now
      // wrong until it is re-read.
      if (decision === 'decline') await load(vendorId);
    } catch (error) {
      setActionError(friendlyVendorError(error, t));
      await load(vendorId);
    } finally {
      setBusyId(null);
    }
  }

  const title = t('vendor.title');

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.textMuted} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title }} />
        <Card style={styles.stateCard}>
          <Feather name="lock" size={26} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{t('vendor.signInBody')}</Muted>
          <View style={styles.stateAction}>
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

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <H1>{title}</H1>
        <Muted>{t('vendor.subtitle')}</Muted>

        {vendors.length > 1 ? (
          <View style={styles.switcher}>
            {vendors.map((service) => (
              <Chip
                key={service.id}
                label={service.name}
                active={service.id === vendorId}
                onPress={() => {
                  setVendorId(service.id);
                  setEditingId(null);
                  void load(service.id);
                }}
              />
            ))}
          </View>
        ) : null}

        {actionError ? (
          <View style={styles.notice}>
            <Feather name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.noticeText}>{actionError}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={styles.notice}>
            <Feather name="info" size={18} color={colors.textSubtle} />
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>{notice}</Text>
          </View>
        ) : null}

        {demo ? (
          <Card style={styles.stateCard}>
            <Feather name="info" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('vendor.demoNotice')}</Muted>
          </Card>
        ) : loading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={colors.textMuted} />
            <Muted style={styles.stateText}>{t('vendor.loading')}</Muted>
          </Card>
        ) : unavailable ? (
          <Card style={styles.stateCard}>
            <Feather name="tool" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('vendor.errorNotConfigured')}</Muted>
          </Card>
        ) : notVendor ? (
          <Card style={styles.stateCard}>
            <Feather name="briefcase" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('vendor.notAVendorBody')}</Muted>
          </Card>
        ) : loadError ? (
          <Card style={styles.stateCard}>
            <Feather name="alert-circle" size={22} color={colors.danger} />
            <Muted style={styles.stateText}>{loadError}</Muted>
            <View style={styles.stateAction}>
              <Button label={t('vendor.retry')} onPress={() => void load(vendorId)} />
            </View>
          </Card>
        ) : (
          <>
            <H2 style={styles.sectionHeading}>{t('vendor.waitingTitle')}</H2>
            {pending.length === 0 ? (
              <Card style={styles.stateCard}>
                <Feather name="check-circle" size={22} color={colors.textSubtle} />
                <Muted style={styles.stateText}>{t('vendor.waitingEmpty')}</Muted>
              </Card>
            ) : (
              pending.map((booking) => {
                const busy = busyId === booking.id;
                const when = booking.startsAt
                  ? `${istDayLabel(istDayKey(booking.startsAt), locale)} · ${istClock(booking.startsAt, locale)}`
                  : t('vendor.timeUnknown');
                const fee = rupeesFromPaise(booking.amountPaise);
                return (
                  <Card key={booking.id} style={styles.pendingCard}>
                    <Text style={styles.pendingWhen}>{when}</Text>
                    <Text style={styles.pendingWho}>
                      {booking.elderName || t('vendor.customerFallback')}
                    </Text>
                    <Text style={styles.pendingFee}>
                      {fee ? t('vendor.feeLine', { fee }) : t('vendor.feeUnknown')}
                    </Text>
                    <View style={styles.pendingActions}>
                      <Button
                        label={t('vendor.accept')}
                        loading={busy}
                        onPress={() => void decide(booking, 'accept')}
                      />
                      <Button
                        label={t('vendor.decline')}
                        variant="secondary"
                        disabled={busy}
                        onPress={() => void decide(booking, 'decline')}
                      />
                    </View>
                  </Card>
                );
              })
            )}

            <H2 style={styles.sectionHeading}>{t('vendor.addTitle')}</H2>
            <Card style={styles.addCard}>
              <View style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('vendor.dateLabel')}</Text>
                  <TextInput
                    value={newDate}
                    onChangeText={setNewDate}
                    placeholder="2026-08-09"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('vendor.timeLabel')}</Text>
                  <TextInput
                    value={newTime}
                    onChangeText={setNewTime}
                    placeholder="10:00"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.input}
                  />
                </View>
              </View>
              <View style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('vendor.durationLabel')}</Text>
                  <TextInput
                    value={newDuration}
                    onChangeText={setNewDuration}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('vendor.seatsLabel')}</Text>
                  <TextInput
                    value={newCapacity}
                    onChangeText={setNewCapacity}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('vendor.priceLabel')}</Text>
                  <TextInput
                    value={newPrice}
                    onChangeText={setNewPrice}
                    keyboardType="number-pad"
                    placeholder={t('vendor.pricePlaceholder')}
                    placeholderTextColor={colors.textSubtle}
                    style={styles.input}
                  />
                </View>
              </View>
              <Button label={t('vendor.addButton')} loading={adding} onPress={() => void addSlot()} />
            </Card>

            <H2 style={styles.sectionHeading}>{t('vendor.weekTitle')}</H2>
            {byDay.length === 0 ? (
              <Card style={styles.stateCard}>
                <Feather name="calendar" size={22} color={colors.textSubtle} />
                <Muted style={styles.stateText}>{t('vendor.weekEmpty')}</Muted>
              </Card>
            ) : (
              byDay.map(([dayKey, daySlots]) => (
                <View key={dayKey} style={styles.dayGroup}>
                  <Text style={styles.dayHeading}>{istDayLabel(dayKey, locale)}</Text>
                  {daySlots.map((slot) => {
                    const busy = busyId === slot.id;
                    const open = editingId === slot.id;
                    const fee = rupeesFromPaise(slot.pricePaise);
                    return (
                      <Card key={slot.id} style={styles.slotCard}>
                        <View style={styles.slotTop}>
                          <Text style={styles.slotTime}>{istClock(slot.startsAt, locale)}</Text>
                          <Text style={styles.slotMeta}>
                            {t('vendor.seatsLine', { booked: slot.booked, capacity: slot.capacity })}
                          </Text>
                          <Text style={styles.slotMeta}>{fee ?? t('vendor.priceFromListing')}</Text>
                        </View>
                        {open ? (
                          <View style={styles.slotEditor}>
                            <View style={styles.stepper}>
                              <Button
                                label="−"
                                variant="secondary"
                                // The floor is the seats already sold: Postgres
                                // refuses anything lower and the button should
                                // not offer a move that can only 409.
                                disabled={busy || slot.capacity <= Math.max(1, slot.booked)}
                                onPress={() => void updateSlot(slot, { capacity: slot.capacity - 1 })}
                              />
                              <Text style={styles.stepperValue}>{slot.capacity}</Text>
                              <Button
                                label="+"
                                variant="secondary"
                                disabled={busy}
                                onPress={() => void updateSlot(slot, { capacity: slot.capacity + 1 })}
                              />
                            </View>
                            <Button
                              label={slot.removable ? t('vendor.remove') : t('vendor.removeBlocked')}
                              variant="secondary"
                              disabled={busy || !slot.removable}
                              onPress={() => void removeSlot(slot)}
                            />
                            <Button
                              label={t('vendor.done')}
                              variant="secondary"
                              onPress={() => setEditingId(null)}
                            />
                          </View>
                        ) : (
                          <Button
                            label={t('vendor.edit')}
                            variant="secondary"
                            disabled={busy}
                            onPress={() => setEditingId(slot.id)}
                          />
                        )}
                      </Card>
                    );
                  })}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: tk.space.md,
      paddingBottom: tk.space.xxl,
      gap: tk.space.md,
    },
    switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: tk.space.sm },
    stateCard: { alignItems: 'center', gap: tk.space.sm, paddingVertical: tk.space.xl },
    stateText: { textAlign: 'center' },
    stateAction: { alignSelf: 'stretch', marginTop: tk.space.sm },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm },
    noticeText: {
      flex: 1,
      color: colors.danger,
      fontFamily: family.medium,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.45,
    },
    sectionHeading: { marginTop: tk.space.sm },
    pendingCard: { gap: tk.space.xs },
    pendingWhen: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.md },
    pendingWho: { color: colors.textMuted, fontFamily: family.medium, fontSize: tk.font.sm },
    pendingFee: { color: colors.textMuted, fontFamily: family.regular, fontSize: tk.font.sm },
    pendingActions: { gap: tk.space.sm, marginTop: tk.space.sm },
    addCard: { gap: tk.space.sm },
    fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tk.space.sm },
    field: { flexGrow: 1, flexBasis: 120, gap: 4 },
    fieldLabel: { color: colors.textMuted, fontFamily: family.medium, fontSize: tk.font.xs },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: tk.space.sm,
      paddingVertical: tk.space.sm,
      color: colors.text,
      fontFamily: family.regular,
      fontSize: tk.font.md,
      backgroundColor: colors.cardSolid,
    },
    dayGroup: { gap: tk.space.sm },
    dayHeading: { color: colors.textMuted, fontFamily: family.semibold, fontSize: tk.font.sm },
    slotCard: { gap: tk.space.sm },
    slotTop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tk.space.sm,
    },
    slotTime: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.md },
    slotMeta: { color: colors.textMuted, fontFamily: family.medium, fontSize: tk.font.sm },
    slotEditor: { gap: tk.space.sm },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: tk.space.md },
    stepperValue: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.lg },
  });
}
