import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../context/LocaleContext';
import { useTheme } from '../context/ThemeContext';
import { family, font, space } from '../lib/theme';
import { Service } from '../lib/types';

type FooterLink = {
  label: string;
  href: string;
};

export default function SiteFooter({ services }: { services: Service[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const styles = makeStyles(isWide);

  const summary = useMemo(() => {
    const verified = services.filter((service) => service.verified).length;
    const phoneReady = services.filter((service) => Boolean(service.phone)).length;
    if (lang === 'hi') {
      return `${services.length} सेवाएँ · ${verified} सत्यापित · ${phoneReady} फ़ोन उपलब्ध`;
    }
    return `${services.length} listed · ${verified} verified · ${phoneReady} phone listed`;
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
    <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
      <View style={styles.brandBlock}>
        <Text selectable style={[styles.brand, { color: colors.text }]}>
          {t('appName')}
        </Text>
        <Text selectable style={[styles.brandBody, { color: colors.textMuted }]}>
          {lang === 'hi'
            ? 'साथी सिलीगुड़ी परिवारों के लिए एक स्वतंत्र स्थानीय डायरेक्टरी है। जाने से पहले सेवा को कॉल करें और स्रोत की जाँच करें।'
            : 'Saathi is an independent local directory for Siliguri families. Call before visiting and check the source before relying on a listing.'}
        </Text>
        <Text selectable style={[styles.summary, { color: colors.textSubtle }]}>
          {summary}
        </Text>
      </View>

      <View style={styles.columns}>
        {columns.map((column) => (
          <View key={column.title} style={styles.column}>
            <Text style={[styles.columnTitle, { color: colors.text }]}>{column.title}</Text>
            {column.links.map((link) => (
              <Pressable
                key={`${column.title}-${link.label}`}
                accessibilityRole="link"
                onPress={() => router.push(link.href as never)}
                style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
              >
                <Text style={[styles.footerLinkText, { color: colors.textMuted }]}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={[styles.disclaimer, { borderTopColor: colors.border }]}>
        <Text selectable style={[styles.disclaimerText, { color: colors.textSubtle }]}>
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
    brandBlock: { maxWidth: isWide ? 680 : undefined },
    brand: { fontFamily: family.bold, fontSize: isWide ? 26 : 22, lineHeight: isWide ? 32 : 28, letterSpacing: -0.3 },
    brandBody: { fontFamily: family.regular, paddingTop: space.sm, fontSize: font.sm, lineHeight: 23 },
    summary: { fontFamily: family.medium, paddingTop: space.sm, fontSize: font.xs, lineHeight: 20 },
    columns: { flexDirection: isWide ? 'row' : 'column', gap: isWide ? space.xl : space.md },
    column: { flex: 1, minWidth: 0 },
    columnTitle: { fontFamily: family.semibold, paddingBottom: space.sm, fontSize: font.sm },
    footerLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: space.md },
    footerLinkText: { fontFamily: family.regular, fontSize: font.sm, lineHeight: 21 },
    disclaimer: { borderTopWidth: 1, paddingTop: space.md },
    disclaimerText: { fontFamily: family.regular, fontSize: font.xs, lineHeight: 20, textAlign: isWide ? 'center' : 'left' },
    pressed: { opacity: 0.6 },
  });
}
