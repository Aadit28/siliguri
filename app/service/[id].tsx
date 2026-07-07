import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Linking,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Card, H1, H2, Body, Muted, Button, Badge, Stars } from '../../src/components/ui';
import {
  AppColors,
  family,
  font,
  radius,
  space,
  shadow,
  TAP,
  ROW_MIN_HEIGHT,
} from '../../src/lib/theme';
import { serviceEmoji } from '../../src/lib/categories';
import { fetchService } from '../../src/lib/api';
import { Service } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { useTheme } from '../../src/context/ThemeContext';
import { openUpiPayment } from '../../src/lib/payments';

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}`;
}

function canUseWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local);
}

export default function ServiceDetail() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { favoriteSet, toggleFavorite, recordViewed } = useServicePreferences();
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpiFallback, setShowUpiFallback] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);
  const isFav = id ? favoriteSet.has(id) : false;

  async function handlePayUpi() {
    if (!service?.upi_id) return;
    const ok = await openUpiPayment({ upiId: service.upi_id, name: service.name });
    if (!ok) setShowUpiFallback(true);
  }

  async function copyUpiId() {
    if (!service?.upi_id) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(service.upi_id);
        setUpiCopied(true);
      }
    } catch {
      // ignore — native clipboard not wired here
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

  const checklist = [
    {
      label: t('common.verified'),
      value: service.verified ? t('common.verified') : t('services.unverified'),
      ok: service.verified,
    },
    {
      label: t('services.sourceLinked'),
      value: service.source_url ? t('services.viewSource') : t('common.noResults'),
      ok: Boolean(service.source_url),
    },
    {
      label: t('services.callFirst'),
      value: service.phone ? service.phone : t('common.noResults'),
      ok: Boolean(service.phone),
    },
  ];

  const infoRows = [
    service.address ? { key: 'address', icon: 'map-pin' as const, text: service.address } : null,
    service.hours
      ? { key: 'hours', icon: 'clock' as const, text: `${t('services.hours')}: ${service.hours}` }
      : null,
  ].filter((row): row is { key: string; icon: 'map-pin' | 'clock'; text: string } => row !== null);

  const hasAbout = Boolean(service.description) || infoRows.length > 0;
  const hasContactRow = Boolean(service.phone || service.map_url);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: t(`categories.${service.category}`),
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={leaveDetail}
              hitSlop={8}
              style={({ pressed }) => [styles.headerBack, pressed && styles.pressedFade]}
            >
              <Feather name="chevron-left" size={24} color={colors.text} />
              <Text style={styles.headerBackText}>{t('common.back')}</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Identity block — Kroger product-detail: image centered, facts left */}
        <View style={styles.hero}>
          <View style={styles.heroTile}>
            <Text style={styles.heroEmoji}>{serviceEmoji(service.category)}</Text>
          </View>
          <Text style={styles.kicker}>{t(`categories.${service.category}`)}</Text>
          <H1 style={styles.title}>{service.name}</H1>
          <View style={styles.metaRow}>
            <Stars rating={service.rating} />
            {service.verified && <Badge label={t('common.verified')} />}
          </View>
        </View>

        {hasAbout ? (
          <Card>
            {service.description ? <Body>{service.description}</Body> : null}
            {infoRows.map((row, index) => (
              <View key={row.key}>
                {index > 0 || service.description ? <View style={styles.rowDivider} /> : null}
                <View style={styles.infoRow}>
                  <View style={styles.rowDisc}>
                    <Feather name={row.icon} size={20} color={colors.text} />
                  </View>
                  <Text style={styles.infoText}>{row.text}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={styles.secondaryActions}>
          <Button
            label={isFav ? t('services.removeFavorite') : t('services.addFavorite')}
            icon={
              <Feather name="star" size={20} color={isFav ? colors.accent : colors.primaryDark} />
            }
            variant="secondary"
            onPress={() => id && toggleFavorite(id)}
          />
          {service.source_url ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('services.viewSource')}
              onPress={() => Linking.openURL(service.source_url!)}
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressedFade]}
            >
              <Feather name="external-link" size={20} color={colors.accent} />
              <Text style={styles.ghostBtnText}>{t('services.viewSource')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Card>
          <H2>{t('services.trustChecklist')}</H2>
          <View style={styles.checkList}>
            {checklist.map((item, index) => (
              <View key={item.label}>
                {index > 0 ? <View style={styles.rowDivider} /> : null}
                <View style={styles.checkRow}>
                  <View
                    style={[
                      styles.rowDisc,
                      { backgroundColor: item.ok ? colors.success : colors.danger },
                    ]}
                  >
                    <Feather
                      name={item.ok ? 'check' : 'alert-circle'}
                      size={20}
                      color={item.ok ? colors.successFg : colors.dangerFg}
                    />
                  </View>
                  <View style={styles.checkTextBlock}>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                    <Muted style={styles.checkValue} numberOfLines={2}>
                      {item.value}
                    </Muted>
                  </View>
                </View>
              </View>
            ))}
          </View>
          <Muted style={styles.careNote}>{t('services.careNote')}</Muted>
        </Card>

        {!service.verified ? (
          <View style={styles.callout}>
            <Feather
              name="alert-triangle"
              size={20}
              color={colors.warningText}
              style={styles.calloutIcon}
            />
            <Text style={styles.calloutText}>{t('services.unverified')}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Fixed bottom CTA bar — Uber confirm pattern */}
      {service.phone || service.map_url || service.upi_id ? (
        <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <Text style={styles.footerTitle}>{t('services.contactActions')}</Text>

          {hasContactRow ? (
            <View style={styles.footerActions}>
              {service.phone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.call')}
                  onPress={() => Linking.openURL(`tel:${service.phone}`)}
                  style={({ pressed }) => [
                    styles.ctaPill,
                    styles.ctaFlex,
                    { backgroundColor: pressed ? colors.primaryDark : colors.primary },
                    pressed && styles.ctaPressed,
                  ]}
                >
                  <Feather name="phone" size={20} color={colors.primaryFg} />
                  <Text style={[styles.ctaText, { color: colors.primaryFg }]}>
                    {t('common.call')}
                  </Text>
                </Pressable>
              ) : null}

              {service.phone && canUseWhatsApp(service.phone) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="WhatsApp"
                  onPress={() => Linking.openURL(waLink(service.phone!))}
                  style={({ pressed }) => [
                    styles.ctaPill,
                    styles.ctaFlex,
                    { backgroundColor: colors.whatsapp },
                    pressed && styles.ctaPressed,
                  ]}
                >
                  <Feather name="message-circle" size={20} color={colors.successFg} />
                  <Text style={[styles.ctaText, { color: colors.successFg }]}>WhatsApp</Text>
                </Pressable>
              ) : null}

              {service.map_url && !service.phone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.directions')}
                  onPress={() => Linking.openURL(service.map_url!)}
                  style={({ pressed }) => [
                    styles.ctaPill,
                    styles.ctaFlex,
                    { backgroundColor: pressed ? colors.primaryDark : colors.primary },
                    pressed && styles.ctaPressed,
                  ]}
                >
                  <Feather name="navigation" size={20} color={colors.primaryFg} />
                  <Text style={[styles.ctaText, { color: colors.primaryFg }]}>
                    {t('common.directions')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {service.map_url && service.phone ? (
            <View style={styles.directionsSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.directions')}
                onPress={() => Linking.openURL(service.map_url!)}
                style={({ pressed }) => [
                  styles.directionsButton,
                  { backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint },
                  pressed && styles.ctaPressed,
                ]}
              >
                <Feather name="navigation" size={22} color={colors.text} />
                <Text style={[styles.ctaText, { color: colors.text }]}>
                  {t('common.directions')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {service.upi_id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pay.payUpi')}
              onPress={handlePayUpi}
              style={({ pressed }) => [
                styles.ctaPill,
                { backgroundColor: pressed ? colors.accentDark : colors.accent },
                pressed && styles.ctaPressed,
              ]}
            >
              <Feather name="credit-card" size={20} color={colors.accentFg} />
              <Text style={[styles.ctaText, { color: colors.accentFg }]}>{t('pay.payUpi')}</Text>
            </Pressable>
          ) : null}

          {showUpiFallback && service.upi_id ? (
            <View style={styles.upiPanel}>
              <Muted>{t('pay.webFallback')}</Muted>
              <Text selectable style={styles.upiId}>
                {service.upi_id}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.copy')}
                onPress={copyUpiId}
                style={({ pressed }) => [
                  styles.copyBtn,
                  pressed && { backgroundColor: colors.overlay },
                ]}
              >
                {upiCopied ? <Feather name="check" size={16} color={colors.success} /> : null}
                <Text style={[styles.copyBtnText, upiCopied && { color: colors.success }]}>
                  {upiCopied ? t('pay.copied') : t('common.copy')}
                </Text>
              </Pressable>
              <Muted style={styles.upiHint}>{t('pay.upiHint')}</Muted>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
    content: {
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.xl,
      gap: space.lg,
    },
    pressedFade: { opacity: 0.7 },

    headerBack: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: space.sm,
    },
    headerBackText: { color: colors.text, fontSize: font.md, fontFamily: family.semibold },

    hero: {
      paddingTop: space.sm,
    },
    heroTile: {
      alignSelf: 'center',
      width: 112,
      height: 112,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.lg,
    },
    heroEmoji: { fontSize: 56, lineHeight: 68 },
    kicker: {
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.medium,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    title: { marginTop: space.xs },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: space.sm,
    },

    // Shared Uber row anatomy: 44 disc + 12 gap; divider inset 44 + 12 = 56.
    rowDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 56,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: ROW_MIN_HEIGHT,
      paddingVertical: 12,
    },
    infoText: {
      flex: 1,
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.regular,
      lineHeight: Math.round(font.md * 1.5),
    },

    checkList: { marginTop: space.xs },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: ROW_MIN_HEIGHT,
      paddingVertical: 12,
    },
    checkTextBlock: { flex: 1 },
    checkLabel: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.35),
    },
    checkValue: { marginTop: 2 },
    careNote: {
      marginTop: space.xs,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    callout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      backgroundColor: colors.warningBg,
      borderRadius: radius.md,
      padding: space.md,
    },
    calloutIcon: { marginTop: 2 },
    calloutText: {
      flex: 1,
      color: colors.warningText,
      fontSize: font.sm,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.sm * 1.45),
    },

    secondaryActions: { gap: 12 },
    ghostBtn: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      paddingHorizontal: space.lg,
    },
    ghostBtnText: { color: colors.accent, fontSize: font.md, fontFamily: family.semibold },

    footer: {
      backgroundColor: colors.bgAlt,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: space.md,
      paddingTop: 12,
      gap: 12,
    },
    footerTitle: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.medium,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    footerActions: { flexDirection: 'row', gap: 12 },
    directionsSection: {
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    directionsButton: {
      minHeight: TAP + 4,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      paddingHorizontal: space.lg,
      ...(isDark ? null : shadow.sm),
    },
    ctaPill: {
      minHeight: TAP,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      paddingHorizontal: space.lg,
      ...(isDark ? null : shadow.sm),
    },
    ctaFlex: { flex: 1 },
    ctaPressed: { transform: [{ scale: 0.98 }] },
    ctaText: { fontSize: font.md, fontFamily: family.bold },
    ctaSquare: {
      width: TAP + 12,
      height: TAP + 6,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    upiPanel: {
      backgroundColor: colors.surfaceTint,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.xs,
    },
    upiId: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      marginTop: space.xs,
    },
    copyBtn: {
      alignSelf: 'flex-start',
      marginTop: space.xs,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.glassBorder,
      paddingHorizontal: space.md,
    },
    copyBtnText: { color: colors.primaryDark, fontSize: font.sm, fontFamily: family.semibold },
    upiHint: { marginTop: space.xs, fontSize: font.xs, lineHeight: Math.round(font.xs * 1.4) },
  });
}
