import React, { useEffect, useState } from 'react';
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
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { Card, H1, H2, Body, Muted, Button, Badge, Stars } from '../../src/components/ui';
import { AppColors, font, radius, space, shadow } from '../../src/lib/theme';
import { categoryColor } from '../../src/lib/categories';
import { fetchService } from '../../src/lib/api';
import { Service } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { useTheme } from '../../src/context/ThemeContext';
import { canUseWhatsApp, openWhatsAppCall, openWhatsAppChat } from '../../src/lib/whatsapp';

function formatTrustDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ServiceDetail() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { favoriteSet, toggleFavorite, recordViewed } = useServicePreferences();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const styles = makeStyles(colors, isDark, isWide);

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const isFav = id ? favoriteSet.has(id) : false;
  const onPrimary = isDark ? colors.textOnDark : '#fff';

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
  const verifiedAt = formatTrustDate(service.verified_at);
  const showWhatsApp = canUseWhatsApp(service.phone);

  const checklist = [
    {
      label: t('common.verified'),
      value: service.verified ? t('common.verified') : t('services.unverified'),
      ok: service.verified,
    },
    {
      label: t('services.verificationStatusLabel'),
      value: t(`services.verificationStatus.${verificationStatus}`),
      ok: service.verified,
    },
    {
      label: t('services.lastVerified'),
      value: verifiedAt ?? t('services.notReverified'),
      ok: Boolean(verifiedAt),
    },
    {
      label: t('services.sourceLinked'),
      value: service.source_url ? t('services.viewSource') : t('common.noResults'),
      ok: Boolean(service.source_url),
    },
    {
      label: t('services.claimStatusLabel'),
      value: t(`services.claimStatus.${claimStatus}`),
      ok: claimStatus === 'claimed',
    },
    {
      label: t('services.callFirst'),
      value: service.phone ? service.phone : t('common.noResults'),
      ok: Boolean(service.phone),
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: t(`categories.${service.category}`),
          headerStyle: { backgroundColor: colors.nav },
          headerTitleStyle: { color: '#fff', fontWeight: '900' },
          headerShadowVisible: false,
          headerTintColor: '#fff',
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              style={styles.headerBack}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={leaveDetail}
            >
              <Text style={styles.headerBackText}>{`< ${t('common.back')}`}</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: categoryColor(service.category).bg,
                  borderColor: categoryColor(service.category).border,
                },
              ]}
            >
              <ServiceGlyph category={service.category} color={categoryColor(service.category).fg} size={34} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>{t(`categories.${service.category}`)}</Text>
              <H1 style={styles.title}>{service.name}</H1>
              <View style={styles.metaRow}>
                <Stars rating={service.rating} />
                {service.verified && <Badge label={t('common.verified')} />}
              </View>
            </View>
          </View>
          <View style={styles.heroSignalRow}>
            <Text style={styles.heroSignal}>{t(`services.verificationStatus.${verificationStatus}`)}</Text>
            {service.phone_confirmed ? <Text style={styles.heroSignal}>{t('services.trustPhone')}</Text> : null}
            {service.source_url ? <Text style={styles.heroSignal}>{t('services.trustSource')}</Text> : null}
          </View>
        </View>

        <View style={styles.detailGrid}>
          <Card style={styles.aboutCard}>
            <Text style={styles.panelKicker}>{t('services.about')}</Text>
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
            <Text style={styles.panelKicker}>{t('services.trustChecklist')}</Text>
            <H2>{t('services.trustChecklist')}</H2>
            {checklist.map((item) => (
              <View key={item.label} style={styles.checkRow}>
                <View style={[styles.checkDot, { backgroundColor: item.ok ? colors.success : colors.warningText }]}>
                  <Text style={[styles.checkDotText, { color: item.ok ? onPrimary : colors.warningBg }]}>
                    {item.ok ? 'OK' : '!'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  <Muted style={styles.checkValue} numberOfLines={2}>
                    {item.value}
                  </Muted>
                </View>
              </View>
            ))}
            <Muted style={styles.careNote}>{t('services.careNote')}</Muted>
          </Card>
        </View>

        {!service.verified ? (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>! {t('services.unverified')}</Text>
          </View>
        ) : null}

        <View style={{ gap: space.md }}>
          <Button
            label={isFav ? t('services.removeFavorite') : t('services.addFavorite')}
            variant="secondary"
            onPress={() => id && toggleFavorite(id)}
          />
          {service.source_url ? (
            <Button
              label={t('services.viewSource')}
              variant="secondary"
              onPress={() => Linking.openURL(service.source_url!)}
            />
          ) : null}
        </View>
      </ScrollView>

      {service.phone || service.map_url ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <Text style={styles.footerTitle}>{t('services.contactActions')}</Text>
          <View style={styles.footerActions}>
            {showWhatsApp ? (
              <>
                <TouchableOpacity
                  style={[styles.fBtn, { backgroundColor: colors.success, flex: 1 }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.call')} on WhatsApp`}
                  onPress={() => openWhatsAppCall(service.phone)}
                >
                  <Text style={[styles.fBtnText, { color: onPrimary }]}>{t('common.call')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.waBtn}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="WhatsApp"
                  onPress={() => openWhatsAppChat(service.phone)}
                >
                  <Text style={styles.waText}>WhatsApp</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {service.map_url ? (
              <TouchableOpacity
                style={[styles.fBtn, { backgroundColor: colors.primary, flex: 1 }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('common.directions')}
                onPress={() => Linking.openURL(service.map_url!)}
              >
                <Text style={[styles.fBtnText, { color: onPrimary }]}>{t('common.directions')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: AppColors, isDark: boolean, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
    content: {
      width: '100%',
      maxWidth: 1120,
      alignSelf: 'center',
      padding: isWide ? space.xl : space.md,
      paddingBottom: 170,
      gap: space.lg,
    },
    hero: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : 'rgba(255,255,255,0.68)',
      backgroundColor: colors.nav,
      padding: isWide ? space.xl : space.lg,
      gap: space.lg,
      ...shadow.md,
    },
    heroTop: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: space.lg,
    },
    heroIcon: {
      width: 88,
      height: 88,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroText: { flex: 1, minWidth: 0 },
    kicker: {
      color: 'rgba(255,255,255,0.70)',
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    title: { marginTop: space.sm, color: '#fff', fontSize: isWide ? 44 : 34, lineHeight: isWide ? 50 : 39 },
    heroSignalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    heroSignal: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      backgroundColor: 'rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.84)',
      paddingHorizontal: space.sm,
      paddingVertical: 8,
      fontSize: font.xs,
      fontWeight: '900',
      overflow: 'hidden',
    },
    headerBack: {
      minHeight: 44,
      minWidth: 90,
      paddingHorizontal: space.sm,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerBackText: { color: '#fff', fontSize: font.md, fontWeight: '900' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
    detailGrid: { flexDirection: isWide ? 'row' : 'column', gap: space.lg },
    aboutCard: { flex: 1, gap: space.sm, borderColor: colors.border, borderRadius: 14 },
    detailLine: { fontSize: font.sm },
    checkCard: { flex: 1, gap: space.sm, borderColor: colors.border, borderRadius: 14 },
    panelKicker: {
      color: colors.accentDark,
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: 4,
    },
    checkDot: {
      width: 34,
      height: 34,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDotText: { fontWeight: '900', fontSize: font.xs },
    checkLabel: { color: colors.text, fontSize: font.sm, fontWeight: '900' },
    checkValue: { fontSize: font.xs },
    careNote: {
      marginTop: space.xs,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    callout: {
      backgroundColor: colors.warningBg,
      borderLeftWidth: 5,
      borderLeftColor: colors.warningText,
      borderRadius: radius.sm,
      padding: space.md,
    },
    calloutText: {
      color: colors.warningText,
      fontSize: font.sm,
      fontWeight: '800',
      lineHeight: font.sm * 1.4,
    },
    footer: {
      padding: space.md,
      backgroundColor: colors.nav,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: space.sm,
      ...shadow.md,
    },
    footerTitle: { color: colors.textMuted, fontSize: font.xs, fontWeight: '900', textTransform: 'uppercase' },
    footerActions: { flexDirection: 'row', gap: space.sm },
    fBtn: {
      minHeight: 60,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      ...shadow.sm,
    },
    fBtnText: { fontSize: font.md, fontWeight: '900' },
    waBtn: {
      minHeight: 60,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      backgroundColor: colors.whatsapp,
      borderWidth: 1,
      borderColor: colors.whatsapp,
    },
    waText: { color: colors.whatsappText, fontSize: font.md, fontWeight: '900' },
  });
}
