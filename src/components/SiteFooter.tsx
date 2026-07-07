import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { family, font, radius, space } from '../lib/theme';
import { useTheme } from '../context/ThemeContext';
import { fetchServices } from '../lib/api';
import { Service } from '../lib/types';

type FooterLink = {
  label: string;
  href: string;
};

export default function SiteFooter({ services }: { services?: Service[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const styles = makeStyles(isWide, width);
  const [loadedServices, setLoadedServices] = useState<Service[]>(services ?? []);

  useEffect(() => {
    if (services) {
      setLoadedServices(services);
      return;
    }

    let mounted = true;
    fetchServices().then((items) => {
      if (mounted) setLoadedServices(items);
    });

    return () => {
      mounted = false;
    };
  }, [services]);

  const stats = useMemo(() => {
    const total = loadedServices.length;
    const verified = loadedServices.filter((service) => service.verified).length;
    const sourceLinked = loadedServices.filter((service) => Boolean(service.source_url)).length;
    const phoneReady = loadedServices.filter((service) => Boolean(service.phone)).length;

    return [
      { label: 'Listed services', value: total },
      { label: 'Verified', value: verified },
      { label: 'Source-linked', value: sourceLinked },
      { label: 'Phone listed', value: phoneReady },
    ];
  }, [loadedServices]);

  const columns: Array<{ title: string; links: FooterLink[] }> = [
    {
      title: 'Explore',
      links: [
        { label: t('tabs.home'), href: '/' },
        { label: t('tabs.services'), href: '/services' },
        { label: t('tabs.assistant'), href: '/assistant' },
        { label: t('tabs.community'), href: '/community' },
        { label: t('tabs.help'), href: '/help' },
      ],
    },
    {
      title: 'Trust checks',
      links: [
        { label: 'Verified directory', href: '/services' },
        { label: 'Source links on records', href: '/services' },
        { label: 'Call before visiting', href: '/services' },
        { label: 'Save for family reuse', href: '/services' },
      ],
    },
    {
      title: 'Care areas',
      links: [
        { label: t('categories.elder_home'), href: '/services?category=elder_home' },
        { label: t('categories.doctor'), href: '/services?category=doctor' },
        { label: t('categories.hospital'), href: '/services?category=hospital' },
        { label: t('categories.medical_shop'), href: '/services?category=medical_shop' },
      ],
    },
  ];

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: isDark ? colors.surfaceTint : 'rgba(30,95,201,0.028)',
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.footerTop}>
        <View style={styles.brandBlock}>
          <Text style={[styles.brand, { color: colors.text }]}>Directory status</Text>
          <Text style={[styles.brandBody, { color: colors.textMuted }]} numberOfLines={isWide ? undefined : 2}>
            Saathi is an independent launch-city directory for Siliguri families. Listings shown
            here are source-linked where available and should be called first before visiting.
          </Text>
          {isWide ? (
            <View style={styles.trustBadges}>
              <View
                style={[
                  styles.trustBadge,
                  { backgroundColor: colors.bgAlt, borderColor: colors.border },
                ]}
              >
                <Feather name="check-circle" size={16} color={colors.accent} />
                <Text style={[styles.trustBadgeText, { color: colors.accentDark }]}>Verified rows</Text>
              </View>
              <View
                style={[
                  styles.trustBadge,
                  { backgroundColor: colors.bgAlt, borderColor: colors.border },
                ]}
              >
                <Feather name="link" size={16} color={colors.accent} />
                <Text style={[styles.trustBadgeText, { color: colors.accentDark }]}>Source-linked</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          {stats.map((item) => (
            <View
              key={item.label}
              style={[
                styles.statCard,
                { backgroundColor: colors.bgAlt, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statValue, { color: colors.text }]}>{item.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {isWide ? (
        <View style={styles.columns}>
          {columns.map((column) => (
            <View key={column.title} style={styles.column}>
              <Text style={[styles.columnTitle, { color: colors.text }]}>{column.title}</Text>
              {column.links.map((link) => (
                <Pressable
                  key={`${column.title}-${link.label}`}
                  accessibilityRole="link"
                  onPress={() => router.push(link.href as any)}
                  style={({ pressed }) => [
                    styles.footerLink,
                    pressed && { backgroundColor: colors.overlay },
                  ]}
                >
                  <Text style={[styles.footerLinkText, { color: colors.textMuted }]}>
                    {link.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={[
          styles.disclaimer,
          { backgroundColor: colors.bgAlt, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
          Saathi is not a government portal or emergency service. For urgent danger, call the
          appropriate public emergency number. Service details can change, so confirm by phone and
          check the source before relying on a listing.
        </Text>
      </View>
    </View>
  );
}

function makeStyles(isWide: boolean, viewportWidth: number) {
  const contentMaxWidth = 1320;
  const footerSidePadding = isWide
    ? Math.max(space.xxl, Math.round((viewportWidth - contentMaxWidth) / 2) + space.xl)
    : space.md;

  return StyleSheet.create({
    footer: {
      alignSelf: 'center',
      width: isWide ? viewportWidth : '100%',
      marginTop: space.xl,
      marginBottom: 0,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      paddingHorizontal: footerSidePadding,
      paddingTop: isWide ? space.lg : space.md,
      paddingBottom: isWide ? space.lg : space.md,
      gap: space.md,
    },
    footerTop: {
      flexDirection: isWide ? 'row' : 'column',
      justifyContent: 'space-between',
      gap: space.md,
    },
    brandBlock: {
      flex: isWide ? 1.2 : undefined,
      minWidth: 0,
      maxWidth: isWide ? 520 : undefined,
    },
    brand: {
      fontSize: font.lg,
      fontFamily: family.heavy,
      lineHeight: Math.round(font.lg * 1.1),
    },
    brandBody: {
      marginTop: space.xs,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.35),
    },
    trustBadges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: space.sm,
    },
    trustBadge: {
      minHeight: 30,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
    },
    trustBadgeText: {
      fontSize: font.xs,
      fontFamily: family.bold,
    },
    statsGrid: {
      flex: isWide ? 1 : undefined,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
      minWidth: isWide ? 360 : undefined,
    },
    statCard: {
      width: isWide ? '48%' : '48.5%',
      minHeight: 58,
      borderWidth: 1,
      borderRadius: radius.md,
      justifyContent: 'center',
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    statValue: {
      fontSize: font.md,
      fontFamily: family.bold,
      lineHeight: Math.round(font.md * 1.08),
    },
    statLabel: {
      marginTop: 3,
      fontSize: font.xs,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.xs * 1.25),
    },
    columns: {
      flexDirection: isWide ? 'row' : 'column',
      justifyContent: 'space-between',
      gap: isWide ? space.lg : space.md,
    },
    column: {
      flex: 1,
      minWidth: isWide ? 0 : undefined,
    },
    columnTitle: {
      fontSize: font.sm,
      fontFamily: family.bold,
      lineHeight: Math.round(font.md * 1.2),
      marginBottom: space.xs,
    },
    footerLink: {
      alignSelf: 'flex-start',
      minHeight: 26,
      borderRadius: radius.sm,
      justifyContent: 'center',
      paddingHorizontal: 2,
      paddingRight: space.sm,
    },
    footerLinkText: {
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: Math.round(font.sm * 1.25),
    },
    disclaimer: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: 8,
    },
    disclaimerText: {
      fontSize: font.xs,
      fontFamily: family.regular,
      lineHeight: Math.round(font.xs * 1.45),
      textAlign: isWide ? 'center' : 'left',
    },
  });
}
