import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, H1, H2, Body, Muted, Button, Badge, Stars } from '../../src/components/ui';
import { colors, font, radius, space } from '../../src/lib/theme';
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
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.md }}>
      <Stack.Screen options={{ title: t(`categories.${service.category}`) }} />

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
        <View style={{ height: space.sm }} />
        {service.address ? (
          <Muted style={{ fontSize: font.sm }}>📍 {service.address}</Muted>
        ) : null}
        {service.hours ? (
          <Muted style={{ fontSize: font.sm, marginTop: 4 }}>
            🕒 {t('services.hours')}: {service.hours}
          </Muted>
        ) : null}
      </Card>

      <View style={{ gap: space.sm, marginTop: space.md }}>
        {service.phone ? (
          <Button
            label={`${t('common.call')}  ${service.phone}`}
            icon="☎"
            onPress={() => Linking.openURL(`tel:${service.phone}`)}
          />
        ) : null}
        {service.map_url ? (
          <Button
            label={t('common.directions')}
            icon="🧭"
            variant="secondary"
            onPress={() => Linking.openURL(service.map_url!)}
          />
        ) : null}
        <Button
          label={isFav ? t('services.removeFavorite') : t('services.addFavorite')}
          icon={isFav ? '★' : '☆'}
          variant="secondary"
          onPress={onFav}
        />
        {!user ? <Muted style={{ textAlign: 'center' }}>{t('services.signInToSave')}</Muted> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});
