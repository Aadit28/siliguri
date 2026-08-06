import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Body, Button, Card, H1, H2, Muted, Sheet, dateLocale } from '../../src/components/ui';
import { AppColors, family, radius, Tokens } from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { markLoginIntent } from '../../src/lib/authNavigation';
import { fetchService } from '../../src/lib/api';
import { isDemoToken } from '../../src/lib/demoFamily';
import { Service } from '../../src/lib/types';
import {
  Booking,
  BookingSlot,
  cancelBooking,
  confirmBooking,
  dayISOToDate,
  friendlyBookingError,
  groupSlotsByDay,
  holdBookingSlot,
  isBookableVendorId,
  istTimeLabel,
  istTodayISO,
  newIdempotencyKey,
  nextDaysRange,
  rupeesFromPaise,
  searchBookingSlots,
} from '../../src/lib/bookings';
import { istDateISO, shiftISO } from '../../src/lib/istDates';

const DAYS_AHEAD = 7;

// One booking attempt. The key is minted with the attempt and never again:
// every retry of the hold, and the confirm that follows it, reuse this one.
type Attempt = { slot: BookingSlot; idempotencyKey: string };

function dayHeading(dayISO: string, locale: string, t: (key: string) => string) {
  const today = istTodayISO();
  if (dayISO === today) return t('booking.today');
  if (dayISO === shiftISO(today, 1)) return t('booking.tomorrow');
  return dayISOToDate(dayISO).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export default function BookingSlotsScreen() {
  const params = useLocalSearchParams<{ vendorId: string | string[] }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const { lang } = useLocale();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const token = session?.access_token ?? null;
  const bookable = isBookableVendorId(vendorId);
  const demo = token ? isDemoToken(token) : false;

  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [hold, setHold] = useState<Booking | null>(null);
  const [receipt, setReceipt] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    if (!token || !bookable || !vendorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const range = nextDaysRange(DAYS_AHEAD);
    try {
      const found = await searchBookingSlots(token, { vendorId, ...range });
      setSlots(found);
    } catch (error) {
      setSlots([]);
      setLoadError(friendlyBookingError(error, t, 'search'));
    } finally {
      setLoading(false);
    }
  }, [bookable, t, token, vendorId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  // The name for the header and the readback. Slot rows carry their vendor, but
  // a shop with no open times has none, and the elder still has to see where
  // they landed.
  useEffect(() => {
    let active = true;
    if (!vendorId) return undefined;
    fetchService(vendorId).then((found) => {
      if (active) setService(found);
    });
    return () => {
      active = false;
    };
  }, [vendorId]);

  const vendorName = slots[0]?.vendor?.name ?? service?.name ?? t('booking.unknownVendor');
  const days = useMemo(() => groupSlotsByDay(slots), [slots]);
  const locale = dateLocale(lang);

  // Runs the hold for the attempt already in state, so the retry button and the
  // first tap send the identical key.
  const runHold = useCallback(
    async (next: Attempt) => {
      if (!token) return;
      setBusy(true);
      setActionError(null);
      try {
        const held = await holdBookingSlot(token, {
          slotId: next.slot.id,
          idempotencyKey: next.idempotencyKey,
        });
        setHold(held);
      } catch (error) {
        setHold(null);
        setActionError(friendlyBookingError(error, t, 'hold'));
      } finally {
        setBusy(false);
      }
    },
    [t, token],
  );

  function pickSlot(slot: BookingSlot) {
    const next: Attempt = { slot, idempotencyKey: newIdempotencyKey() };
    setAttempt(next);
    setHold(null);
    setReceipt(null);
    setActionError(null);
    void runHold(next);
  }

  async function confirmHold() {
    if (!token || !attempt || !hold) return;
    setBusy(true);
    setActionError(null);
    try {
      const booked = await confirmBooking(token, {
        holdId: hold.id,
        idempotencyKey: attempt.idempotencyKey,
      });
      setReceipt(booked);
      // The seat is gone now; the list behind the sheet must not still offer it.
      void loadSlots();
    } catch (error) {
      setActionError(friendlyBookingError(error, t, 'confirm'));
    } finally {
      setBusy(false);
    }
  }

  function closeSheet() {
    setAttempt(null);
    setHold(null);
    setReceipt(null);
    setActionError(null);
    setBusy(false);
  }

  // Backing out of the readback hands the seat straight back instead of leaving
  // it parked for five minutes where nobody else can take it.
  async function releaseHold() {
    const heldId = hold?.id ?? null;
    const heldToken = token;
    closeSheet();
    if (!heldId || !heldToken) return;
    try {
      await cancelBooking(heldToken, heldId);
    } catch {
      // The sweeper releases an abandoned hold anyway; nothing to tell the user.
    }
    void loadSlots();
  }

  const screenTitle = t('booking.title');

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: screenTitle }} />
        <ActivityIndicator color={colors.textMuted} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: screenTitle }} />
        <Card style={styles.stateCard}>
          <Feather name="lock" size={26} color={colors.textSubtle} />
          <H2 style={styles.stateTitle}>{t('booking.signInTitle')}</H2>
          <Muted style={styles.stateText}>{t('booking.signInBody')}</Muted>
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
      <Stack.Screen options={{ title: screenTitle }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Muted style={styles.kicker}>{t('booking.title')}</Muted>
          <H1 style={styles.vendorName}>{vendorName}</H1>
          {service?.address ? <Muted style={styles.address}>{service.address}</Muted> : null}
          <Muted style={styles.rangeNote}>{t('booking.next7Days')}</Muted>
        </View>

        {demo ? (
          <Card style={styles.stateCard}>
            <Feather name="info" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.demoNotice')}</Muted>
          </Card>
        ) : !bookable ? (
          <Card style={styles.stateCard}>
            <Feather name="phone" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.notBookable')}</Muted>
          </Card>
        ) : loading ? (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={colors.textMuted} />
            <Muted style={styles.stateText}>{t('booking.loading')}</Muted>
          </Card>
        ) : loadError ? (
          <Card style={styles.stateCard}>
            <Feather name="alert-circle" size={22} color={colors.danger} />
            <Muted style={styles.stateText}>{loadError}</Muted>
            <View style={styles.stateAction}>
              <Button label={t('booking.retry')} onPress={() => void loadSlots()} />
            </View>
          </Card>
        ) : days.length === 0 ? (
          <Card style={styles.stateCard}>
            <Feather name="calendar" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.noSlots')}</Muted>
            <View style={styles.stateAction}>
              <Button label={t('booking.noSlotsRetry')} variant="secondary" onPress={() => void loadSlots()} />
            </View>
          </Card>
        ) : (
          <>
            <H2 style={styles.pickTitle}>{t('booking.pickTime')}</H2>
            {days.map((day) => (
              <View key={day.dayISO} style={styles.daySection}>
                <Text style={styles.dayHeading}>{dayHeading(day.dayISO, locale, t)}</Text>
                {day.slots.map((slot) => {
                  const full = slot.spotsRemaining <= 0;
                  return (
                    <Pressable
                      key={slot.id}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: full }}
                      accessibilityLabel={`${istTimeLabel(slot.startsAt)} — ${
                        full
                          ? t('booking.full')
                          : t('booking.spotsLeft', { count: slot.spotsRemaining })
                      }`}
                      disabled={full || busy}
                      onPress={() => pickSlot(slot)}
                      style={({ pressed }) => [
                        styles.slotRow,
                        { backgroundColor: colors.bgAlt, borderColor: colors.border },
                        full && styles.slotRowFull,
                        pressed && !full ? { backgroundColor: colors.surfaceTint } : null,
                      ]}
                    >
                      <View style={styles.slotCopy}>
                        <Text style={styles.slotTime}>{istTimeLabel(slot.startsAt)}</Text>
                        <Muted style={styles.slotMeta}>
                          {t('booking.minutes', { count: slot.durationMin })}
                          {' · '}
                          {full ? t('booking.full') : t('booking.spotsLeft', { count: slot.spotsRemaining })}
                        </Muted>
                      </View>
                      {full ? null : <Feather name="chevron-right" size={22} color={colors.textSubtle} />}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={attempt !== null}
        onClose={hold && !receipt ? () => void releaseHold() : closeSheet}
        title={receipt ? t('booking.receiptTitle') : t('booking.checkTitle')}
      >
        {attempt ? (
          <View style={styles.sheetBody}>
            {receipt ? (
              <>
                <View style={[styles.receiptIcon, { backgroundColor: colors.successSoft }]}>
                  <Feather name="check" size={26} color={colors.success} />
                </View>
                <Body style={styles.receiptText}>{receiptCopy(receipt, t)}</Body>
                <ReadbackRows
                  vendorName={vendorName}
                  slot={attempt.slot}
                  amountPaise={receipt.amountPaise}
                  locale={locale}
                  styles={styles}
                  t={t}
                />
                <View style={styles.sheetActions}>
                  <Button
                    label={t('booking.seeMyBookings')}
                    onPress={() => {
                      closeSheet();
                      router.push('/booking');
                    }}
                  />
                  <Button label={t('booking.close')} variant="secondary" onPress={closeSheet} />
                </View>
              </>
            ) : hold ? (
              <>
                <ReadbackRows
                  vendorName={vendorName}
                  slot={attempt.slot}
                  amountPaise={hold.amountPaise}
                  locale={locale}
                  styles={styles}
                  t={t}
                />
                <Muted style={styles.holdNote}>{t('booking.holdNote')}</Muted>
                {actionError ? <Notice message={actionError} /> : null}
                <View style={styles.sheetActions}>
                  <Button label={t('booking.confirm')} loading={busy} onPress={() => void confirmHold()} />
                  <Button
                    label={t('booking.cancel')}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void releaseHold()}
                  />
                </View>
              </>
            ) : actionError ? (
              <>
                <Notice message={actionError} />
                <View style={styles.sheetActions}>
                  {/* Same attempt, same key: a dropped response may already have
                      taken the seat, and a fresh key would take a second one. */}
                  <Button label={t('booking.retry')} loading={busy} onPress={() => void runHold(attempt)} />
                  <Button label={t('booking.close')} variant="secondary" disabled={busy} onPress={closeSheet} />
                </View>
              </>
            ) : (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={colors.textMuted} />
                <Muted style={styles.stateText}>{t('booking.holding')}</Muted>
              </View>
            )}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function receiptCopy(booking: Booking, t: (key: string) => string) {
  if (booking.status === 'pending_guardian') return t('booking.statusPendingGuardianBody');
  if (booking.status === 'pending_vendor') return t('booking.statusPendingVendorBody');
  if (booking.status === 'confirmed') return t('booking.statusConfirmedBody');
  return t(`booking.status.${booking.status}`);
}

function ReadbackRows({
  vendorName,
  slot,
  amountPaise,
  locale,
  styles,
  t,
}: {
  vendorName: string;
  slot: BookingSlot;
  amountPaise: number | null;
  locale: string;
  styles: ReturnType<typeof makeStyles>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  // The elder's calendar day, not UTC's: a 7:00 PM IST slot is stamped on the
  // previous UTC date, and the readback must not name yesterday.
  const dayISO = istDateISO(slot.startsAt);
  const rows = [
    { label: t('booking.vendorLabel'), value: vendorName },
    { label: t('booking.dateLabel'), value: dayISO ? dayHeading(dayISO, locale, t) : '—' },
    { label: t('booking.timeLabel'), value: istTimeLabel(slot.startsAt) },
    // amount_paise is null until a vendor quotes the job, and an invented number
    // on a readback is worse than saying the shop will tell them.
    { label: t('booking.feeLabel'), value: rupeesFromPaise(amountPaise) ?? t('booking.feeUnknown') },
  ];
  return (
    <View style={styles.readback}>
      {rows.map((row) => (
        <View key={row.label} style={styles.readbackRow}>
          <Text style={styles.readbackLabel}>{row.label}</Text>
          <Text style={styles.readbackValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Notice({ message }: { message: string }) {
  const { colors } = useTheme();
  const tk = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm }}>
      <Feather name="alert-circle" size={18} color={colors.danger} />
      <Text
        style={{
          flex: 1,
          color: colors.danger,
          fontFamily: family.medium,
          fontSize: tk.font.sm,
          lineHeight: tk.font.sm * 1.45,
        }}
      >
        {message}
      </Text>
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
      gap: tk.space.lg,
    },
    header: { gap: tk.space.xs },
    kicker: { fontFamily: family.regular, fontSize: tk.font.sm },
    vendorName: { fontSize: 32, lineHeight: 38 },
    address: { fontSize: tk.font.sm },
    rangeNote: { fontFamily: family.medium, fontSize: tk.font.sm, marginTop: tk.space.xs },
    pickTitle: { marginBottom: -tk.space.xs },
    daySection: { gap: tk.space.sm },
    dayHeading: {
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
    },
    slotRow: {
      minHeight: Math.max(tk.TAP, tk.ROW_MIN_HEIGHT),
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.md,
      paddingVertical: tk.space.sm,
    },
    slotRowFull: { opacity: 0.5 },
    slotCopy: { flex: 1, minWidth: 0, gap: 2 },
    slotTime: {
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: tk.font.lg,
      lineHeight: tk.font.lg * 1.2,
    },
    slotMeta: { fontSize: tk.font.sm },
    stateCard: { alignItems: 'center', gap: tk.space.sm, paddingVertical: tk.space.xl },
    stateTitle: { textAlign: 'center' },
    stateText: { textAlign: 'center' },
    stateAction: { alignSelf: 'stretch', marginTop: tk.space.sm },
    sheetBody: { gap: tk.space.md },
    sheetLoading: { alignItems: 'center', gap: tk.space.sm, paddingVertical: tk.space.lg },
    sheetActions: { gap: tk.space.sm, marginTop: tk.space.xs },
    readback: { gap: tk.space.sm },
    readbackRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: tk.space.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: tk.space.sm,
    },
    readbackLabel: { color: colors.textMuted, fontFamily: family.medium, fontSize: tk.font.sm },
    readbackValue: {
      flex: 1,
      textAlign: 'right',
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
    },
    holdNote: { fontSize: tk.font.sm },
    receiptIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    receiptText: { textAlign: 'center', fontFamily: family.semibold },
  });
}
