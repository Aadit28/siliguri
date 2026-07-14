import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { font, radius, space } from '../lib/theme';
import { Service } from '../lib/types';

type FooterLink = {
  label: string;
  href: string;
};

export default function SiteFooter({ services }: { services: Service[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const styles = makeStyles(isWide);

  const stats = useMemo(() => {
    const verified = services.filter((service) => service.verified).length;
    const sourceLinked = services.filter((service) => Boolean(service.source_url)).length;
    const phoneReady = services.filter((service) => Boolean(service.phone)).length;

    return [
      { label: lang === 'hi' ? 'सूचीबद्ध सेवाएँ' : 'Listed services', value: services.length },
      { label: lang === 'hi' ? 'सत्यापित' : 'Verified', value: verified },
      { label: lang === 'hi' ? 'स्रोत से जुड़ी' : 'Source-linked', value: sourceLinked },
      { label: lang === 'hi' ? 'फ़ोन उपलब्ध' : 'Phone listed', value: phoneReady },
    ];
  }, [lang, services]);

  const columns: Array<{ title: string; links: FooterLink[] }> = [
    {
      title: lang === 'hi' ? 'ऐप देखें' : 'Explore',
      links: [
        { label: t('tabs.home'), href: '/' },
        { label: t('tabs.services'), href: '/services' },
        { label: t('tabs.assistant'), href: '/assistant' },
        { label: t('tabs.community'), href: '/community' },
        { label: t('tabs.help'), href: '/help' },
      ],
    },
    {
      title: lang === 'hi' ? 'भरोसे की जाँच' : 'Trust checks',
      links: [
        { label: lang === 'hi' ? 'सत्यापित डायरेक्टरी' : 'Verified directory', href: '/services' },
        { label: lang === 'hi' ? 'रिकॉर्ड पर स्रोत लिंक' : 'Source links on records', href: '/services' },
        { label: lang === 'hi' ? 'जाने से पहले कॉल करें' : 'Call before visiting', href: '/services' },
        { label: lang === 'hi' ? 'परिवार के लिए सेव करें' : 'Save for family reuse', href: '/services' },
      ],
    },
    {
      title: lang === 'hi' ? 'देखभाल की श्रेणियाँ' : 'Care areas',
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
          backgroundColor: isDark ? colors.surfaceTint : colors.nav,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.footerTop}>
        <View style={styles.brandBlock}>
          <Text selectable style={styles.brand}>
            {lang === 'hi' ? 'डायरेक्टरी की स्थिति' : 'Directory status'}
          </Text>
          <Text selectable style={styles.brandBody}>
            {lang === 'hi'
              ? 'साथी सिलीगुड़ी परिवारों के लिए एक स्वतंत्र स्थानीय डायरेक्टरी है। जाने से पहले सेवा को कॉल करें और स्रोत की जाँच करें।'
              : 'Saathi is an independent local directory for Siliguri families. Call before visiting and check the source before relying on a listing.'}
          </Text>
          <View style={styles.trustBadges}>
            <View style={styles.trustBadge}>
              <Text style={styles.trustBadgeText}>✓ {t('common.verified')}</Text>
            </View>
            <View style={styles.trustBadge}>
              <Text style={styles.trustBadgeText}>↗ {t('home.signalVerified')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {stats.map((item) => (
            <View key={item.label} style={styles.statCard}>
              <Text selectable style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.columns}>
        {columns.map((column) => (
          <View key={column.title} style={styles.column}>
            <Text style={styles.columnTitle}>{column.title}</Text>
            {column.links.map((link) => (
              <Pressable
                key={`${column.title}-${link.label}`}
                accessibilityRole="link"
                onPress={() => router.push(link.href as never)}
                style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
              >
                <Text style={styles.footerLinkText}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.disclaimer}>
        <Text selectable style={styles.disclaimerText}>
          {lang === 'hi'
            ? 'साथी सरकारी पोर्टल या आपातकालीन सेवा नहीं है। तत्काल खतरे में 112 पर कॉल करें। सेवा की जानकारी बदल सकती है, इसलिए फ़ोन और स्रोत से पुष्टि करें।'
            : 'Saathi is not a government portal or emergency service. For immediate danger, call 112. Service details can change, so confirm by phone and check the source.'}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(isWide: boolean) {
  return StyleSheet.create({
    footer: {
      width: '100%',
      borderTopWidth: 1,
      borderRadius: 0,
      paddingHorizontal: isWide ? 48 : space.lg,
      paddingTop: isWide ? 44 : space.xl,
      paddingBottom: isWide ? 44 : 112,
      gap: isWide ? space.xl : space.lg,
    },
    footerTop: {
      flexDirection: isWide ? 'row' : 'column',
      justifyContent: 'space-between',
      gap: space.xl,
    },
    brandBlock: { flex: 1.15, minWidth: 0, maxWidth: isWide ? 680 : undefined },
    brand: { color: '#FFFFFF', fontSize: isWide ? 30 : 25, lineHeight: isWide ? 36 : 31, fontWeight: '800' },
    brandBody: { color: 'rgba(255,255,255,0.76)', paddingTop: space.sm, fontSize: font.sm, lineHeight: 23 },
    trustBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: space.md },
    trustBadge: {
      minHeight: 36,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      backgroundColor: 'rgba(255,255,255,0.09)',
      paddingHorizontal: space.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    trustBadgeText: { color: '#FFFFFF', fontSize: font.xs, fontWeight: '700' },
    statsGrid: { flex: 0.85, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    statCard: {
      flexGrow: 1,
      flexBasis: isWide ? '22%' : '47%',
      minHeight: 88,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      backgroundColor: 'rgba(255,255,255,0.08)',
      padding: space.md,
      justifyContent: 'center',
    },
    statValue: { color: '#FFFFFF', fontSize: font.xl, lineHeight: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
    statLabel: { color: 'rgba(255,255,255,0.68)', paddingTop: 2, fontSize: font.xs, lineHeight: 18, fontWeight: '600' },
    columns: { flexDirection: isWide ? 'row' : 'column', gap: isWide ? space.xl : space.md },
    column: { flex: 1, minWidth: 0 },
    columnTitle: { color: '#FFFFFF', paddingBottom: space.sm, fontSize: font.sm, fontWeight: '800' },
    footerLink: { minHeight: 36, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: space.md },
    footerLinkText: { color: 'rgba(255,255,255,0.72)', fontSize: font.sm, lineHeight: 21, fontWeight: '600' },
    disclaimer: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: space.md },
    disclaimerText: { color: 'rgba(255,255,255,0.62)', fontSize: font.xs, lineHeight: 20, textAlign: isWide ? 'center' : 'left' },
    pressed: { opacity: 0.68 },
  });
}
