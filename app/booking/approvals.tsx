import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Card, H1, Muted, dateLocale } from '../../src/components/ui';
import { AppColors, family, radius, Tokens } from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { useAuth } from '../../src/context/AuthContext';
import { useCity } from '../../src/context/CityContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { markLoginIntent } from '../../src/lib/authNavigation';
import { fetchServices } from '../../src/lib/api';
import { listFamilyLinks } from '../../src/lib/family';
import { isDemoToken } from '../../src/lib/demoFamily';
import {
  Booking,
  answerBookingApproval,
  friendlyBookingError,
  listMyBookings,
  rupeesFromPaise,
} from '../../src/lib/bookings';

// A booking parked on the guardian, carrying the parent it belongs to. The
// mine endpoint is per-family, so the parent's name comes from the link that
// produced the request rather than from the booking row.
type PendingApproval = { booking: Booking; parentName: string };

export default function BookingApprovalsScreen() {
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

  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [isGuardian, setIsGuardian] = useState(true);
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      // The same role check the rest of the guardian area uses: an active
      // family_link is what makes someone a guardian, and only a guardian may
      // answer /api/bookings/approve.
      const { asGuardian } = await listFamilyLinks(token);
      const parents = asGuardian.filter((link) => link.status === 'active' && link.parentId);
      setIsGuardian(parents.length > 0);

      const perParent = await Promise.all(
        parents.map(async (link) => {
          const parentId = link.parentId as string;
          const name = link.parentName || link.parentPhone || t('booking.parentFallback');
          const bookings = await listMyBookings(token, parentId);
          return bookings
            .filter((booking) => booking.status === 'pending_guardian')
            .map((booking) => ({ booking, parentName: name }));
        }),
      );
      setPending(perParent.flat());
    } catch (error) {
      setPending([]);
      setLoadError(friendlyBookingError(error, t, 'list'));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function answer(booking: Booking, approve: boolean) {
    if (!token) return;
    setBusyId(booking.id);
    setActionError(null);
    try {
      // A strict boolean, never a string: "false" is truthy on the server and
      // would send a declined booking to the shop.
      await answerBookingApproval(token, { bookingId: booking.id, approve });
      setPending((current) => current.filter((row) => row.booking.id !== booking.id));
    } catch (error) {
      setActionError(friendlyBookingError(error, t, 'approve'));
      // Another guardian may have answered first; the list on screen is stale.
      void load();
    } finally {
      setBusyId(null);
    }
  }

  const locale = dateLocale(lang);
  const title = t('booking.approvalsTitle');

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
        <Muted>{t('booking.approvalsBody')}</Muted>

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
        ) : !isGuardian ? (
          <Card style={styles.stateCard}>
            <Feather name="users" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.approvalsNotGuardian')}</Muted>
            <View style={styles.stateAction}>
              <Button
                label={t('family.title')}
                variant="secondary"
                onPress={() => router.push('/guardian')}
              />
            </View>
          </Card>
        ) : pending.length === 0 ? (
          <Card style={styles.stateCard}>
            <Feather name="check-circle" size={22} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('booking.approvalsEmpty')}</Muted>
          </Card>
        ) : (
          pending.map(({ booking, parentName }) => {
            const vendor =
              (booking.vendorId ? vendorNames[booking.vendorId] : null) ?? t('booking.unknownVendor');
            const fee = rupeesFromPaise(booking.amountPaise);
            const asked = booking.createdAt
              ? new Date(booking.createdAt).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : null;
            const busy = busyId === booking.id;
            return (
              <Card key={booking.id} style={styles.approvalCard}>
                <View style={styles.approvalTop}>
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceTint }]}>
                    <Feather name="user" size={20} color={colors.text} />
                  </View>
                  <View style={styles.approvalCopy}>
                    <Text style={styles.parentLine}>{t('booking.forParent', { name: parentName })}</Text>
                    <Text style={styles.vendorLine} numberOfLines={2}>
                      {vendor}
                    </Text>
                  </View>
                </View>
                <View style={styles.readback}>
                  <View style={styles.readbackRow}>
                    <Text style={styles.readbackLabel}>{t('booking.feeLabel')}</Text>
                    <Text style={styles.readbackValue}>{fee ?? t('booking.feeUnknown')}</Text>
                  </View>
                  {asked ? (
                    <View style={styles.readbackRow}>
                      <Text style={styles.readbackLabel}>{t('booking.askedLabel')}</Text>
                      <Text style={styles.readbackValue}>{asked}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.approvalActions}>
                  <Button label={t('booking.approve')} loading={busy} onPress={() => void answer(booking, true)} />
                  <Button
                    label={t('booking.decline')}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void answer(booking, false)}
                  />
                </View>
              </Card>
            );
          })
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
    approvalCard: { gap: tk.space.md },
    approvalTop: { flexDirection: 'row', alignItems: 'center', gap: tk.space.md },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    approvalCopy: { flex: 1, minWidth: 0, gap: 2 },
    parentLine: { color: colors.textMuted, fontFamily: family.medium, fontSize: tk.font.sm },
    vendorLine: {
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: tk.font.lg,
      lineHeight: tk.font.lg * 1.25,
    },
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
    approvalActions: { gap: tk.space.sm },
  });
}
