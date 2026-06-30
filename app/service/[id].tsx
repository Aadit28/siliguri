import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Card, H1, H2, Body, Muted, Button, Badge, Stars } from '../../src/components/ui';
import { AppColors, font, radius, space, shadow } from '../../src/lib/theme';
import { serviceEmoji } from '../../src/lib/categories';
import { fetchService } from '../../src/lib/api';
import { Service } from '../../src/lib/types';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { useTheme } from '../../src/context/ThemeContext';

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

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: t(`categories.${service.category}`),
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              style={styles.headerBack}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={leaveDetail}
            >
              <Text style={styles.headerBackText}>‹ {t('common.back')}</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Text style={{ fontSize: 56 }}>{serviceEmoji(service.category)}</Text>
          </View>
          <Text style={styles.kicker}>{t(`categories.${service.category}`)}</Text>
          <H1 style={styles.title}>{service.name}</H1>
          <View style={styles.metaRow}>
            <Stars rating={service.rating} />
            {service.verified && <Badge label={t('common.verified')} />}
          </View>
        </View>

        <Card style={styles.aboutCard}>
          {service.description ? <Body>{service.description}</Body> : null}
          {service.address ? <Muted style={styles.detailLine}>{service.address}</Muted> : null}
          {service.hours ? (
            <Muted style={styles.detailLine}>
              {t('services.hours')}: {service.hours}
            </Muted>
          ) : null}
        </Card>

        <Card style={styles.checkCard}>
          <H2>{t('services.trustChecklist')}</H2>
          {checklist.map((item) => (
            <View key={item.label} style={styles.checkRow}>
              <View style={[styles.checkDot, { backgroundColor: item.ok ? colors.success : colors.warningText }]}>
                <Text style={[styles.checkDotText, { color: item.ok ? onPrimary : colors.warningBg }]}>
                  {item.ok ? '✓' : '!'}
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

        {!service.verified ? (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>! {t('services.unverified')}</Text>
          </View>
        ) : null}

        <View style={{ gap: space.md }}>
          <Button
            label={isFav ? t('services.removeFavorite') : t('services.addFavorite')}
            icon={isFav ? '★' : '☆'}
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
            {service.phone ? (
              <>
                <TouchableOpacity
                  style={[styles.fBtn, { backgroundColor: colors.success, flex: 1 }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.call')}
                  onPress={() => Linking.openURL(`tel:${service.phone}`)}
                >
                  <Text style={[styles.fBtnText, { color: onPrimary }]}>{t('common.call')}</Text>
                </TouchableOpacity>
                {canUseWhatsApp(service.phone) ? (
                  <TouchableOpacity
                    style={styles.waBtn}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="WhatsApp"
                    onPress={() => Linking.openURL(waLink(service.phone!))}
                  >
                    <Text style={styles.waText}>WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}
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

function makeStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
    content: { padding: space.md, paddingBottom: 160, gap: space.md },
    hero: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.cardStrong,
      padding: space.lg,
      ...shadow.md,
    },
    heroIcon: {
      width: 92,
      height: 92,
      borderRadius: radius.xl,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.md,
    },
    kicker: {
      color: colors.accentDark,
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    title: { marginTop: space.sm },
    headerBack: {
      minHeight: 44,
      minWidth: 90,
      paddingHorizontal: space.sm,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerBackText: { color: colors.text, fontSize: font.md, fontWeight: '900' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
    aboutCard: { gap: space.sm },
    detailLine: { fontSize: font.sm },
    checkCard: { gap: space.sm },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: 4,
    },
    checkDot: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDotText: { fontWeight: '900', fontSize: font.sm },
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
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      ...shadow.sm,
    },
    fBtnText: { fontSize: font.md, fontWeight: '900' },
    waBtn: {
      minHeight: 60,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.whatsapp,
    },
    waText: { color: colors.whatsapp, fontSize: font.md, fontWeight: '900' },
  });
}
