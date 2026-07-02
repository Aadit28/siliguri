import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Card, H1, H2, Body, Muted, Button, Badge } from '../src/components/ui';
import { AppColors, font, radius, space } from '../src/lib/theme';
import { SERVICE_CATEGORIES } from '../src/lib/categories';
import { Announcement, ServiceCategory } from '../src/lib/types';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { backendRequest } from '../src/lib/backend';
import { supabase, supabaseConfigured } from '../src/lib/supabase';

export default function AdminScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, user, isAdmin } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, isDark);

  // Announcements form state.
  const [titleEn, setTitleEn] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [titleHi, setTitleHi] = useState('');
  const [bodyHi, setBodyHi] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);

  // Service form state.
  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('doctor');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [upiId, setUpiId] = useState('');
  const [verified, setVerified] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceSuccess, setServiceSuccess] = useState(false);

  async function loadAnnouncements() {
    if (!supabaseConfigured) {
      setAnnouncements([]);
      return;
    }
    setLoadingAnnouncements(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(20);
    setLoadingAnnouncements(false);
    if (!error && data) setAnnouncements(data as Announcement[]);
  }

  useEffect(() => {
    if (isAdmin) loadAnnouncements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!session || !user) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}>
        <Stack.Screen options={{ title: t('admin.title') }} />
        <Card>
          <H2>{t('admin.notAdmin')}</H2>
          <Muted style={{ marginTop: space.sm }}>{t('admin.signInFirst')}</Muted>
          <View style={{ marginTop: space.lg }}>
            <Button label={t('common.signIn')} onPress={() => router.push('/login')} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  if (!isAdmin) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}>
        <Stack.Screen options={{ title: t('admin.title') }} />
        <Card>
          <H2>{t('admin.notAdmin')}</H2>
        </Card>
      </ScrollView>
    );
  }

  async function publish() {
    setPublishError(null);
    setPublishSuccess(false);
    if (!titleEn.trim() || !bodyEn.trim()) return;
    setPublishing(true);
    try {
      await backendRequest('/api/admin/announcement', {
        method: 'POST',
        token: session!.access_token,
        body: {
          title: titleEn.trim(),
          body: bodyEn.trim(),
          titleHi: titleHi.trim() || undefined,
          bodyHi: bodyHi.trim() || undefined,
        },
      });
      setTitleEn('');
      setBodyEn('');
      setTitleHi('');
      setBodyHi('');
      setPublishSuccess(true);
      await loadAnnouncements();
    } catch (error) {
      setPublishError((error as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function deactivate(id: string) {
    setPublishError(null);
    try {
      await backendRequest('/api/admin/announcement', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'deactivate', id },
      });
      await loadAnnouncements();
    } catch (error) {
      setPublishError((error as Error).message);
    }
  }

  async function saveService() {
    setServiceError(null);
    setServiceSuccess(false);
    if (!serviceName.trim() || !category) return;
    setSavingService(true);
    try {
      await backendRequest('/api/admin/service', {
        method: 'POST',
        token: session!.access_token,
        body: {
          name: serviceName.trim(),
          category,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          hours: hours.trim() || undefined,
          description: description.trim() || undefined,
          upi_id: upiId.trim() || undefined,
          verified,
        },
      });
      setServiceName('');
      setCategory('doctor');
      setPhone('');
      setAddress('');
      setHours('');
      setDescription('');
      setUpiId('');
      setVerified(false);
      setServiceSuccess(true);
    } catch (error) {
      setServiceError(`${t('admin.error')} ${(error as Error).message}`);
    } finally {
      setSavingService(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: Math.max(insets.bottom, space.lg) }}
    >
      <Stack.Screen options={{ title: t('admin.title') }} />
      <H1>{t('admin.title')}</H1>
      <Muted style={{ marginTop: 4, marginBottom: space.lg }}>{t('admin.subtitle')}</Muted>

      {/* Announcements */}
      <Card>
        <H2>{t('admin.announcements')}</H2>

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.titleLabel')}</Muted>
        <TextInput
          style={styles.input}
          value={titleEn}
          onChangeText={setTitleEn}
          placeholder={t('admin.titleLabel')}
          placeholderTextColor={colors.textMuted}
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.bodyLabel')}</Muted>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
          value={bodyEn}
          onChangeText={setBodyEn}
          placeholder={t('admin.bodyLabel')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.titleHiLabel')}</Muted>
        <TextInput
          style={styles.input}
          value={titleHi}
          onChangeText={setTitleHi}
          placeholder={t('admin.titleHiLabel')}
          placeholderTextColor={colors.textMuted}
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.bodyHiLabel')}</Muted>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
          value={bodyHi}
          onChangeText={setBodyHi}
          placeholder={t('admin.bodyHiLabel')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {publishError ? (
          <Text style={[styles.message, { color: colors.danger }]}>{publishError}</Text>
        ) : null}
        {publishSuccess ? (
          <Text style={[styles.message, { color: colors.success }]}>{t('admin.published')}</Text>
        ) : null}

        <View style={{ marginTop: space.lg }}>
          <Button
            label={t('admin.publish')}
            onPress={publish}
            loading={publishing}
            disabled={!titleEn.trim() || !bodyEn.trim()}
          />
        </View>

        <View style={styles.divider} />

        {!supabaseConfigured || announcements.length === 0 ? (
          <Muted>{t('announcements.empty')}</Muted>
        ) : (
          announcements.map((item) => (
            <View key={item.id} style={styles.listRow}>
              <Body style={{ fontWeight: '800' }}>{item.title}</Body>
              <Muted numberOfLines={2} style={{ marginTop: 4 }}>
                {item.body}
              </Muted>
              <View style={styles.listRowFooter}>
                <Muted style={{ fontSize: font.xs }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Muted>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => deactivate(item.id)}
                  style={styles.deactivateBtn}
                >
                  <Text style={styles.deactivateText}>{t('admin.deactivate')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Services */}
      <Card style={{ marginTop: space.lg }}>
        <H2>{t('admin.services')}</H2>
        <Muted style={{ marginTop: 4 }}>{t('admin.addService')}</Muted>

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.serviceName')}</Muted>
        <TextInput
          style={styles.input}
          value={serviceName}
          onChangeText={setServiceName}
          placeholder={t('admin.serviceName')}
          placeholderTextColor={colors.textMuted}
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.category')}</Muted>
        <View style={styles.chipRow}>
          {SERVICE_CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                onPress={() => setCategory(c.key)}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active ? colors.primaryTint : colors.chipBg,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.categoryChipText, { color: colors.text }]}>
                  {c.emoji} {t(`categories.${c.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.phone')}</Muted>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('admin.phone')}
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.address')}</Muted>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder={t('admin.address')}
          placeholderTextColor={colors.textMuted}
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.hours')}</Muted>
        <TextInput
          style={styles.input}
          value={hours}
          onChangeText={setHours}
          placeholder={t('admin.hours')}
          placeholderTextColor={colors.textMuted}
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.description')}</Muted>
        <TextInput
          style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('admin.description')}
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Muted style={{ marginTop: space.md, marginBottom: 6 }}>{t('admin.upiId')}</Muted>
        <TextInput
          style={styles.input}
          value={upiId}
          onChangeText={setUpiId}
          placeholder={t('admin.upiId')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => setVerified((v) => !v)}
          style={[
            styles.verifiedChip,
            {
              backgroundColor: verified ? colors.primaryTint : colors.chipBg,
              borderColor: verified ? colors.primary : colors.border,
            },
          ]}
        >
          {verified ? (
            <Badge label={t('admin.verified')} />
          ) : (
            <Text style={[styles.categoryChipText, { color: colors.text }]}>{t('admin.verified')}</Text>
          )}
        </Pressable>

        {serviceError ? (
          <Text style={[styles.message, { color: colors.danger }]}>{serviceError}</Text>
        ) : null}
        {serviceSuccess ? (
          <Text style={[styles.message, { color: colors.success }]}>{t('admin.saved')}</Text>
        ) : null}

        <View style={{ marginTop: space.lg }}>
          <Button
            label={t('admin.save')}
            onPress={saveService}
            loading={savingService}
            disabled={!serviceName.trim()}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    input: {
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.md,
      color: colors.text,
      minHeight: 54,
    },
    message: {
      fontSize: font.sm,
      fontWeight: '700',
      marginTop: space.sm,
    },
    divider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    listRow: {
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    listRowFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space.sm,
    },
    deactivateBtn: {
      minHeight: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    deactivateText: {
      fontSize: font.sm,
      fontWeight: '800',
      color: colors.danger,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    categoryChip: {
      minHeight: 48,
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryChipText: {
      fontSize: font.sm,
      fontWeight: '700',
    },
    verifiedChip: {
      marginTop: space.md,
      minHeight: 48,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      alignItems: 'flex-start',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
  });
}
