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
import { useTranslation } from 'react-i18next';
import { Card, H1, Body, Muted, Button, Badge, Stars } from '../../src/components/ui';
import { colors, font, radius, space, shadow } from '../../src/lib/theme';

// Indian numbers: normalise to wa.me intl form (prefix 91 for bare 10-digit).
function waLink(phone: string) {
  const d = phone.replace(/\D/g, '');
  const intl = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${intl}`;
}
import { serviceEmoji } from '../../src/lib/categories';
import { fetchServices, fetchFavoriteIds, toggleFavorite } from '../../src/lib/api';
import { Service } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    fetchServices().then((all) => {
      setService(all.find((s) => s.id === id) ?? null);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (user && id) fetchFavoriteIds(user.id).then((set) => setIsFav(set.has(id)));
  }, [user, id]);

  async function onFav() {
    if (!user) {
      router.push('/login');
      return;
    }
    const next = !isFav;
    setIsFav(next); // optimistic
    await toggleFavorite(id!, user.id, isFav);
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: space.xl }} color={colors.primary} size="large" />;
  }
  if (!service) {
    return (
      <View style={{ padding: space.lg }}>
        <Muted>{t('common.noResults')}</Muted>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t(`categories.${service.category}`) }} />

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 140 }}>
        <View style={styles.hero}>
          <Text style={{ fontSize: 56 }}>{serviceEmoji(service.category)}</Text>
        </View>

        <H1 style={{ marginTop: space.md }}>{service.name}</H1>
        <View style={styles.metaRow}>
          <Stars rating={service.rating} />
          {service.verified && <Badge label={t('common.verified')} />}
        </View>

        <Card style={{ marginTop: space.md }}>
          {service.description ? <Body>{service.description}</Body> : null}
          {service.address ? (
            <Muted style={{ fontSize: font.sm, marginTop: space.sm }}>📍 {service.address}</Muted>
          ) : null}
          {service.hours ? (
            <Muted style={{ fontSize: font.sm, marginTop: 4 }}>
              🕒 {t('services.hours')}: {service.hours}
            </Muted>
          ) : null}
        </Card>

        {!service.verified ? (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>⚠️ {t('services.unverified')}</Text>
          </View>
        ) : null}

        <View style={{ gap: space.md, marginTop: space.md }}>
          <Button
            label={isFav ? t('services.removeFavorite') : t('services.addFavorite')}
            icon={isFav ? '★' : '☆'}
            variant="secondary"
            onPress={onFav}
          />
          {!user ? (
            <Muted style={{ textAlign: 'center' }}>{t('services.signInToSave')}</Muted>
          ) : null}
          {service.source_url ? (
            <Button
              label={t('services.viewSource')}
              icon="🔗"
              variant="secondary"
              onPress={() => Linking.openURL(service.source_url!)}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky action bar — primary actions always reachable without scrolling */}
      {service.phone || service.map_url ? (
        <View style={styles.footer}>
          {service.phone ? (
            <>
              <TouchableOpacity
                style={[styles.fBtn, { backgroundColor: colors.success, flex: 1 }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('common.call')}
                onPress={() => Linking.openURL(`tel:${service.phone}`)}
              >
                <Text style={styles.fBtnText}>☎  {t('common.call')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fBtn, styles.waBtn]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="WhatsApp"
                onPress={() => Linking.openURL(waLink(service.phone!))}
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
              <Text style={styles.fBtnText}>🧭  {t('common.directions')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 150,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  callout: {
    marginTop: space.md,
    backgroundColor: '#FFF7E0',
    borderLeftWidth: 5,
    borderLeftColor: '#E0A82E',
    borderRadius: radius.sm,
    padding: space.md,
  },
  calloutText: { color: '#5C4400', fontSize: font.sm, fontWeight: '700', lineHeight: font.sm * 1.4 },
  footer: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.md,
  },
  fBtn: {
    minHeight: 60,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  fBtnText: { color: '#fff', fontSize: font.md, fontWeight: '800' },
  waBtn: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#128C7E' },
  waText: { color: '#128C7E', fontSize: font.md, fontWeight: '800' },
});
