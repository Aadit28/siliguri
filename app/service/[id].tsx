import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import {
  Body,
  Button,
  Card,
  DialFallbackDialog,
  H1,
  H2,
  Muted,
  Badge,
  Stars,
  dateLocale,
  useDialer,
} from '../../src/components/ui';
import { AppColors, family, radius, Tokens } from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { fetchService, toggleFavorite as toggleFavoriteRemote } from '../../src/lib/api';
import { isBookableVendorId } from '../../src/lib/bookings';
import { Service } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { useAuth } from '../../src/context/AuthContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { canUseWhatsApp, openWhatsAppChat } from '../../src/lib/whatsapp';
import OrderSheet from '../../src/components/OrderSheet';
import { mapsDirectionsUrl, mapsSearchUrl, openMapsUrl } from '../../src/lib/maps';

// Dates must follow the in-app language toggle, not the device locale — a phone
// set to English would otherwise print English dates inside a Hindi screen.
function formatTrustDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ServiceDetail() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { favoriteSet, toggleFavorite, recordViewed } = useServicePreferences();
  const { user } = useAuth();
  const { lang } = useLocale();
  const { dial, failedNumber, clearFailedNumber } = useDialer();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const isWide = isComputerMode && width >= 920;
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, isWide, tk), [colors, isWide, tk]);

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrustDetails, setShowTrustDetails] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const isFav = id ? favoriteSet.has(id) : false;

  // localStorage is the offline source of truth; when signed in, mirror the
  // toggle to Supabase so the Home "saved" stat matches, reverting on failure.
  function handleToggleFavorite(serviceId: string) {
    const wasFav = favoriteSet.has(serviceId);
    toggleFavorite(serviceId);
    if (user) {
      toggleFavoriteRemote(serviceId, user.id, wasFav).catch((error) => {
        console.warn('[Saathi] favorite sync failed:', (error as Error).message);
        toggleFavorite(serviceId);
      });
    }
  }

  function leaveDetail() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/services');
    }
  }

  useEffect(() => {
    let active = true;
    setService(null);
    setLoading(true);

    if (!id) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    fetchService(id).then((nextService) => {
      if (!active) return;
      setService(nextService);
      setLoading(false);
      if (nextService) recordViewed(nextService.id);
    });

    return () => {
      active = false;
    };
  }, [id, recordViewed]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <Muted>{t('common.noResults')}</Muted>
      </View>
    );
  }

  const verificationStatus = service.verification_status ?? (service.verified ? 'source_linked' : 'unverified');
  const claimStatus = service.claim_status ?? 'unclaimed';
  const verifiedAt = formatTrustDate(service.verified_at, dateLocale(lang));
  const showWhatsApp = canUseWhatsApp(service.phone);
  const directionsUrl = mapsDirectionsUrl(service);
  const mapUrl = mapsSearchUrl(service);
  const hasPhone = Boolean(service.phone);
  const phoneConfirmed = Boolean(service.phone_confirmed);

  // One elder-readable trust tier, derived from the same backend fields the old
  // 6-row checklist exposed. source_url (source_linked) implies a legitimate
  // public listing, so it is NOT treated as "unverified" — only the tier with
  // neither team verification nor a source triggers the top warning.
  const isSourceLinked = Boolean(service.source_url) || verificationStatus === 'source_linked';
  const trustTier: 'verified' | 'source' | 'unverified' = service.verified
    ? 'verified'
    : isSourceLinked
      ? 'source'
      : 'unverified';

  const trustSummary =
    trustTier === 'verified'
      ? t('services.trustSummaryVerified')
      : trustTier === 'source'
        ? t('services.trustSummarySource')
        : t('services.trustSummaryUnverified');

  const HELPLINE_SHORT = '14567';

  // Kept behind a "Details" disclosure for anyone who wants the granular signals.
  const trustDetails = [
    {
      label: t('services.verificationStatusLabel'),
      value: t(`services.verificationStatus.${verificationStatus}`),
    },
    {
      label: t('services.lastVerified'),
      value: verifiedAt ?? t('services.notReverified'),
    },
    {
      label: t('services.claimStatusLabel'),
      value: t(`services.claimStatus.${claimStatus}`),
    },
    ...(service.verified_by
      ? [{ label: t('services.verifiedBy'), value: service.verified_by }]
      : []),
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: t(`categories.${service.category}`),
          headerStyle: { backgroundColor: colors.nav },
          headerTitleStyle: { color: colors.text, fontFamily: family.bold },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              style={styles.headerBack}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={leaveDetail}
            >
              <Feather name="arrow-left" size={20} color={colors.text} />
              <Text style={styles.headerBackText}>{t('common.back')}</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {trustTier === 'unverified' ? (
          <View style={[styles.warningBanner, { backgroundColor: colors.warningBg, borderColor: colors.warningText }]}>
            <Feather name="alert-triangle" size={22} color={colors.warningText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningTitle, { color: colors.warningText }]}>{t('services.unverified')}</Text>
              <Text style={[styles.warningBody, { color: colors.warningText }]}>
                {t('services.trustCallIfUnsure', { helpline: HELPLINE_SHORT })}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.hero, { backgroundColor: colors.cardStrong, borderColor: colors.border }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <ServiceGlyph category={service.category} color={colors.text} size={34} />
            </View>
            <View style={styles.heroText}>
              <Muted style={styles.kicker}>{t(`categories.${service.category}`)}</Muted>
              <H1 style={styles.title}>{service.name}</H1>
              <View style={styles.metaRow}>
                <Stars rating={service.rating} />
                {service.verified && <Badge label={t('common.verified')} />}
              </View>
            </View>
          </View>
          <View style={styles.heroSignalRow}>
            <Text style={[styles.heroSignal, { color: colors.textMuted, borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
              {t(`services.verificationStatus.${verificationStatus}`)}
            </Text>
            {service.phone_confirmed ? (
              <Text style={[styles.heroSignal, { color: colors.textMuted, borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
                {t('services.trustPhone')}
              </Text>
            ) : null}
            {service.source_url ? (
              <Text style={[styles.heroSignal, { color: colors.textMuted, borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
                {t('services.trustSource')}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.detailGrid}>
          <Card style={styles.aboutCard}>
            <H2>{t('services.about')}</H2>
            {service.description ? <Body>{service.description}</Body> : null}
            {service.address ? <Muted style={styles.detailLine}>{service.address}</Muted> : null}
            {service.hours ? (
              <Muted style={styles.detailLine}>
                {t('services.hours')}: {service.hours}
              </Muted>
            ) : null}
            {service.service_area ? (
              <Muted style={styles.detailLine}>
                {t('services.serviceArea')}: {service.service_area}
              </Muted>
            ) : null}
            {service.verified_by ? (
              <Muted style={styles.detailLine}>
                {t('services.verifiedBy')}: {service.verified_by}
              </Muted>
            ) : null}
            {service.verification_note ? (
              <Muted style={styles.detailLine}>{service.verification_note}</Muted>
            ) : null}
          </Card>

          <Card style={styles.checkCard}>
            <H2>{t('services.trustChecklist')}</H2>
            <View style={styles.trustSummaryRow}>
              <View
                style={[
                  styles.checkDot,
                  { backgroundColor: trustTier === 'verified' ? colors.successSoft : colors.warningBg },
                ]}
              >
                <Feather
                  name={trustTier === 'verified' ? 'check' : trustTier === 'source' ? 'info' : 'alert-triangle'}
                  size={18}
                  color={trustTier === 'verified' ? colors.success : colors.warningText}
                />
              </View>
              <Text style={styles.trustSummaryText}>{trustSummary}</Text>
            </View>
            {trustTier !== 'verified' ? (
              <Muted style={styles.trustHelpline}>{t('services.trustCallIfUnsure', { helpline: HELPLINE_SHORT })}</Muted>
            ) : null}

            <TouchableOpacity
              style={styles.detailsToggle}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showTrustDetails ? t('services.trustHideDetails') : t('services.trustDetails')}
              onPress={() => setShowTrustDetails((prev) => !prev)}
            >
              <Text style={styles.detailsToggleText}>
                {showTrustDetails ? t('services.trustHideDetails') : t('services.trustDetails')}
              </Text>
              <Feather name={showTrustDetails ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {showTrustDetails
              ? trustDetails.map((item) => (
                  <View key={item.label} style={styles.detailRow}>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                    <Muted style={styles.checkValue} numberOfLines={2}>
                      {item.value}
                    </Muted>
                  </View>
                ))
              : null}

            <Muted style={styles.careNote}>{t('services.careNote')}</Muted>
          </Card>
        </View>

        {!phoneConfirmed ? (
          <View style={[styles.noticeCard, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <Feather name="phone-off" size={18} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>{t('services.phoneNotConfirmedTitle')}</Text>
              <Muted style={styles.noticeBody}>{t('services.phoneNotConfirmedBody')}</Muted>
              <TouchableOpacity
                style={[styles.callbackBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('services.requestCallback')}
                onPress={() => router.push('/help')}
              >
                <Feather name="headphones" size={16} color={colors.primaryFg} />
                <Text style={[styles.callbackLabel, { color: colors.primaryFg }]}>{t('services.requestCallback')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={{ gap: tk.space.md }}>
          {/* Only a real directory row can have slots: the seeded catalogue
              entries ("m-3") would come back as a 400 nobody can act on. */}
          {isBookableVendorId(id) ? (
            <Button
              label={t('booking.bookCta')}
              icon={<Feather name="calendar" size={18} color={colors.primaryFg} />}
              onPress={() => router.push(`/booking/${id}`)}
            />
          ) : null}
          <Button
            label={isFav ? t('services.removeFavorite') : t('services.addFavorite')}
            variant="secondary"
            onPress={() => id && handleToggleFavorite(id)}
          />
          {service.source_url ? (
            <Button
              label={t('services.viewSource')}
              variant="secondary"
              onPress={() => Linking.openURL(service.source_url!).catch(() => undefined)}
            />
          ) : null}
        </View>
      </ScrollView>

      {service.phone || service.map_url ? (
        <View style={[styles.footer, { backgroundColor: colors.nav, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, tk.space.sm) }]}>
          <Muted style={styles.footerTitle}>{t('services.contactActions')}</Muted>
          <View style={styles.footerActions}>
            {hasPhone ? (
              <View style={{ flex: 1 }}>
                <Button label={t('common.call')} variant="primary" onPress={() => dial(service.phone)} />
              </View>
            ) : null}
            {showWhatsApp ? (
              <TouchableOpacity
                style={[styles.waBtn, { backgroundColor: colors.whatsapp }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="WhatsApp"
                onPress={() => openWhatsAppChat(service.phone)}
              >
                <Feather name="message-circle" size={18} color={colors.whatsappText} />
                <Text style={[styles.waText, { color: colors.whatsappText }]}>WhatsApp</Text>
              </TouchableOpacity>
            ) : null}
            {/* Not gated on map_url any more. 45 of the 149 listings carry an
                address but no curated map link, and those showed no Directions
                button at all — mapsDirectionsUrl builds one from the address. */}
            {directionsUrl ? (
              <View style={{ flex: 1 }}>
                <Button
                  label={t('common.directions')}
                  variant="primary"
                  onPress={() => void openMapsUrl(directionsUrl)}
                />
              </View>
            ) : null}
          </View>
          {mapUrl ? (
            <View style={styles.orderAction}>
              <Button
                label={t('services.viewOnMap')}
                variant="secondary"
                onPress={() => void openMapsUrl(mapUrl)}
              />
            </View>
          ) : null}
          {/* Ordering rides on the same WhatsApp number the Call and WhatsApp
              buttons above use, so it appears exactly where a shop is already
              reachable and nowhere else. */}
          {showWhatsApp ? (
            <View style={styles.orderAction}>
              <Button label={t('order.open')} variant="primary" onPress={() => setOrderOpen(true)} />
            </View>
          ) : null}
        </View>
      ) : null}

      <DialFallbackDialog number={failedNumber} onClose={clearFailedNumber} />
      <OrderSheet
        visible={orderOpen}
        onClose={() => setOrderOpen(false)}
        serviceId={service.id}
        shopName={service.name}
        phone={service.phone}
        // The signed-in account's own name. A guardian ordering for a parent is
        // not handled here yet: this screen has no elder picker, and stamping
        // the guardian's name on a parent's delivery would be worse than
        // leaving the line out, which is what an empty name does.
        forName={user?.user_metadata?.full_name || null}
      />
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean | undefined, tk: Tokens) {
  return StyleSheet.create({
    screen: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tk.space.lg },
    content: {
      width: '100%',
      maxWidth: 1120,
      alignSelf: 'center',
      padding: isWide ? tk.space.xl : tk.space.md,
      paddingBottom: 170,
      gap: tk.space.lg,
    },
    hero: {
      borderRadius: radius.xl,
      borderWidth: 1,
      padding: isWide ? tk.space.xl : tk.space.lg,
      gap: tk.space.lg,
    },
    heroTop: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: tk.space.lg,
    },
    heroIcon: {
      width: 88,
      height: 88,
      borderRadius: radius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroText: { flex: 1, minWidth: 0 },
    kicker: { fontFamily: family.regular, fontSize: tk.font.sm },
    title: { fontFamily: family.medium, marginTop: tk.space.sm, fontSize: isWide ? 40 : 32, lineHeight: isWide ? 47 : 38 },
    heroSignalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    heroSignal: {
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: tk.space.sm,
      paddingVertical: 8,
      fontFamily: family.semibold,
      fontSize: tk.font.sm,
      overflow: 'hidden',
    },
    headerBack: {
      minHeight: 44,
      minWidth: 90,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: tk.space.sm,
      justifyContent: 'flex-start',
    },
    headerBackText: { color: colors.text, fontSize: tk.font.md, fontFamily: family.semibold },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: tk.space.sm, marginTop: tk.space.sm },
    detailGrid: { flexDirection: isWide ? 'row' : 'column', gap: tk.space.lg },
    aboutCard: { flex: 1, gap: tk.space.sm },
    detailLine: { fontFamily: family.regular, fontSize: tk.font.sm },
    checkCard: { flex: 1, gap: tk.space.sm },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.sm,
      paddingVertical: 4,
    },
    checkDot: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkLabel: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.sm },
    // Verification status / last-verified date is the trust evidence a user
    // reads before calling a stranger — body content, not a caption.
    checkValue: { fontFamily: family.regular, fontSize: tk.font.sm, lineHeight: tk.font.sm * 1.35 },
    trustSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: tk.space.sm },
    trustSummaryText: {
      flex: 1,
      color: colors.text,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
    },
    trustHelpline: { fontFamily: family.regular, fontSize: tk.font.sm, marginTop: 2 },
    detailsToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      minHeight: 44,
    },
    detailsToggleText: { color: colors.textMuted, fontFamily: family.semibold, fontSize: tk.font.sm },
    detailRow: { paddingVertical: 4, gap: 2 },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tk.space.sm,
      borderWidth: 1,
      borderLeftWidth: 5,
      borderRadius: radius.md,
      padding: tk.space.md,
    },
    warningTitle: { fontFamily: family.semibold, fontSize: tk.font.md, lineHeight: tk.font.md * 1.3 },
    warningBody: { fontFamily: family.regular, fontSize: tk.font.sm, marginTop: 2, lineHeight: tk.font.sm * 1.35 },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tk.space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: tk.space.md,
    },
    noticeTitle: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.md },
    noticeBody: { fontFamily: family.regular, fontSize: tk.font.sm, marginTop: 2, lineHeight: tk.font.sm * 1.4 },
    callbackBtn: {
      marginTop: tk.space.sm,
      alignSelf: 'flex-start',
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radius.md,
      paddingHorizontal: tk.space.md,
    },
    callbackLabel: { fontFamily: family.semibold, fontSize: tk.font.sm },
    careNote: {
      marginTop: tk.space.xs,
      paddingTop: tk.space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    callout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.sm,
      borderLeftWidth: 5,
      borderRadius: radius.sm,
      padding: tk.space.md,
    },
    calloutText: {
      flex: 1,
      fontFamily: family.semibold,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.4,
    },
    footer: {
      padding: tk.space.md,
      borderTopWidth: 1,
      gap: tk.space.sm,
    },
    footerTitle: { fontFamily: family.medium, fontSize: tk.font.xs },
    footerActions: { flexDirection: 'row', gap: tk.space.sm },
    orderAction: { marginTop: tk.space.sm },
    waBtn: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.md,
    },
    waText: { fontFamily: family.semibold, fontSize: tk.font.md },
  });
}
