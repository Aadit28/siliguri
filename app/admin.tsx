import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Card, H1, H2, Muted, Button, Chip, Dialog } from '../src/components/ui';
import { AppColors, family, font, radius, space, TAP, ROW_MIN_HEIGHT } from '../src/lib/theme';
import { SERVICE_CATEGORIES } from '../src/lib/categories';
import { Announcement, ServiceCategory } from '../src/lib/types';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { backendRequest } from '../src/lib/backend';
import { supabase, supabaseConfigured } from '../src/lib/supabase';
import { markLoginIntent } from '../src/lib/authNavigation';

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrap}>
      <Text style={[fieldStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          fieldStyles.input,
          {
            backgroundColor: colors.surfaceTint,
            borderColor: focused ? colors.glassBorder : colors.border,
            color: colors.text,
          },
          multiline ? fieldStyles.inputMultiline : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Notice({ kind, message }: { kind: 'error' | 'success'; message: string }) {
  const { colors } = useTheme();
  const tint = kind === 'error' ? colors.danger : colors.success;
  return (
    <View style={fieldStyles.notice}>
      <Feather name={kind === 'error' ? 'alert-circle' : 'check-circle'} size={16} color={tint} />
      <Text style={[fieldStyles.noticeText, { color: tint }]}>{message}</Text>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginTop: space.md },
  label: {
    fontSize: font.sm,
    fontFamily: family.medium,
    lineHeight: Math.round(font.sm * 1.45),
    marginBottom: space.sm,
  },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: font.md,
    fontFamily: family.regular,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  noticeText: {
    flex: 1,
    fontSize: font.sm,
    fontFamily: family.medium,
    lineHeight: Math.round(font.sm * 1.45),
  },
});

type CityHelper = {
  id: string;
  username: string;
  full_name: string | null;
  created_at: string;
};

export default function AdminScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, user, isAdmin, isCityHelper, isCityStaff } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const screenTitle = isCityHelper ? t('admin.helperTitle') : t('admin.title');

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
  const [announcementsError, setAnnouncementsError] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Announcement | null>(null);

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

  // City helper management state (admins only).
  const [helpers, setHelpers] = useState<CityHelper[]>([]);
  const [loadingHelpers, setLoadingHelpers] = useState(false);
  const [helperUsername, setHelperUsername] = useState('');
  const [addingHelper, setAddingHelper] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperSuccess, setHelperSuccess] = useState(false);
  const [helperRemoveTarget, setHelperRemoveTarget] = useState<CityHelper | null>(null);

  async function loadAnnouncements() {
    if (!supabaseConfigured) {
      setAnnouncements([]);
      return;
    }
    setLoadingAnnouncements(true);
    setAnnouncementsError(false);
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(20);
    setLoadingAnnouncements(false);
    if (error) {
      setAnnouncementsError(true);
      return;
    }
    if (data) setAnnouncements(data as Announcement[]);
  }

  async function loadHelpers() {
    if (!session) return;
    setLoadingHelpers(true);
    try {
      const { helpers: rows } = await backendRequest<{ helpers: CityHelper[] }>(
        '/api/admin/helper',
        { method: 'POST', token: session.access_token, body: { action: 'list' } },
      );
      setHelpers(rows);
    } catch {
      setHelpers([]);
    } finally {
      setLoadingHelpers(false);
    }
  }

  useEffect(() => {
    if (isCityStaff) loadAnnouncements();
    if (isAdmin) loadHelpers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCityStaff, isAdmin]);

  if (!session || !user) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.gateContainer}
      >
        <Stack.Screen options={{ title: t('admin.title') }} />
        <Card style={styles.gateCard}>
          <View style={styles.gateIconBlock}>
            <Feather name="lock" size={28} color={colors.text} />
          </View>
          <H2 style={styles.gateTitle}>{t('admin.notAdmin')}</H2>
          <Muted style={styles.gateBody}>{t('admin.signInFirst')}</Muted>
          <View style={styles.gateAction}>
            <Button
              label={t('common.signIn')}
              onPress={() => {
                markLoginIntent();
                router.push('/login');
              }}
            />
          </View>
        </Card>
      </ScrollView>
    );
  }

  if (!isCityStaff) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.gateContainer}
      >
        <Stack.Screen options={{ title: t('admin.title') }} />
        <Card style={styles.gateCard}>
          <View style={styles.gateIconBlock}>
            <Feather name="shield-off" size={28} color={colors.text} />
          </View>
          <H2 style={styles.gateTitle}>{t('admin.notAdmin')}</H2>
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

  function confirmRemove() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    setRemoveTarget(null);
    deactivate(id);
  }

  async function addHelper() {
    setHelperError(null);
    setHelperSuccess(false);
    if (!helperUsername.trim()) return;
    setAddingHelper(true);
    try {
      await backendRequest('/api/admin/helper', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'add', username: helperUsername.trim() },
      });
      setHelperUsername('');
      setHelperSuccess(true);
      await loadHelpers();
    } catch (error) {
      setHelperError((error as Error).message);
    } finally {
      setAddingHelper(false);
    }
  }

  async function removeHelper(id: string) {
    setHelperError(null);
    setHelperSuccess(false);
    try {
      await backendRequest('/api/admin/helper', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'remove', id },
      });
      await loadHelpers();
    } catch (error) {
      setHelperError((error as Error).message);
    }
  }

  function confirmRemoveHelper() {
    if (!helperRemoveTarget) return;
    const id = helperRemoveTarget.id;
    setHelperRemoveTarget(null);
    removeHelper(id);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: space.md,
        paddingTop: space.sm,
        paddingBottom: Math.max(insets.bottom, space.lg),
      }}
    >
      <Stack.Screen options={{ title: screenTitle }} />

      <H1>{screenTitle}</H1>
      <Muted style={styles.screenSubtitle}>
        {isCityHelper ? t('admin.helperSubtitle') : t('admin.subtitle')}
      </Muted>

      {/* Announcements */}
      <H2 style={styles.sectionHeader}>{t('admin.announcements')}</H2>

      <Card>
        <Text style={styles.cardTitle}>{t('admin.newAnnouncement')}</Text>
        <Field label={t('admin.titleLabel')} value={titleEn} onChangeText={setTitleEn} />
        <Field label={t('admin.bodyLabel')} value={bodyEn} onChangeText={setBodyEn} multiline />
        <Field label={t('admin.titleHiLabel')} value={titleHi} onChangeText={setTitleHi} />
        <Field label={t('admin.bodyHiLabel')} value={bodyHi} onChangeText={setBodyHi} multiline />

        {publishError ? <Notice kind="error" message={publishError} /> : null}
        {publishSuccess ? <Notice kind="success" message={t('admin.published')} /> : null}

        <View style={styles.formAction}>
          <Button
            label={t('admin.publish')}
            onPress={publish}
            loading={publishing}
            disabled={!titleEn.trim() || !bodyEn.trim()}
          />
        </View>
      </Card>

      <Card style={styles.listCard}>
        {loadingAnnouncements ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.textMuted} />
            <Muted style={styles.stateText}>{t('common.loading')}</Muted>
          </View>
        ) : announcementsError ? (
          <View style={styles.stateBlock}>
            <Feather name="alert-circle" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('common.errorLoading')}</Muted>
            <Pressable
              accessibilityRole="button"
              onPress={loadAnnouncements}
              style={({ pressed }) => [pressed ? { opacity: 0.6 } : null]}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : !supabaseConfigured || announcements.length === 0 ? (
          <View style={styles.stateBlock}>
            <Feather name="bell-off" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('announcements.empty')}</Muted>
          </View>
        ) : (
          announcements.map((item, index) => (
            <View key={item.id}>
              <View style={styles.listRow}>
                <View style={styles.rowDisc}>
                  <Feather name="bell" size={20} color={colors.text} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text numberOfLines={2} style={styles.rowSubtitle}>
                    {item.body}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.deactivate')}
                  onPress={() => setRemoveTarget(item)}
                  style={({ pressed }) => [
                    styles.ghostDanger,
                    pressed ? { backgroundColor: colors.dangerSoft } : null,
                  ]}
                >
                  <Text style={styles.ghostDangerText}>{t('admin.deactivate')}</Text>
                </Pressable>
              </View>
              {index < announcements.length - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))
        )}
      </Card>

      {/* Services */}
      <H2 style={styles.sectionHeader}>{t('admin.services')}</H2>

      <Card>
        <Text style={styles.cardTitle}>{t('admin.addService')}</Text>
        <Field label={t('admin.serviceName')} value={serviceName} onChangeText={setServiceName} />

        <View style={fieldStyles.wrap}>
          <Text style={[fieldStyles.label, { color: colors.textMuted }]}>
            {t('admin.category')}
          </Text>
          <View style={styles.chipRow}>
            {SERVICE_CATEGORIES.map((c) => (
              <Chip
                key={c.key}
                label={t(`categories.${c.key}`)}
                active={category === c.key}
                onPress={() => setCategory(c.key)}
              />
            ))}
          </View>
        </View>

        <Field
          label={t('admin.phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field label={t('admin.address')} value={address} onChangeText={setAddress} />
        <Field label={t('admin.hours')} value={hours} onChangeText={setHours} />
        <Field
          label={t('admin.description')}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Field
          label={t('admin.upiId')}
          value={upiId}
          onChangeText={setUpiId}
          autoCapitalize="none"
        />

        {isAdmin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: verified }}
          onPress={() => setVerified((v) => !v)}
          style={({ pressed }) => [
            styles.toggleChip,
            verified
              ? { backgroundColor: colors.accent, borderColor: colors.accent }
              : {
                  backgroundColor: pressed ? colors.cardStrong : colors.chipBg,
                  borderColor: colors.border,
                },
          ]}
        >
          {verified ? <Feather name="check" size={16} color={colors.accentFg} /> : null}
          <Text
            style={[
              styles.toggleChipText,
              { color: verified ? colors.accentFg : colors.text },
            ]}
          >
            {t('admin.verified')}
          </Text>
        </Pressable>
        ) : null}

        {serviceError ? <Notice kind="error" message={serviceError} /> : null}
        {serviceSuccess ? <Notice kind="success" message={t('admin.saved')} /> : null}

        <View style={styles.formAction}>
          <Button
            label={t('admin.save')}
            onPress={saveService}
            loading={savingService}
            disabled={!serviceName.trim()}
          />
        </View>
      </Card>

      {/* City helpers (admins appoint trusted locals) */}
      {isAdmin ? (
        <>
          <H2 style={styles.sectionHeader}>{t('admin.helpers')}</H2>

          <Card>
            <Text style={styles.cardTitle}>{t('admin.addHelper')}</Text>
            <Muted style={styles.screenSubtitle}>{t('admin.helperHint')}</Muted>
            <Field
              label={t('admin.helperUsername')}
              value={helperUsername}
              onChangeText={setHelperUsername}
              autoCapitalize="none"
            />

            {helperError ? <Notice kind="error" message={helperError} /> : null}
            {helperSuccess ? <Notice kind="success" message={t('admin.helperAdded')} /> : null}

            <View style={styles.formAction}>
              <Button
                label={t('admin.helperAdd')}
                onPress={addHelper}
                loading={addingHelper}
                disabled={!helperUsername.trim()}
              />
            </View>
          </Card>

          <Card style={styles.listCard}>
            {loadingHelpers ? (
              <View style={styles.stateBlock}>
                <ActivityIndicator color={colors.textMuted} />
                <Muted style={styles.stateText}>{t('common.loading')}</Muted>
              </View>
            ) : helpers.length === 0 ? (
              <View style={styles.stateBlock}>
                <Feather name="users" size={20} color={colors.textSubtle} />
                <Muted style={styles.stateText}>{t('admin.helpersEmpty')}</Muted>
              </View>
            ) : (
              helpers.map((item, index) => (
                <View key={item.id}>
                  <View style={styles.listRow}>
                    <View style={styles.rowDisc}>
                      <Feather name="user-check" size={20} color={colors.text} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{item.full_name || item.username}</Text>
                      <Text style={styles.rowSubtitle}>{item.username}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('admin.helperRemove')}
                      onPress={() => setHelperRemoveTarget(item)}
                      style={({ pressed }) => [
                        styles.ghostDanger,
                        pressed ? { backgroundColor: colors.dangerSoft } : null,
                      ]}
                    >
                      <Text style={styles.ghostDangerText}>{t('admin.helperRemove')}</Text>
                    </Pressable>
                  </View>
                  {index < helpers.length - 1 ? <View style={styles.rowDivider} /> : null}
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}

      {/* Helper removal confirmation */}
      <Dialog
        visible={helperRemoveTarget !== null}
        onClose={() => setHelperRemoveTarget(null)}
        title={t('admin.helperRemove')}
      >
        {helperRemoveTarget ? (
          <Text style={styles.dialogBody} numberOfLines={2}>
            {helperRemoveTarget.full_name || helperRemoveTarget.username}
          </Text>
        ) : null}
        <View style={styles.dialogActions}>
          <Button label={t('admin.helperRemove')} variant="danger" onPress={confirmRemoveHelper} />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setHelperRemoveTarget(null)}
          />
        </View>
      </Dialog>

      {/* Destructive confirmation */}
      <Dialog
        visible={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={t('admin.deactivate')}
      >
        {removeTarget ? (
          <Text style={styles.dialogBody} numberOfLines={3}>
            {removeTarget.title}
          </Text>
        ) : null}
        <View style={styles.dialogActions}>
          <Button label={t('admin.deactivate')} variant="danger" onPress={confirmRemove} />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setRemoveTarget(null)}
          />
        </View>
      </Dialog>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    screenSubtitle: {
      marginTop: space.xs,
    },
    sectionHeader: {
      marginTop: space.lg,
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
      color: colors.text,
    },
    formAction: {
      marginTop: space.lg,
    },
    listCard: {
      marginTop: 12,
      paddingHorizontal: 0,
      paddingVertical: space.xs,
    },
    stateBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.lg,
    },
    stateText: {
      textAlign: 'center',
    },
    retryText: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.text,
      textDecorationLine: 'underline',
    },
    listRow: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.md,
      paddingVertical: 12,
    },
    rowDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: {
      flex: 1,
      marginLeft: 12,
    },
    rowTitle: {
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.text,
    },
    rowSubtitle: {
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
      color: colors.textMuted,
      marginTop: 2,
    },
    rowMeta: {
      fontSize: font.xs,
      fontFamily: family.medium,
      color: colors.textSubtle,
      marginTop: space.xs,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 72,
    },
    ghostDanger: {
      minHeight: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginLeft: space.sm,
    },
    ghostDangerText: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.danger,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: space.sm,
    },
    toggleChip: {
      marginTop: space.md,
      minHeight: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      gap: 6,
    },
    toggleChipText: {
      fontSize: font.sm,
      fontFamily: family.semibold,
    },
    dialogBody: {
      fontSize: font.md,
      fontFamily: family.regular,
      lineHeight: Math.round(font.md * 1.5),
      color: colors.textMuted,
      marginTop: space.sm,
    },
    dialogActions: {
      marginTop: space.lg,
      gap: 12,
    },
    gateContainer: {
      padding: space.md,
      paddingTop: space.xl,
    },
    gateCard: {
      alignItems: 'center',
      padding: space.lg,
    },
    gateIconBlock: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gateTitle: {
      marginTop: space.md,
      textAlign: 'center',
    },
    gateBody: {
      marginTop: space.sm,
      textAlign: 'center',
    },
    gateAction: {
      marginTop: space.lg,
      alignSelf: 'stretch',
    },
  });
}
