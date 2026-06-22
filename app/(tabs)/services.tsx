import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { Card, Badge, Stars, Muted } from '../../src/components/ui';
import { colors, font, radius, space } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, serviceEmoji } from '../../src/lib/categories';
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
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ key: 'all' as const, emoji: '📋' }, ...SERVICE_CATEGORIES]}
        keyExtractor={(i) => i.key}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
        renderItem={({ item }) => {
          const active = cat === item.key;
          const label = item.key === 'all' ? t('common.all') : t(`categories.${item.key}`);
          return (
            <TouchableOpacity
              onPress={() => setCat(item.key as any)}
              activeOpacity={0.8}
              style={[styles.chip, { backgroundColor: active ? colors.primary : colors.chipBg }]}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.primaryDark }]}>
                {item.emoji} {label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

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
                <View style={styles.avatar}>
                  <Text style={{ fontSize: 28 }}>{serviceEmoji(item.category)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Muted numberOfLines={1} style={{ marginTop: 2 }}>
                    📍 {item.address}
                  </Muted>
                  <View style={styles.metaRow}>
                    <Stars rating={item.rating} />
                    {item.verified && <Badge label={t('common.verified')} />}
                  </View>
                </View>
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 54,
  },
  search: { flex: 1, fontSize: font.md, color: colors.text, marginLeft: space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  chipText: { fontSize: font.sm, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: font.md, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 6 },
});
