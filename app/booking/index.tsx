import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Dialog, H1, Muted, dateLocale } from '../../src/components/ui';
import { AppColors, family, radius, Tokens } from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { useAuth } from '../../src/context/AuthContext';
import { useCity } from '../../src/context/CityContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { markLoginIntent } from '../../src/lib/authNavigation';
import { fetchServices } from '../../src/lib/api';
import { isDemoToken } from '../../src/lib/demoFamily';
import {
  Booking,
  BookingStatus,
  canCancelBooking,
  cancelBooking,
  friendlyBookingError,
  listMyBookings,
  rupeesFromPaise,
} from '../../src/lib/bookings';

// Waiting states carry the warning tint, settled ones success, dead ones the
// quiet surface. Nothing here is red: a shop that never answered is not the
// family's mistake.
function statusTone(status: BookingStatus, colors: AppColors) {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return { bg: colors.successSoft, fg: colors.success };
    case 'held':
    case 'pending_guardian':
    case 'pending_vendor':
      return { bg: colors.warningBg, fg: colors.warningText };
    default:
      return { bg: colors.surfaceTint, fg: colors.textMuted };
  }
}

export default function MyBookingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { city } = useCity();
  const { lang } = useLocale();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const token = session?.access_token ?? null;
  const demo = token ? isDemoToken(token) : false;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || isDemoToken(token)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setBookings(await listMyBookings(token));
    } catch (error) {
      setBookings([]);
      setLoadError(friendlyBookingError(error, t, 'list'));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // /api/bookings/mine cannot join the vendor (bookings.vendor_id carries no
  // foreign key), so the names come from the city directory the app already
  // loads everywhere else. A miss just falls back to a generic label.
  useEffect(() => {
    let active = true;
    fetchServices(city)
      .then((services) => {
        if (!active) return;
        const names: Record<string, string> = {};
        for (const service of services) names[service.id] = service.name;
        setVendorNames(names);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [city]);

  async function confirmCancel() {
    const target = cancelTarget;
    setCancelTarget(null);
    if (!target || !token) return;
    setBusyId(target.id);
    setActionError(null);
    try {
      const updated = await cancelBooking(token, target.id);
      setBookings((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (error) {
      setActionError(friendlyBookingError(error, t, 'cancel'));
      // The row's real state is whatever the server holds now, not what the
      // screen assumed — re-read rather than guess.
      void load();
    } finally {
      setBusyId(null);
    }
  }

  const locale = dateLocale(lang);
  const title = t('booking.myTitle');

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
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <H1>{title}</H1>
        <Muted>{t('booking.myBody')}</Muted>

        {actionError ? (
          <View style={styles.notice}>
            <Feather name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.noticeText}>{actionError}</Text>
          </View>
        ) : null}

        {demo ? (
          <Card style={styles.stateCard}>
            <Feather name="info" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.demoNotice')}</Muted>
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
              <Button label={t('booking.retry')} onPress={() => void load()} />
            </View>
          </Card>
        ) : bookings.length === 0 ? (
          <Card style={styles.stateCard}>
            <Feather name="calendar" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.emptyMine')}</Muted>
            <View style={styles.stateAction}>
              <Button
                label={t('booking.browseServices')}
                variant="secondary"
                onPress={() => router.push('/services')}
              />
            </View>
          </Card>
        ) : (
          bookings.map((booking) => {
            const tone = statusTone(booking.status, colors);
            const name =
              (booking.vendorId ? vendorNames[booking.vendorId] : null) ?? t('booking.unknownVendor');
            const fee = rupeesFromPaise(booking.amountPaise);
            const asked = booking.createdAt
              ? new Date(booking.createdAt).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : null;
            return (
              <Card key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingTop}>
                  <Text style={styles.bookingName} numberOfLines={2}>
                    {name}
                  </Text>
                  <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.pillText, { color: tone.fg }]}>
                      {t(`booking.status.${booking.status}`)}
                    </Text>
                  </View>
                </View>
                {asked ? <Muted style={styles.bookingMeta}>{t('booking.requestedOn', { date: asked })}</Muted> : null}
                {fee ? (
                  <Muted style={styles.bookingMeta}>
                    {t('booking.feeLabel')}: {fee}
                  </Muted>
                ) : null}
                {canCancelBooking(booking.status) ? (
                  <Button
                    label={t('booking.cancelBooking')}
                    variant="secondary"
                    loading={busyId === booking.id}
                    onPress={() => setCancelTarget(booking)}
                  />
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>

      <Dialog
        visible={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={t('booking.cancelConfirmTitle')}
      >
        <Muted style={styles.dialogBody}>{t('booking.cancelConfirmBody')}</Muted>
        <View style={styles.dialogActions}>
          <Button label={t('booking.cancelConfirmYes')} variant="danger" onPress={() => void confirmCancel()} />
          <Button label={t('booking.cancelConfirmNo')} variant="secondary" onPress={() => setCancelTarget(null)} />
        </View>
      </Dialog>
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
    bookingCard: { gap: tk.space.sm },
    bookingTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: tk.space.sm,
    },
    bookingName: {
      flex: 1,
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
    },
    pill: {
      paddingHorizontal: tk.space.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
      flexShrink: 0,
      maxWidth: '55%',
    },
    pillText: { fontFamily: family.semibold, fontSize: tk.font.xs },
    bookingMeta: { fontSize: tk.font.sm },
    dialogBody: { fontSize: tk.font.md, lineHeight: tk.font.md * 1.5 },
    dialogActions: { marginTop: tk.space.lg, gap: tk.space.sm },
  });
}
