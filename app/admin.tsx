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
import { Card, H1, H2, Muted, Button, Chip, Dialog, Badge } from '../src/components/ui';
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
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  placeholder?: string;
  hint?: string;
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
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
      />
      {hint ? <Text style={[fieldStyles.hint, { color: colors.textSubtle }]}>{hint}</Text> : null}
    </View>
  );
}

// Optional 10-digit Indian phone -> +91XXXXXXXXXX. Returns null when a value is
// present but not a recognisable number; empty input is valid (field optional).
function normalizeIndianPhone(input: string): string | null | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

const UPI_PATTERN = /^[a-z0-9.\-_]{2,}@[a-z]{2,}$/i;

// Any http(s) link works — Google Maps share links, plus codes and goo.gl
// shorteners all pass, so admins can paste whatever the Maps app gave them.
const MAP_URL_PATTERN = /^https?:\/\/\S+$/i;

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
  hint: {
    fontSize: font.xs,
    fontFamily: family.regular,
    lineHeight: Math.round(font.xs * 1.5),
    marginTop: space.xs,
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

type AdminService = {
  id: string;
  name: string;
  category: ServiceCategory;
  phone: string | null;
  address: string | null;
  map_url?: string | null;
  hours: string | null;
  description: string | null;
  upi_id: string | null;
  verified: boolean;
  city_id: string | null;
  town: string | null;
};

type CallbackRequest = {
  id: string;
  name: string;
  phone: string;
  issue: string | null;
  source: string;
  status: string;
  service_id: string | null;
  created_at: string;
};

// Every status the backend can hand us. Keep this in sync with STATUSES in
// api/admin/callback.js, or a row arrives that the queue cannot label or act on.
const CALLBACK_STATUSES = ['new', 'queued', 'contacted', 'closed', 'spam'] as const;
type CallbackFilter = 'all' | (typeof CALLBACK_STATUSES)[number];

// Used until admin.status_queued / admin.status_spam land in the locale files.
const CALLBACK_STATUS_FALLBACK: Record<string, string> = {
  new: 'New',
  queued: 'Queued',
  contacted: 'Contacted',
  closed: 'Closed',
  spam: 'Spam',
};

type AdminSection = 'callbacks' | 'services' | 'announcements' | 'helpers';

// Announcements are read straight from Supabase (no backendRequest timeout), so
// the read gets its own deadline — otherwise a hung socket spins forever.
const ANNOUNCEMENTS_TIMEOUT_MS = 10000;

export default function AdminScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, user, loading, isAdmin, isCityHelper, isCityStaff, clearSession } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const screenTitle = isCityHelper ? t('admin.helperTitle') : t('admin.title');

  // One section on screen at a time; callbacks lead because they are the only
  // time-sensitive queue here.
  const [section, setSection] = useState<AdminSection>('callbacks');
  // Set when an offline demo token is rejected by the live backend, so the gate
  // explains what happened instead of bouncing back to /login (finding 8).
  const [demoSessionEnded, setDemoSessionEnded] = useState(false);

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
  const [mapUrl, setMapUrl] = useState('');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [upiId, setUpiId] = useState('');
  const [verified, setVerified] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceSuccess, setServiceSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Existing services (list / search / edit / delete).
  const [services, setServices] = useState<AdminService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<ServiceCategory | 'all'>('all');
  const [serviceRemoveTarget, setServiceRemoveTarget] = useState<AdminService | null>(null);

  // Callback requests queue.
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [loadingCallbacks, setLoadingCallbacks] = useState(false);
  const [callbacksError, setCallbacksError] = useState(false);
  const [callbackFilter, setCallbackFilter] = useState<CallbackFilter>('all');

  // Per-row in-flight ids so a second tap cannot fire the same mutation twice
  // on a slow connection. The callback queue records the
  // status being written too, so only the button that was pressed spins.
  const [pendingCallback, setPendingCallback] = useState<{ id: string; status: string } | null>(
    null,
  );
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [pendingAnnouncementId, setPendingAnnouncementId] = useState<string | null>(null);

  // City helper management state (admins only).
  const [helpers, setHelpers] = useState<CityHelper[]>([]);
  const [loadingHelpers, setLoadingHelpers] = useState(false);
  const [helpersError, setHelpersError] = useState(false);
  const [helperUsername, setHelperUsername] = useState('');
  const [addingHelper, setAddingHelper] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperSuccess, setHelperSuccess] = useState(false);
  const [helperRemoveTarget, setHelperRemoveTarget] = useState<CityHelper | null>(null);

  // Map raw backend/network errors to friendly copy. On a 401 the session is
  // gone, so send the user to sign in again (form drafts stay in state).
  function friendlyMessage(error: unknown): string {
    const status = (error as { status?: number }).status;
    const raw = (error as Error)?.message || '';
    if (status === 401) return t('admin.sessionExpired');
    if (status === 403) return t('admin.noPermission');
    if (/reach|not running|connection|network|timeout/i.test(raw)) return t('admin.offline');
    return raw || t('admin.genericError');
  }

  function handleAuthError(error: unknown): boolean {
    if ((error as { status?: number }).status !== 401) return false;
    // An offline demo token (`demo.<id>`) can never satisfy the live backend.
    // Redirecting to /login just mints another demo session and we bounce back
    // here forever, so drop the session and explain it in place (finding 8).
    if ((session?.access_token || '').startsWith('demo.')) {
      setDemoSessionEnded(true);
      void clearSession();
      return true;
    }
    markLoginIntent();
    router.replace('/login');
    return true;
  }

  async function loadServices() {
    if (!session) return;
    setLoadingServices(true);
    setServicesError(false);
    try {
      const { services: rows } = await backendRequest<{ services: AdminService[] }>(
        '/api/admin/service',
        { method: 'POST', token: session.access_token, body: { action: 'list' } },
      );
      setServices(rows);
    } catch (error) {
      if (!handleAuthError(error)) setServicesError(true);
    } finally {
      setLoadingServices(false);
    }
  }

  async function loadCallbacks() {
    if (!session) return;
    setLoadingCallbacks(true);
    setCallbacksError(false);
    try {
      const { requests } = await backendRequest<{ requests: CallbackRequest[] }>(
        '/api/admin/callback',
        { method: 'POST', token: session.access_token, body: { action: 'list' } },
      );
      setCallbacks(requests);
    } catch (error) {
      if (!handleAuthError(error)) setCallbacksError(true);
    } finally {
      setLoadingCallbacks(false);
    }
  }

  async function setCallbackStatus(id: string, status: string) {
    if (pendingCallback) return;
    setPendingCallback({ id, status });
    try {
      await backendRequest('/api/admin/callback', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'status', id, status },
      });
      await loadCallbacks();
    } catch (error) {
      if (!handleAuthError(error)) setCallbacksError(true);
    } finally {
      setPendingCallback(null);
    }
  }

  async function loadAnnouncements() {
    if (!supabaseConfigured) {
      setAnnouncements([]);
      return;
    }
    setLoadingAnnouncements(true);
    setAnnouncementsError(false);
    try {
      // This read bypasses backendRequest, so it needs its own deadline and
      // catch, otherwise a stalled request leaves a permanent spinner.
      const query = supabase
        .from('announcements')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      const { data, error } = await Promise.race([
        query,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), ANNOUNCEMENTS_TIMEOUT_MS),
        ),
      ]);
      if (error) throw error;
      setAnnouncements((data ?? []) as Announcement[]);
    } catch {
      setAnnouncementsError(true);
    } finally {
      setLoadingAnnouncements(false);
    }
  }

  async function loadHelpers() {
    if (!session) return;
    setLoadingHelpers(true);
    setHelpersError(false);
    try {
      const { helpers: rows } = await backendRequest<{ helpers: CityHelper[] }>(
        '/api/admin/helper',
        { method: 'POST', token: session.access_token, body: { action: 'list' } },
      );
      setHelpers(rows);
    } catch (error) {
      // A failed load is not an empty city — say so instead of faking an empty
      // state, and treat a 401 like the other sections do.
      if (!handleAuthError(error)) setHelpersError(true);
    } finally {
      setLoadingHelpers(false);
    }
  }

  useEffect(() => {
    if (isCityStaff) {
      loadAnnouncements();
      loadServices();
      loadCallbacks();
    }
    if (isAdmin) loadHelpers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCityStaff, isAdmin]);

  if (loading) {
    return (
      <View style={[styles.gateLoading, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ title: t('admin.title') }} />
        <ActivityIndicator color={colors.textMuted} />
        <Muted style={styles.stateText}>{t('common.loading')}</Muted>
      </View>
    );
  }

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
          <Muted style={styles.gateBody}>
            {demoSessionEnded
              ? t('admin.demoSessionEnded', {
                  defaultValue:
                    'The offline demo sign-in cannot use the admin tools. Sign in again to continue.',
                })
              : t('admin.signInFirst')}
          </Muted>
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
      if (!handleAuthError(error)) setPublishError(friendlyMessage(error));
    } finally {
      setPublishing(false);
    }
  }

  async function deactivate(id: string) {
    if (pendingAnnouncementId) return;
    setPublishError(null);
    setPendingAnnouncementId(id);
    try {
      await backendRequest('/api/admin/announcement', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'deactivate', id },
      });
      await loadAnnouncements();
    } catch (error) {
      if (!handleAuthError(error)) setPublishError(friendlyMessage(error));
    } finally {
      setPendingAnnouncementId(null);
    }
  }

  function startEditService(service: AdminService) {
    setEditingId(service.id);
    setServiceName(service.name);
    setCategory(service.category);
    setPhone(service.phone ?? '');
    setAddress(service.address ?? '');
    setMapUrl(service.map_url ?? '');
    setHours(service.hours ?? '');
    setDescription(service.description ?? '');
    setUpiId(service.upi_id ?? '');
    setVerified(Boolean(service.verified));
    setServiceError(null);
    setServiceSuccess(false);
  }

  function cancelEditService() {
    setEditingId(null);
    setServiceName('');
    setPhone('');
    setAddress('');
    setMapUrl('');
    setHours('');
    setDescription('');
    setUpiId('');
    setVerified(false);
    setServiceError(null);
    setServiceSuccess(false);
  }

  async function saveService() {
    setServiceError(null);
    setServiceSuccess(false);
    if (!serviceName.trim() || !category) return;

    // Validate optional fields before touching the network.
    const normalizedPhone = normalizeIndianPhone(phone);
    if (normalizedPhone === null) {
      setServiceError(t('admin.invalidPhone'));
      return;
    }
    const upi = upiId.trim();
    if (upi && !UPI_PATTERN.test(upi)) {
      setServiceError(t('admin.invalidUpi'));
      return;
    }
    const map = mapUrl.trim();
    if (map && !MAP_URL_PATTERN.test(map)) {
      setServiceError(
        t('admin.invalidMapUrl', { defaultValue: 'Enter a link starting with http:// or https://' }),
      );
      return;
    }

    // The server writes only the keys the body actually carries, and
    // JSON.stringify drops `undefined` — so an edit that omits a blanked field
    // silently keeps the old value. Every optional field on this form is loaded
    // from the row being edited, so on an edit each one is sent even when empty
    // ('' is what the server maps to null). A create still omits empties so the
    // new row falls back to its column defaults.
    const optionalField = (value: string) => (value ? value : editingId ? '' : undefined);

    setSavingService(true);
    try {
      await backendRequest('/api/admin/service', {
        method: 'POST',
        token: session!.access_token,
        body: {
          id: editingId || undefined,
          name: serviceName.trim(),
          category,
          phone: optionalField(normalizedPhone ?? ''),
          address: optionalField(address.trim()),
          map_url: optionalField(map),
          hours: optionalField(hours.trim()),
          description: optionalField(description.trim()),
          upi_id: optionalField(upi),
          verified,
        },
      });
      // Keep the last-used category so consecutive entries stay in flow.
      setEditingId(null);
      setServiceName('');
      setPhone('');
      setAddress('');
      setMapUrl('');
      setHours('');
      setDescription('');
      setUpiId('');
      setVerified(false);
      setServiceSuccess(true);
      await loadServices();
    } catch (error) {
      // Preserve the form draft on failure; only surface a friendly message.
      if (!handleAuthError(error)) setServiceError(friendlyMessage(error));
    } finally {
      setSavingService(false);
    }
  }

  async function deleteService(id: string) {
    if (pendingServiceId) return;
    setServiceError(null);
    setServiceSuccess(false);
    setPendingServiceId(id);
    try {
      await backendRequest('/api/admin/service', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'delete', id },
      });
      if (editingId === id) cancelEditService();
      await loadServices();
    } catch (error) {
      if (!handleAuthError(error)) setServiceError(friendlyMessage(error));
    } finally {
      setPendingServiceId(null);
    }
  }

  function confirmRemoveService() {
    if (!serviceRemoveTarget) return;
    const id = serviceRemoveTarget.id;
    setServiceRemoveTarget(null);
    deleteService(id);
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
    const username = helperUsername.trim();
    if (!username) return;
    if (username.length < 3) {
      setHelperError(t('admin.helperUsernameTooShort'));
      return;
    }
    setAddingHelper(true);
    try {
      await backendRequest('/api/admin/helper', {
        method: 'POST',
        token: session!.access_token,
        body: { action: 'add', username },
      });
      setHelperUsername('');
      setHelperSuccess(true);
      await loadHelpers();
    } catch (error) {
      if (handleAuthError(error)) return;
      const raw = (error as Error)?.message || '';
      // Backend replies "No account with that username."; soften it.
      setHelperError(/no account/i.test(raw) ? t('admin.helperNotFound') : friendlyMessage(error));
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
      if (!handleAuthError(error)) setHelperError(friendlyMessage(error));
    }
  }

  function confirmRemoveHelper() {
    if (!helperRemoveTarget) return;
    const id = helperRemoveTarget.id;
    setHelperRemoveTarget(null);
    removeHelper(id);
  }

  // Per-category counts + text/category filtering for the existing-services list.
  const serviceCounts = services.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});
  const serviceQuery = serviceSearch.trim().toLowerCase();
  const filteredServices = services.filter((s) => {
    if (serviceFilter !== 'all' && s.category !== serviceFilter) return false;
    if (!serviceQuery) return true;
    return (
      s.name.toLowerCase().includes(serviceQuery) ||
      (s.address ?? '').toLowerCase().includes(serviceQuery) ||
      (s.phone ?? '').toLowerCase().includes(serviceQuery)
    );
  });

  // Callback queue counts drive both the filter chips and the tab badge.
  const callbackCounts = callbacks.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const filteredCallbacks =
    callbackFilter === 'all' ? callbacks : callbacks.filter((c) => c.status === callbackFilter);
  const openCallbacks = callbacks.filter(
    (c) => c.status !== 'closed' && c.status !== 'spam',
  ).length;

  function isCallbackPending(id: string, status: string) {
    return pendingCallback?.id === id && pendingCallback.status === status;
  }

  function callbackStatusColor(status: string) {
    if (status === 'closed') return colors.success;
    if (status === 'contacted') return colors.info;
    if (status === 'spam') return colors.danger;
    if (status === 'queued') return colors.textSubtle;
    return colors.star;
  }

  const roleBadgeLabel = isAdmin ? t('admin.title') : t('admin.helperTitle');

  // Section tabs — counts are suppressed while a section is loading or errored
  // so a failed fetch never reads as "0 items" (finding 14).
  const sectionTabs: { key: AdminSection; label: string; count?: number }[] = [
    {
      key: 'callbacks',
      label: t('admin.callbacks'),
      count: loadingCallbacks || callbacksError ? undefined : openCallbacks,
    },
    {
      key: 'services',
      label: t('admin.services'),
      count: loadingServices || servicesError ? undefined : services.length,
    },
    {
      key: 'announcements',
      label: t('admin.announcements'),
      count: loadingAnnouncements || announcementsError ? undefined : announcements.length,
    },
    ...(isAdmin
      ? [
          {
            key: 'helpers' as const,
            label: t('admin.helpers'),
            count: loadingHelpers || helpersError ? undefined : helpers.length,
          },
        ]
      : []),
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: screenTitle }} />

      {/* Sticky section switcher — stays put while a section scrolls. */}
      <View style={[styles.tabBar, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {sectionTabs.map((tab) => (
            <Chip
              key={tab.key}
              label={tab.label}
              count={tab.count}
              active={section === tab.key}
              onPress={() => setSection(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          padding: space.md,
          paddingTop: space.sm,
          paddingBottom: Math.max(insets.bottom, space.lg),
        }}
      >
        <View style={styles.roleBadgeRow}>
          <Badge label={roleBadgeLabel} color={isAdmin ? colors.accent : colors.chipBg} />
        </View>
        <Muted style={styles.screenSubtitle}>
          {isCityHelper ? t('admin.helperSubtitle') : t('admin.subtitle')}
        </Muted>

      {section === 'announcements' ? (
       <>
      <Card style={styles.sectionLead}>
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
              accessibilityLabel={t('common.retry')}
              onPress={loadAnnouncements}
              style={({ pressed }) => [styles.retryButton, pressed ? { opacity: 0.6 } : null]}
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
                  disabled={pendingAnnouncementId !== null}
                  onPress={() => setRemoveTarget(item)}
                  style={({ pressed }) => [
                    styles.ghostDanger,
                    pendingAnnouncementId !== null ? { opacity: 0.45 } : null,
                    pressed ? { backgroundColor: colors.dangerSoft } : null,
                  ]}
                >
                  {pendingAnnouncementId === item.id ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={styles.ghostDangerText}>{t('admin.deactivate')}</Text>
                  )}
                </Pressable>
              </View>
              {index < announcements.length - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))
        )}
      </Card>
       </>
      ) : null}

      {section === 'services' ? (
       <>
      <Card style={styles.sectionLead}>
        <Text style={styles.cardTitle}>
          {editingId ? t('admin.editService') : t('admin.addService')}
        </Text>
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
          hint={t('admin.phoneHint')}
        />
        <Field label={t('admin.address')} value={address} onChangeText={setAddress} />
        <Field
          label={t('admin.mapUrl', { defaultValue: 'Map link (optional)' })}
          value={mapUrl}
          onChangeText={setMapUrl}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://maps.app.goo.gl/..."
          hint={t('admin.mapUrlHint', {
            defaultValue: 'Paste the Google Maps share link so people get directions.',
          })}
        />
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
          placeholder={t('admin.upiPlaceholder')}
          hint={t('admin.upiPlaceholder')}
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
        ) : (
          // Helpers see verification state but cannot change it.
          <View style={styles.readonlyRow}>
            <Feather
              name={verified ? 'shield' : 'shield-off'}
              size={16}
              color={verified ? colors.success : colors.textSubtle}
            />
            <View style={styles.readonlyRowBody}>
              <Text style={styles.readonlyRowLabel}>
                {t('admin.verified')}: {verified ? t('common.verified') : t('admin.notVerified')}
              </Text>
              <Text style={styles.readonlyRowHint}>{t('admin.verifiedByAdmins')}</Text>
            </View>
          </View>
        )}

        {serviceError ? <Notice kind="error" message={serviceError} /> : null}
        {serviceSuccess ? <Notice kind="success" message={t('admin.saved')} /> : null}

        <View style={styles.formAction}>
          <Button
            label={editingId ? t('common.save') : t('admin.save')}
            onPress={saveService}
            loading={savingService}
            disabled={!serviceName.trim()}
          />
          {editingId ? (
            <View style={styles.formActionSecondary}>
              <Button
                label={t('admin.cancelEdit')}
                variant="secondary"
                onPress={cancelEditService}
              />
            </View>
          ) : null}
        </View>
      </Card>

      {/* Existing services — search, per-category counts, tap to edit, delete */}
      <Card style={styles.searchCard}>
        <Field
          label={t('admin.searchServices')}
          value={serviceSearch}
          onChangeText={setServiceSearch}
          placeholder={t('admin.searchServices')}
          autoCapitalize="none"
        />
        <View style={[styles.chipRow, { marginTop: space.md }]}>
          {/* Counts are dropped when the list failed to load — "0" would read
              as an empty city rather than a broken fetch (finding 14). */}
          <Chip
            label={t('common.all')}
            count={servicesError ? undefined : services.length}
            active={serviceFilter === 'all'}
            onPress={() => setServiceFilter('all')}
          />
          {SERVICE_CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={t(`categories.${c.key}`)}
              count={servicesError ? undefined : (serviceCounts[c.key] ?? 0)}
              active={serviceFilter === c.key}
              onPress={() => setServiceFilter(c.key)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.listCard}>
        {loadingServices ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.textMuted} />
            <Muted style={styles.stateText}>{t('common.loading')}</Muted>
          </View>
        ) : servicesError ? (
          <View style={styles.stateBlock}>
            <Feather name="alert-circle" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('common.errorLoading')}</Muted>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
              onPress={loadServices}
              style={({ pressed }) => [styles.retryButton, pressed ? { opacity: 0.6 } : null]}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : filteredServices.length === 0 ? (
          <View style={styles.stateBlock}>
            <Feather name="inbox" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('admin.servicesEmpty')}</Muted>
          </View>
        ) : (
          filteredServices.map((item, index) => (
            <View key={item.id}>
              <View style={styles.listRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('admin.editService')}: ${item.name}`}
                  onPress={() => startEditService(item)}
                  style={({ pressed }) => [styles.rowBody, pressed ? { opacity: 0.6 } : null]}
                >
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {t(`categories.${item.category}`)}
                    {item.phone ? ` · ${item.phone}` : ''}
                    {item.verified ? ` · ${t('common.verified')}` : ''}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('admin.deleteService')}
                  disabled={pendingServiceId !== null}
                  onPress={() => setServiceRemoveTarget(item)}
                  style={({ pressed }) => [
                    styles.ghostDanger,
                    pendingServiceId !== null ? { opacity: 0.45 } : null,
                    pressed ? { backgroundColor: colors.dangerSoft } : null,
                  ]}
                >
                  {pendingServiceId === item.id ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={styles.ghostDangerText}>{t('admin.deleteService')}</Text>
                  )}
                </Pressable>
              </View>
              {index < filteredServices.length - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))
        )}
      </Card>
       </>
      ) : null}

      {section === 'callbacks' ? (
       <>
      {/* Status filter — queued/spam rows used to have no home (finding 12). */}
      <Card style={styles.sectionLead}>
        <View style={styles.chipRow}>
          <Chip
            label={t('common.all')}
            count={callbacksError ? undefined : callbacks.length}
            active={callbackFilter === 'all'}
            onPress={() => setCallbackFilter('all')}
          />
          {CALLBACK_STATUSES.map((status) => (
            <Chip
              key={status}
              label={t(`admin.status_${status}`, {
                defaultValue: CALLBACK_STATUS_FALLBACK[status] ?? status,
              })}
              count={callbacksError ? undefined : (callbackCounts[status] ?? 0)}
              active={callbackFilter === status}
              onPress={() => setCallbackFilter(status)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.listCard}>
        {loadingCallbacks ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.textMuted} />
            <Muted style={styles.stateText}>{t('common.loading')}</Muted>
          </View>
        ) : callbacksError ? (
          <View style={styles.stateBlock}>
            <Feather name="alert-circle" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('common.errorLoading')}</Muted>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
              onPress={loadCallbacks}
              style={({ pressed }) => [styles.retryButton, pressed ? { opacity: 0.6 } : null]}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : callbacks.length === 0 ? (
          <View style={styles.stateBlock}>
            <Feather name="phone-missed" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('admin.callbacksEmpty')}</Muted>
          </View>
        ) : filteredCallbacks.length === 0 ? (
          <View style={styles.stateBlock}>
            <Feather name="filter" size={20} color={colors.textSubtle} />
            <Muted style={styles.stateText}>{t('common.noResults')}</Muted>
          </View>
        ) : (
          filteredCallbacks.map((item, index) => (
            <View key={item.id}>
              <View style={styles.callbackRow}>
                <View style={styles.callbackHeader}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowSubtitle}>{item.phone}</Text>
                  </View>
                  <Badge
                    label={t(`admin.status_${item.status}`, {
                      defaultValue: CALLBACK_STATUS_FALLBACK[item.status] ?? item.status,
                    })}
                    color={callbackStatusColor(item.status)}
                  />
                </View>
                {item.issue ? (
                  <Text style={styles.callbackIssue}>{item.issue}</Text>
                ) : null}
                <Text style={styles.rowMeta}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
                {item.status !== 'closed' ? (
                  <View style={styles.callbackActions}>
                    {item.status !== 'contacted' && item.status !== 'spam' ? (
                      <Button
                        label={t('admin.callbackMarkContacted')}
                        variant="secondary"
                        loading={isCallbackPending(item.id, 'contacted')}
                        disabled={pendingCallback !== null}
                        onPress={() => setCallbackStatus(item.id, 'contacted')}
                      />
                    ) : null}
                    <Button
                      label={t('admin.callbackMarkClosed')}
                      variant="secondary"
                      loading={isCallbackPending(item.id, 'closed')}
                      disabled={pendingCallback !== null}
                      onPress={() => setCallbackStatus(item.id, 'closed')}
                    />
                    {item.status !== 'spam' ? (
                      <Button
                        label={t('admin.callbackMarkSpam', { defaultValue: 'Mark spam' })}
                        variant="secondary"
                        loading={isCallbackPending(item.id, 'spam')}
                        disabled={pendingCallback !== null}
                        onPress={() => setCallbackStatus(item.id, 'spam')}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
              {index < filteredCallbacks.length - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          ))
        )}
      </Card>
       </>
      ) : null}

      {/* City helpers (admins appoint trusted locals) */}
      {isAdmin && section === 'helpers' ? (
        <>
          <Card style={styles.sectionLead}>
            <Text style={styles.cardTitle}>{t('admin.addHelper')}</Text>
            <Muted style={styles.screenSubtitle}>{t('admin.helperHint')}</Muted>
            <Field
              label={t('admin.helperUsername')}
              value={helperUsername}
              onChangeText={setHelperUsername}
              autoCapitalize="none"
              hint={t('admin.helperUsernameHint')}
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
            ) : helpersError ? (
              <View style={styles.stateBlock}>
                <Feather name="alert-circle" size={20} color={colors.textSubtle} />
                <Muted style={styles.stateText}>{t('common.errorLoading')}</Muted>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  onPress={loadHelpers}
                  style={({ pressed }) => [styles.retryButton, pressed ? { opacity: 0.6 } : null]}
                >
                  <Text style={styles.retryText}>{t('common.retry')}</Text>
                </Pressable>
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
      </ScrollView>

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

      {/* Service delete confirmation */}
      <Dialog
        visible={serviceRemoveTarget !== null}
        onClose={() => setServiceRemoveTarget(null)}
        title={t('admin.deleteService')}
      >
        {serviceRemoveTarget ? (
          <>
            <Text style={styles.dialogTitleText}>{serviceRemoveTarget.name}</Text>
            <Text style={styles.dialogBody}>{t('admin.deleteServiceConfirm')}</Text>
          </>
        ) : null}
        <View style={styles.dialogActions}>
          <Button
            label={t('admin.deleteService')}
            variant="danger"
            onPress={confirmRemoveService}
          />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setServiceRemoveTarget(null)}
          />
        </View>
      </Dialog>

      {/* Destructive confirmation — shows the full announcement being removed */}
      <Dialog
        visible={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={t('admin.deactivate')}
      >
        {removeTarget ? (
          <>
            <Text style={styles.dialogTitleText}>{removeTarget.title}</Text>
            <ScrollView style={styles.dialogScroll}>
              <Text style={styles.dialogBody}>{removeTarget.body}</Text>
            </ScrollView>
          </>
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
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    tabBar: {
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tabBarContent: {
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      alignItems: 'center',
    },
    screenSubtitle: {
      marginTop: space.xs,
    },
    roleBadgeRow: {
      flexDirection: 'row',
    },
    sectionLead: {
      marginTop: space.md,
    },
    sectionHeader: {
      marginTop: space.lg,
      marginBottom: 12,
    },
    gateLoading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      padding: space.lg,
    },
    searchCard: {
      marginTop: 12,
    },
    formActionSecondary: {
      marginTop: space.sm,
    },
    readonlyRow: {
      marginTop: space.md,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      paddingVertical: 12,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
    },
    readonlyRowBody: {
      flex: 1,
    },
    readonlyRowLabel: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.text,
    },
    readonlyRowHint: {
      fontSize: font.xs,
      fontFamily: family.regular,
      lineHeight: Math.round(font.xs * 1.5),
      color: colors.textSubtle,
      marginTop: 2,
    },
    callbackRow: {
      paddingHorizontal: space.md,
      paddingVertical: 12,
    },
    callbackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    callbackIssue: {
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
      color: colors.textMuted,
      marginTop: space.sm,
    },
    callbackActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: space.md,
    },
    dialogTitleText: {
      fontSize: font.md,
      fontFamily: family.semibold,
      color: colors.text,
      marginTop: space.sm,
    },
    dialogScroll: {
      maxHeight: 200,
      marginTop: space.xs,
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
    // Retry used to be a bare 21x41 text hit box — below the 56px TAP floor
    // this app holds itself to for elder users (finding 10).
    retryButton: {
      minHeight: TAP,
      minWidth: TAP,
      paddingHorizontal: space.md,
      alignItems: 'center',
      justifyContent: 'center',
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
