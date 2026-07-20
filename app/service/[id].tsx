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
import { Feather } from '@expo/vector-icons';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { Body, Button, Card, H1, H2, Muted, Badge, Stars } from '../../src/components/ui';
import { AppColors, family, font, radius, space } from '../../src/lib/theme';
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
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const styles = makeStyles(colors, isWide);

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const isFav = id ? favoriteSet.has(id) : false;

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
            {checklist.map((item) => (
              <View key={item.label} style={styles.checkRow}>
                <View
                  style={[
                    styles.checkDot,
                    { backgroundColor: item.ok ? colors.successSoft : colors.warningBg },
                  ]}
                >
                  <Feather
                    name={item.ok ? 'check' : 'alert-triangle'}
                    size={16}
                    color={item.ok ? colors.success : colors.warningText}
                  />
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
          <View style={[styles.callout, { backgroundColor: colors.warningBg, borderLeftColor: colors.warningText }]}>
            <Feather name="alert-triangle" size={18} color={colors.warningText} />
            <Text style={[styles.calloutText, { color: colors.warningText }]}>{t('services.unverified')}</Text>
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
        <View style={[styles.footer, { backgroundColor: colors.nav, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
          <Muted style={styles.footerTitle}>{t('services.contactActions')}</Muted>
          <View style={styles.footerActions}>
            {showWhatsApp ? (
              <>
                <View style={{ flex: 1 }}>
                  <Button label={t('common.call')} variant="primary" onPress={() => openWhatsAppCall(service.phone)} />
                </View>
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
              </>
            ) : null}
            {service.map_url ? (
              <View style={{ flex: 1 }}>
                <Button label={t('common.directions')} variant="primary" onPress={() => Linking.openURL(service.map_url!)} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
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
      borderRadius: radius.xl,
      borderWidth: 1,
      padding: isWide ? space.xl : space.lg,
      gap: space.lg,
    },
    heroTop: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: space.lg,
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
    kicker: { fontFamily: family.regular, fontSize: font.xs },
    title: { fontFamily: family.medium, marginTop: space.sm, fontSize: isWide ? 40 : 32, lineHeight: isWide ? 47 : 38 },
    heroSignalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    heroSignal: {
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: space.sm,
      paddingVertical: 8,
      fontFamily: family.semibold,
      fontSize: font.xs,
      overflow: 'hidden',
    },
    headerBack: {
      minHeight: 44,
      minWidth: 90,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: space.sm,
      justifyContent: 'flex-start',
    },
    headerBackText: { color: colors.text, fontSize: font.md, fontFamily: family.semibold },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
    detailGrid: { flexDirection: isWide ? 'row' : 'column', gap: space.lg },
    aboutCard: { flex: 1, gap: space.sm },
    detailLine: { fontFamily: family.regular, fontSize: font.sm },
    checkCard: { flex: 1, gap: space.sm },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: 4,
    },
    checkDot: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkLabel: { color: colors.text, fontFamily: family.semibold, fontSize: font.sm },
    checkValue: { fontFamily: family.regular, fontSize: font.xs },
    careNote: {
      marginTop: space.xs,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    callout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderLeftWidth: 5,
      borderRadius: radius.sm,
      padding: space.md,
    },
    calloutText: {
      flex: 1,
      fontFamily: family.semibold,
      fontSize: font.sm,
      lineHeight: font.sm * 1.4,
    },
    footer: {
      padding: space.md,
      borderTopWidth: 1,
      gap: space.sm,
    },
    footerTitle: { fontFamily: family.medium, fontSize: font.xs },
    footerActions: { flexDirection: 'row', gap: space.sm },
    waBtn: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
    },
    waText: { fontFamily: family.semibold, fontSize: font.md },
  });
}
