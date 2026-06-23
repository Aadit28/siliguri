import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Card, Badge, Stars, Muted } from '../../src/components/ui';
import { colors, font, radius, space, shadow } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, serviceEmoji, categoryColor } from '../../src/lib/categories';
import { fetchServices } from '../../src/lib/api';
import { Service, ServiceCategory } from '../../src/lib/types';

export default function Services() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();

  const [all, setAll] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<ServiceCategory | 'all'>(
    (params.category as ServiceCategory) || 'all',
  );

  useEffect(() => {
    fetchServices()
      .then(setAll)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      const matchCat = cat === 'all' || s.category === cat;
      const matchQ =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (s.address ?? '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [all, query, cat]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={t('services.title')} />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={{ fontSize: font.md }}>🔍</Text>
        <TextInput
          style={styles.search}
          placeholder={t('services.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {/* Category chips */}
      <View style={{ flexGrow: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
        >
          {[{ key: 'all' as const, emoji: '📋' }, ...SERVICE_CATEGORIES].map((item) => {
            const active = cat === item.key;
            const label = item.key === 'all' ? t('common.all') : t(`categories.${item.key}`);
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setCat(item.key as any)}
                activeOpacity={0.8}
                style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.primaryDark }]}>
                  {item.emoji} {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.md, paddingBottom: space.xl, gap: space.sm }}
          ListEmptyComponent={
            <Muted style={{ textAlign: 'center', marginTop: space.xl }}>
              {t('common.noResults')}
            </Muted>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/service/${item.id}`)}
            >
              <Card style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: categoryColor(item.category).bg }]}>
                  <Text style={{ fontSize: 28 }}>{serviceEmoji(item.category)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Muted numberOfLines={1} style={{ marginTop: 2 }}>
                    📍 {item.address}
                  </Muted>
                  <View style={styles.metaRow}>
                    <Stars rating={item.rating} />
                    {item.verified && <Badge label={t('common.verified')} />}
                  </View>
                </View>
                {item.phone ? (
                  <TouchableOpacity
                    style={styles.callBtn}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common.call')} ${item.name}`}
                    onPress={() => Linking.openURL(`tel:${item.phone}`)}
                  >
                    <Text style={styles.callIcon}>☎</Text>
                    <Text style={styles.callLabel}>{t('common.call')}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.chevron}>›</Text>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    margin: space.md,
    marginBottom: 0,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
    ...shadow.sm,
  },
  search: { flex: 1, fontSize: font.md, color: colors.text, marginLeft: space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
    flexShrink: 0,
  },
  chipIdle: { backgroundColor: colors.chipBg },
  chipActive: { backgroundColor: colors.primary, ...shadow.sm },
  chipText: { fontSize: font.sm, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: { fontSize: 30, color: colors.textMuted, fontWeight: '400' },
  callBtn: {
    width: 64,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  callIcon: { color: '#fff', fontSize: 22 },
  callLabel: { color: '#fff', fontSize: font.xs, fontWeight: '800', marginTop: 2 },
  name: { fontSize: font.md, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6 },
});
