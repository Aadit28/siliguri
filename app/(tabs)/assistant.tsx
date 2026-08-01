import React, { useEffect, useRef, useState } from 'react';
import type { TextInputKeyPressEvent } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { Muted, DialFallbackDialog, Dialog, Sheet, Button } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import {
  requestAssistantPlan,
  AssistantAction,
  AssistantAttachment,
  AssistantMessage,
  AssistantPlan,
  AssistantPlanContext,
  ProposedReminder,
} from '../../src/lib/assistant';
import { addEvent, listEvents, parseWhenToDate, toLocalISODate } from '../../src/lib/calendar';
import { appendTurn, buildAssistantContext } from '../../src/lib/memory';
import { ensureMicPermission, speechRecognitionSupported, startListening, speak, stopSpeaking, voiceErrorKey } from '../../src/lib/voice';
import { fetchServices, toggleFavorite as toggleFavoriteRemote } from '../../src/lib/api';
import { notifyFamilySos } from '../../src/lib/family';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { categoryColor } from '../../src/lib/categories';
import { openUpiPayment } from '../../src/lib/payments';
import { family, font, radius, space, shadow, TAB_BAR_CLEARANCE, TAP } from '../../src/lib/theme';
import { Service } from '../../src/lib/types';
import { openWhatsAppCall, openWhatsAppShare } from '../../src/lib/whatsapp';

const EXAMPLE_KEYS = ['doctor', 'medicine', 'travel', 'reminder'] as const;
// 1 line = 23.4 text + 20 vertical padding; 3 lines = 90.2.
const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_MAX_HEIGHT = 91;
// Browser default focus ring draws a heavy black rect around the pill; the filled
// pill + caret is the focus affordance instead.
const WEB_INPUT_RESET = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as object) : null;
const MAX_IMAGE_ATTACHMENTS = 3;
const MAX_CHAT_SESSIONS = 12;
const CHAT_STORAGE_KEY = 'saathi-assistant-chats-v1';
const MAX_STORED_MESSAGES_PER_CHAT = 40;
// Covers the whole plan request incl. slow body reads (backendRequest only
// times out the initial fetch, not res.json()), so "Typing…" can't hang forever.
const PLAN_TIMEOUT_MS = 20000;

type PayPrompt = { upiId: string; payeeName?: string | null; amount?: string | null };

// Targets for the planner's open_screen action payloads (see src/lib/assistant.ts).
const SCREEN_ROUTES: Record<string, string> = {
  calendar: '/calendar',
  services: '/services',
  community: '/community',
  help: '/help',
  connectors: '/connectors',
};

type ComposerKeyPressEvent = TextInputKeyPressEvent & {
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
  nativeEvent: TextInputKeyPressEvent['nativeEvent'] & {
    shiftKey?: boolean;
  };
};

type ChatSession = {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  messages: AssistantMessage[];
};

type ChatState = {
  activeSessionId: string;
  sessions: ChatSession[];
};

let cachedInitialChatState: ChatState | null = null;

const VOICE_REPLIES_KEY = 'saathi-assistant-voice-replies';

function loadVoiceRepliesPref(): boolean {
  const storage = getWebStorage();
  if (!storage) return false;
  try {
    return storage.getItem(VOICE_REPLIES_KEY) === '1';
  } catch {
    return false;
  }
}

function saveVoiceRepliesPref(value: boolean) {
  const storage = getWebStorage();
  if (!storage) return;
  try {
    storage.setItem(VOICE_REPLIES_KEY, value ? '1' : '0');
  } catch {
    // Storage full/unavailable — the toggle still works for this visit.
  }
}

// What the assistant knows about this user for a personalised plan: their
// name, their own upcoming calendar, device-local memory facts, and today's
// LOCAL date (the server needs it to resolve "tomorrow" in reminders).
async function buildPlanContext(name?: string | null): Promise<AssistantPlanContext> {
  const todayISO = toLocalISODate(new Date());
  const [memoryContext, events] = await Promise.all([
    buildAssistantContext().catch(() => ({ facts: [], recentTurns: [] })),
    listEvents().catch(() => []),
  ]);
  return {
    profile: name ? { name } : undefined,
    todayISO,
    calendar: events
      .filter((event) => event.dateISO >= todayISO)
      .slice(0, 20)
      .map((event) => ({ title: event.title, dateISO: event.dateISO, time: event.time ?? null })),
    facts: memoryContext.facts,
    recentTurns: memoryContext.recentTurns,
  };
}

export default function AssistantScreen() {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { session, displayName } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const initialChatState = getInitialChatState(t);
  const [services, setServices] = useState<Service[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  // One text line incl. vertical padding; grows via onContentSizeChange to 3 lines max.
  const [inputHeight, setInputHeight] = useState(COMPOSER_MIN_HEIGHT);

  useEffect(() => {
    if (!input) setInputHeight(COMPOSER_MIN_HEIGHT);
  }, [input]);

  function handleInputContentSize(event: { nativeEvent: { contentSize: { height: number } } }) {
    const raw = event?.nativeEvent?.contentSize?.height || 0;
    // react-native-web reports scrollHeight (padding included); native reports text box only.
    const padded = Platform.OS === 'web' ? raw : raw + 20;
    setInputHeight(Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, Math.round(padded))));
  }
  const [sessions, setSessions] = useState<ChatSession[]>(() => initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(() => initialChatState.activeSessionId);
  const [loading, setLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [payPrompt, setPayPrompt] = useState<PayPrompt | null>(null);
  // Holds the number when a call handoff fails, so it can be shown to dial by hand.
  const [dialFallback, setDialFallback] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const submitInFlightRef = useRef(false);
  // ----- Voice agent state -----
  const canDictate = speechRecognitionSupported();
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(loadVoiceRepliesPref);
  // Message ids whose proposed reminder was saved (disables the card's button).
  const [savedReminderIds, setSavedReminderIds] = useState<Set<string>>(() => new Set());
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  const voiceRepliesRef = useRef(voiceReplies);
  voiceRepliesRef.current = voiceReplies;
  // Whether the last submitted turn arrived by voice — the hands-free loop
  // only re-opens the mic after replying to a spoken turn, never a typed one.
  const lastInputWasVoiceRef = useRef(false);
  const canAttachImages = getWebDocument() !== null;
  const activeSession = sessions.find((sessionItem) => sessionItem.id === activeSessionId) ?? sessions[0];
  const messages = activeSession.messages;
  const { isComputerMode } = useDisplayMode();
  const showSideHistory = isComputerMode && width >= 900;

  useEffect(() => {
    let mounted = true;
    fetchServices()
      .then((items) => {
        if (mounted) setServices(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setServicesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, loading]);

  useEffect(() => {
    setSessions((current) =>
      current.map((sessionItem) =>
        sessionItem.messages.length === 1 && sessionItem.messages[0].id === 'welcome'
          ? {
              ...sessionItem,
              title: t('assistant.newChat'),
              preview: t('assistant.simpleWelcome'),
              messages: [welcomeMessage(t('assistant.simpleWelcome'))],
            }
          : sessionItem,
      ),
    );
  }, [t]);

  useEffect(() => {
    if (!sessions.some((sessionItem) => sessionItem.id === activeSessionId)) {
      const fallbackSession = sessions[0];
      if (fallbackSession) setActiveSessionId(fallbackSession.id);
    }
  }, [activeSessionId, sessions, t]);

  useEffect(() => {
    saveChatState({ activeSessionId, sessions });
  }, [activeSessionId, sessions]);

  useEffect(() => {
    const documentRef = getWebDocument();
    if (!documentRef) return undefined;

    const handlePaste = (event: any) => {
      const items = Array.from(event.clipboardData?.items ?? []) as any[];
      const files = items
        .filter((item) => String(item?.type || '').startsWith('image/'))
        .map((item) => item.getAsFile?.())
        .filter(Boolean);

      if (!files.length) return;
      event.preventDefault?.();
      void readImageFiles(files).then((next) => {
        if (next.length) appendAttachments(next);
      });
    };

    documentRef.addEventListener('paste', handlePaste);
    return () => documentRef.removeEventListener('paste', handlePaste);
  }, []);

  function appendAttachments(next: AssistantAttachment[]) {
    setAttachments((current) => [...current, ...next].slice(0, MAX_IMAGE_ATTACHMENTS));
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function pickImages() {
    const documentRef = getWebDocument();
    if (!documentRef || loading || servicesLoading) return;

    const inputNode = documentRef.createElement('input');
    inputNode.type = 'file';
    inputNode.accept = 'image/*';
    inputNode.multiple = true;
    inputNode.onchange = () => {
      const files = Array.from(inputNode.files ?? []);
      void readImageFiles(files).then((next) => {
        if (next.length) appendAttachments(next);
      });
    };
    inputNode.click();
  }

  function updateMessagesForSession(sessionId: string, updater: (current: AssistantMessage[]) => AssistantMessage[]) {
    setSessions((current) =>
      current.map((sessionItem) => {
        if (sessionItem.id !== sessionId) return sessionItem;
        const nextMessages = updater(sessionItem.messages);
        return summarizeSession({
          ...sessionItem,
          messages: nextMessages,
          updatedAt: Date.now(),
        }, t);
      }),
    );
  }

  function updateActiveMessages(updater: (current: AssistantMessage[]) => AssistantMessage[]) {
    updateMessagesForSession(activeSessionId, updater);
  }

  function appendAssistantNote(text: string) {
    updateActiveMessages((current) => {
      // The same note twice in a row (repeated mic failures) reads as spam.
      const last = current[current.length - 1];
      if (last?.role === 'assistant' && last.text === text) return current;
      return [...current, { id: `note-${Date.now()}`, role: 'assistant', text }];
    });
  }

  function startNewChat() {
    if (loading) return;
    const nextSession = newChatSession(t);
    setSessions((current) => [nextSession, ...current].slice(0, MAX_CHAT_SESSIONS));
    setActiveSessionId(nextSession.id);
    setInput('');
    setAttachments([]);
    setChatSheetOpen(false);
  }

  function selectChat(id: string) {
    if (loading) return;
    setActiveSessionId(id);
    setInput('');
    setAttachments([]);
    setChatSheetOpen(false);
  }

  async function confirmPay() {
    const prompt = payPrompt;
    if (!prompt) return;
    setPayPrompt(null);
    const opened = await openUpiPayment({
      upiId: prompt.upiId,
      name: prompt.payeeName,
      amount: prompt.amount,
    });
    if (!opened) {
      // No UPI app on this device (e.g. web): leave the id so they can pay by hand.
      appendAssistantNote(`${t('pay.webFallback')} ${prompt.upiId}`);
    }
  }

  async function runPlan(targetSessionId: string, body: string, currentAttachments: AssistantAttachment[]) {
    setLoading(true);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // Best-effort personalisation; a failed context read must not block the
      // plan. The context is built BEFORE this turn is recorded, then the turn
      // is appended, so "recentTurns" means previous turns, not this one twice.
      const context = await buildPlanContext(displayName).catch(() => null);
      if (body) void appendTurn({ role: 'user', text: body }).catch(() => undefined);
      const plan = await Promise.race([
        requestAssistantPlan({
          message: body,
          services,
          lang: lang === 'hi' ? 'hi' : 'en',
          imageAttachments: currentAttachments,
          token: session?.access_token,
          context,
        }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('plan-timeout')), PLAN_TIMEOUT_MS);
        }),
      ]);

      const reply = [plan.summary, plan.followUpQuestion].filter(Boolean).join('\n\n');
      void appendTurn({ role: 'assistant', text: reply }).catch(() => undefined);
      updateMessagesForSession(targetSessionId, (current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: reply,
          plan,
        },
      ]);
      if (voiceRepliesRef.current) {
        // Speak the reply; after a SPOKEN question, reopen the mic so the
        // conversation continues hands-free.
        void speak(reply, lang === 'hi' ? 'hi' : 'en', () => {
          if (lastInputWasVoiceRef.current && voiceRepliesRef.current && !dictationRef.current) {
            void startVoiceInput();
          }
        });
      }
    } catch {
      updateMessagesForSession(targetSessionId, (current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: t('common.errorLoading'),
          errorRetry: { message: body, attachments: currentAttachments },
        },
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      submitInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function startVoiceInput() {
    if (loading || servicesLoading || dictationRef.current) return;
    stopSpeaking();
    // iOS Safari won't prompt for the mic from recognition alone; getUserMedia
    // in the same tap raises the permission dialog.
    const permission = await ensureMicPermission();
    if (permission === 'blocked') {
      appendAssistantNote(t('assistant.voice.micBlocked'));
      return;
    }
    if (dictationRef.current) return;
    const handle = startListening({
      lang: lang === 'hi' ? 'hi' : 'en',
      onInterim: (text) => setInput(text),
      onResult: (text) => {
        lastInputWasVoiceRef.current = true;
        setInput('');
        void submit(text, { spoken: true });
      },
      onEnd: () => {
        dictationRef.current = null;
        setListening(false);
      },
      onError: (code) => {
        appendAssistantNote(t(`assistant.voice.${voiceErrorKey(code)}`));
      },
    });
    if (!handle) {
      appendAssistantNote(t('assistant.voice.unsupported'));
      return;
    }
    dictationRef.current = handle;
    setListening(true);
  }

  function stopVoiceInput() {
    dictationRef.current?.stop();
    dictationRef.current = null;
    setListening(false);
    setInput('');
  }

  function toggleVoiceReplies() {
    setVoiceReplies((current) => {
      const next = !current;
      saveVoiceRepliesPref(next);
      if (!next) stopSpeaking();
      return next;
    });
  }

  // Leaving the screen must release the mic and the speaker.
  useEffect(
    () => () => {
      dictationRef.current?.stop();
      dictationRef.current = null;
      stopSpeaking();
    },
    [],
  );

  // Urgent plans: one tap tells every linked guardian, alongside (never
  // instead of) the emergency call actions. Tracked per message so the chip
  // reads "family alerted" after firing instead of inviting repeat taps.
  const [alertedMessageIds, setAlertedMessageIds] = useState<Set<string>>(() => new Set());

  function alertFamilyFromPlan(messageId: string) {
    const token = session?.access_token;
    if (!token || alertedMessageIds.has(messageId)) return;
    notifyFamilySos(token);
    setAlertedMessageIds((current) => new Set(current).add(messageId));
    appendAssistantNote(t('assistant.familyAlerted'));
  }

  async function saveProposedReminder(messageId: string, reminder: ProposedReminder) {
    if (savedReminderIds.has(messageId)) return;
    try {
      const event = await addEvent({
        title: reminder.title,
        dateISO: reminder.dateISO,
        time: reminder.time,
        repeat: reminder.repeat,
      });
      setSavedReminderIds((current) => new Set(current).add(messageId));
      appendAssistantNote(
        event.alertProblem ? t('assistant.reminderCard.savedNoAlert') : t('assistant.reminderCard.saved'),
      );
    } catch {
      appendAssistantNote(t('reminders.saveFailed'));
    }
  }

  async function submit(text = input, { spoken = false }: { spoken?: boolean } = {}) {
    const body = text.trim();
    const currentAttachments = attachments;
    const hasContent = Boolean(body || currentAttachments.length);
    if (!hasContent || loading || servicesLoading || submitInFlightRef.current) return;
    if (!spoken) lastInputWasVoiceRef.current = false;

    submitInFlightRef.current = true;
    const targetSessionId = activeSessionId;
    const userText = body || t('assistant.imageOnlyMessage');
    updateMessagesForSession(targetSessionId, (current) => [
      ...current,
      {
        id: `u-${Date.now()}`,
        role: 'user',
        text: userText,
        attachments: currentAttachments,
      },
    ]);
    setInput('');
    setAttachments([]);

    await runPlan(targetSessionId, body, currentAttachments);
  }

  function retryPlan(errorMessageId: string, payload: { message: string; attachments?: AssistantAttachment[] }) {
    if (loading || servicesLoading || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    const targetSessionId = activeSessionId;
    // Drop the failed bubble so the thread doesn't stack duplicate errors on retry.
    updateMessagesForSession(targetSessionId, (current) =>
      current.filter((message) => message.id !== errorMessageId),
    );
    void runPlan(targetSessionId, payload.message, payload.attachments ?? []);
  }

  function handleComposerKeyPress(event: ComposerKeyPressEvent) {
    const key = event.key ?? event.nativeEvent.key;
    const shiftKey = event.shiftKey ?? event.nativeEvent.shiftKey ?? false;
    if (key !== 'Enter' || shiftKey) return;

    event.preventDefault?.();
    submit();
  }

  function handleAction(action: AssistantAction, plan?: AssistantPlan) {
    // Every outbound handoff must report failure. A rejected openURL used to
    // resolve into nothing at all, so the chip looked dead on press.
    if (action.kind === 'call' && action.value) {
      const number = action.value;
      openWhatsAppCall(number).catch(() => setDialFallback(number));
      return;
    }
    if ((action.kind === 'directions' || action.kind === 'source') && action.value) {
      Linking.openURL(action.value).catch(() => appendAssistantNote(t('assistant.linkFailed', {
        defaultValue: 'That link could not be opened on this device.',
      })));
      return;
    }
    if (action.kind === 'add_calendar' && action.value) {
      const payload = parseActionPayload(action.value);
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (title) {
        const { dateISO, time } = parseWhenToDate(typeof payload?.when === 'string' ? payload.when : '');
        const service = plan?.suggestedServices.find((item) => item.id === action.serviceId) ?? null;
        addEvent({
          title,
          dateISO,
          time,
          serviceId: action.serviceId ?? null,
          serviceName: service?.name ?? null,
          servicePhone: service?.phone ?? null,
        })
          .then(() => appendAssistantNote(t('assistant.addedToCalendar')))
          .catch(() => appendAssistantNote(t('common.errorLoading')));
        return;
      }
    }
    if (action.kind === 'pay' && action.value) {
      const payee = plan?.suggestedServices.find((item) => item.id === action.serviceId)?.name;
      // The pay action value is normally the bare UPI id, but tolerate a JSON
      // payload carrying an amount for when the planner starts sending one.
      const payload = parseActionPayload(action.value);
      const upiId = payload && typeof payload.upiId === 'string' ? payload.upiId : action.value;
      const amount =
        payload && (typeof payload.amount === 'string' || typeof payload.amount === 'number')
          ? String(payload.amount)
          : null;
      // Never fire the UPI intent straight from a tap: confirm recipient first
      // so an elderly user cannot pay a stranger by a mis-tap.
      setPayPrompt({ upiId, payeeName: payee ?? null, amount });
      return;
    }
    if (action.kind === 'book_ride') {
      const payload = parseActionPayload(action.value);
      const rideUrl =
        typeof payload?.url === 'string' && /^https?:\/\//i.test(payload.url)
          ? payload.url
          : action.value && /^https?:\/\//i.test(action.value)
            ? action.value
            : null;
      if (rideUrl) {
        Linking.openURL(rideUrl).catch(() => appendAssistantNote(t('assistant.linkFailed', {
          defaultValue: 'That link could not be opened on this device.',
        })));
        return;
      }
      // No bookable link in the payload yet; fall through to the composer prompt.
    }
    if (action.kind === 'open_screen') {
      const payload = parseActionPayload(action.value);
      const target = SCREEN_ROUTES[String(payload?.screen ?? '')];
      if (target) {
        router.push(target);
        return;
      }
    }
    if (action.kind === 'family_update' && plan) {
      // Hand off to WhatsApp instead of stuffing the composer — sending the canned
      // text back into the assistant just produced a nonsense round-trip.
      openWhatsAppShare(`${t('assistant.familyMessagePrefix')}\n${plan.summary}`);
      return;
    }
    setInput((current) => current || t('assistant.detailPrompt'));
  }

  const canSend = Boolean(input.trim() || attachments.length) && !loading && !servicesLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader title={t('assistant.title')} />

      <View
        style={[
          styles.assistantLayout,
          !showSideHistory ? styles.assistantLayoutStacked : null,
          !isComputerMode ? styles.assistantLayoutPhone : null,
        ]}
      >
        <View
          style={[
            styles.historyPanel,
            !showSideHistory ? styles.historyPanelStacked : null,
            { backgroundColor: colors.cardSolid, borderColor: colors.border },
          ]}
        >
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{t('assistant.chatHistory')}</Text>
            <TouchableOpacity
              onPress={startNewChat}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t('assistant.newChat')}
              activeOpacity={0.82}
              style={[styles.newChatButton, { backgroundColor: colors.primary, opacity: loading ? 0.72 : 1 }]}
            >
              <Text style={[styles.newChatButtonText, { color: colors.primaryFg }]}>
                {t('assistant.newChat')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.historyList}
            horizontal={!showSideHistory}
            contentContainerStyle={[
              styles.historyListContent,
              !showSideHistory ? styles.historyListContentStacked : null,
            ]}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            {sessions.map((sessionItem) => {
              const active = sessionItem.id === activeSessionId;
              return (
                <TouchableOpacity
                  key={sessionItem.id}
                  onPress={() => selectChat(sessionItem.id)}
                  disabled={loading && !active}
                  accessibilityRole="button"
                  accessibilityLabel={sessionItem.title}
                  activeOpacity={0.82}
                  style={[
                    styles.historyItem,
                    !showSideHistory ? styles.historyItemStacked : null,
                    {
                      backgroundColor: active ? colors.primaryTint : colors.bgAlt,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: loading && !active ? 0.55 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.historyItemTitle, { color: active ? colors.primaryDark : colors.text }]} numberOfLines={1}>
                    {sessionItem.title}
                  </Text>
                  <Text style={[styles.historyPreview, { color: colors.textMuted }]} numberOfLines={2}>
                    {sessionItem.preview}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.chatShell}>
          <View style={styles.statusRow}>
            <Muted style={styles.statusText}>
              {listening
                ? t('assistant.voice.listening')
                : servicesLoading
                  ? t('assistant.loadingServices')
                  : t('assistant.botStatus')}
            </Muted>
            <View style={styles.statusActions}>
              <TouchableOpacity
                onPress={toggleVoiceReplies}
                accessibilityRole="button"
                accessibilityLabel={t(voiceReplies ? 'assistant.voice.repliesOn' : 'assistant.voice.repliesOff')}
                activeOpacity={0.82}
                style={[
                  styles.mobileNewChat,
                  styles.chatsButton,
                  {
                    borderColor: voiceReplies ? colors.primary : colors.border,
                    backgroundColor: voiceReplies ? colors.primaryTint : 'transparent',
                  },
                ]}
              >
                <Feather name={voiceReplies ? 'volume-2' : 'volume-x'} size={16} color={voiceReplies ? colors.primaryDark : colors.text} />
                <Text style={[styles.mobileNewChatText, { color: voiceReplies ? colors.primaryDark : colors.text }]}>
                  {t('assistant.voice.repliesLabel')}
                </Text>
              </TouchableOpacity>
              {!showSideHistory ? (
                <>
                <TouchableOpacity
                  onPress={() => setChatSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.chatHistory')}
                  activeOpacity={0.82}
                  style={[styles.mobileNewChat, styles.chatsButton, { borderColor: colors.border }]}
                >
                  <Feather name="message-square" size={16} color={colors.text} />
                  <Text style={[styles.mobileNewChatText, { color: colors.text }]}>
                    {t('assistant.chatHistory')}
                  </Text>
                  {sessions.length > 1 ? (
                    <View style={[styles.chatsCount, { backgroundColor: colors.primaryTint }]}>
                      <Text style={[styles.chatsCountText, { color: colors.text }]}>{sessions.length}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={startNewChat}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.newChat')}
                  activeOpacity={0.82}
                  style={[styles.mobileNewChat, { borderColor: colors.border, opacity: loading ? 0.5 : 1 }]}
                >
                  <Text style={[styles.mobileNewChatText, { color: colors.text }]}>{t('assistant.newChat')}</Text>
                </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onAction={handleAction}
                onRetry={retryPlan}
                onCallFailed={setDialFallback}
                onSaveReminder={saveProposedReminder}
                reminderSaved={savedReminderIds.has(message.id)}
                onAlertFamily={session?.access_token ? alertFamilyFromPlan : undefined}
                familyAlerted={alertedMessageIds.has(message.id)}
              />
            ))}

            {loading ? (
              <View style={styles.botRow}>
                <SmallAvatar />
                <View style={[styles.typingBubble, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.typingText, { color: colors.textMuted }]}>
                    {t('assistant.typing')}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.composer}>
            <View style={[styles.inputBar, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <View>
                {plusMenuOpen ? (
                  <View style={[styles.plusMenu, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                    {canAttachImages ? (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            setPlusMenuOpen(false);
                            pickImages();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('assistant.attachImage')}
                          activeOpacity={0.82}
                          style={styles.plusMenuItem}
                        >
                          <Feather name="image" size={18} color={colors.text} />
                          <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                            {t('assistant.attachImage')}
                          </Text>
                        </TouchableOpacity>
                        <View style={[styles.plusMenuDivider, { backgroundColor: colors.border }]} />
                      </>
                    ) : null}
                    {EXAMPLE_KEYS.map((key) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => {
                          setPlusMenuOpen(false);
                          if (loading || servicesLoading) return;
                          submit(t(`assistant.examples.${key}`));
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t(`assistant.exampleLabels.${key}`)}
                        activeOpacity={0.82}
                        style={styles.plusMenuItem}
                      >
                        <Feather name="message-circle" size={18} color={colors.textMuted} />
                        <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                          {t(`assistant.exampleLabels.${key}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => setPlusMenuOpen((open) => !open)}
                  disabled={loading || servicesLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.attachImage')}
                  activeOpacity={0.82}
                  hitSlop={8}
                  style={[styles.plusButton, { opacity: loading || servicesLoading ? 0.4 : 1 }]}
                >
                  <Feather name="plus" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TextInput
                multiline
                blurOnSubmit={false}
                submitBehavior="submit"
                returnKeyType="send"
                value={input}
                onChangeText={setInput}
                onKeyPress={handleComposerKeyPress}
                onSubmitEditing={() => submit()}
                onFocus={() => setPlusMenuOpen(false)}
                onContentSizeChange={handleInputContentSize}
                placeholder={t('assistant.chatPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.input,
                  WEB_INPUT_RESET,
                  {
                    height: inputHeight,
                    color: colors.text,
                  },
                ]}
              />
              {canDictate ? (
                <TouchableOpacity
                  onPress={() => (listening ? stopVoiceInput() : void startVoiceInput())}
                  disabled={loading || servicesLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t(listening ? 'assistant.voice.stop' : 'assistant.voice.start')}
                  activeOpacity={0.82}
                  hitSlop={8}
                  style={[
                    styles.micButton,
                    {
                      backgroundColor: listening ? colors.dangerSoft : 'transparent',
                      opacity: loading || servicesLoading ? 0.4 : 1,
                    },
                  ]}
                >
                  <Feather name={listening ? 'mic-off' : 'mic'} size={20} color={listening ? colors.danger : colors.text} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => submit()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={t('assistant.chatSend')}
                activeOpacity={0.82}
                hitSlop={8}
                style={[
                  styles.sendButton,
                  {
                    // Distinct disabled fill (not just faded primary) so the
                    // inactive state reads clearly for low-vision users.
                    backgroundColor: canSend ? colors.primary : colors.chipBg,
                    borderColor: colors.border,
                    borderWidth: canSend ? 0 : 1,
                  },
                ]}
              >
                <Feather name="arrow-up" size={20} color={canSend ? colors.primaryFg : colors.textSubtle} />
              </TouchableOpacity>
            </View>

            {attachments.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attachmentList}
                keyboardShouldPersistTaps="handled"
              >
                {attachments.map((attachment) => (
                  <View key={attachment.id} style={[styles.attachmentPreview, { borderColor: colors.border }]}>
                    <Image source={{ uri: attachment.uri }} style={styles.attachmentPreviewImage} />
                    <TouchableOpacity
                      onPress={() => removeAttachment(attachment.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('assistant.removeImage')}
                      activeOpacity={0.82}
                      hitSlop={8}
                      style={[styles.removeAttachmentButton, { backgroundColor: colors.cardSolid }]}
                    >
                      <Text style={[styles.removeAttachmentText, { color: colors.text }]}>x</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </View>

      <Sheet visible={chatSheetOpen} onClose={() => setChatSheetOpen(false)} title={t('assistant.chatHistory')}>
        <TouchableOpacity
          onPress={startNewChat}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('assistant.newChat')}
          activeOpacity={0.82}
          style={[styles.sheetNewChat, { backgroundColor: colors.primary, opacity: loading ? 0.72 : 1 }]}
        >
          <Feather name="plus" size={18} color={colors.primaryFg} />
          <Text style={[styles.sheetNewChatText, { color: colors.primaryFg }]}>{t('assistant.newChat')}</Text>
        </TouchableOpacity>
        <ScrollView
          style={styles.sheetChatList}
          contentContainerStyle={styles.sheetChatListContent}
          showsVerticalScrollIndicator={false}
        >
          {sessions.map((sessionItem) => {
            const active = sessionItem.id === activeSessionId;
            return (
              <TouchableOpacity
                key={sessionItem.id}
                onPress={() => selectChat(sessionItem.id)}
                disabled={loading && !active}
                accessibilityRole="button"
                accessibilityLabel={sessionItem.title}
                activeOpacity={0.82}
                style={[
                  styles.historyItem,
                  {
                    backgroundColor: active ? colors.primaryTint : colors.bgAlt,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: loading && !active ? 0.55 : 1,
                  },
                ]}
              >
                <Text style={[styles.historyItemTitle, { color: active ? colors.primaryDark : colors.text }]} numberOfLines={1}>
                  {sessionItem.title}
                </Text>
                <Text style={[styles.historyPreview, { color: colors.textMuted }]} numberOfLines={2}>
                  {sessionItem.preview}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Sheet>

      <Dialog visible={payPrompt !== null} onClose={() => setPayPrompt(null)} title={t('pay.payUpi')}>
        {payPrompt?.payeeName ? (
          <Text style={[styles.payPayee, { color: colors.text }]}>{payPrompt.payeeName}</Text>
        ) : null}
        <View style={[styles.payDetails, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
          <Text style={[styles.payUpiId, { color: colors.text }]} selectable>{payPrompt?.upiId}</Text>
          {payPrompt?.amount ? (
            <Text style={[styles.payAmount, { color: colors.text }]}>{`₹${payPrompt.amount}`}</Text>
          ) : null}
        </View>
        <Text style={[styles.payHint, { color: colors.textMuted }]}>{t('pay.upiHint')}</Text>
        <View style={styles.payActions}>
          <View style={styles.payActionButton}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setPayPrompt(null)} />
          </View>
          <View style={styles.payActionButton}>
            <Button
              label={payPrompt?.payeeName ? t('pay.payTo', { name: payPrompt.payeeName }) : t('pay.payUpi')}
              onPress={() => void confirmPay()}
            />
          </View>
        </View>
      </Dialog>

      <DialFallbackDialog number={dialFallback} onClose={() => setDialFallback(null)} />
    </View>
  );
}

function MessageBubble({
  message,
  onAction,
  onRetry,
  onCallFailed,
  onSaveReminder,
  reminderSaved,
  onAlertFamily,
  familyAlerted,
}: {
  message: AssistantMessage;
  onAction: (action: AssistantAction, plan?: AssistantPlan) => void;
  onRetry: (errorMessageId: string, payload: { message: string; attachments?: AssistantAttachment[] }) => void;
  onCallFailed: (number: string) => void;
  onSaveReminder: (messageId: string, reminder: ProposedReminder) => void;
  reminderSaved: boolean;
  onAlertFamily?: (messageId: string) => void;
  familyAlerted: boolean;
}) {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { favoriteSet, toggleFavorite } = useServicePreferences();
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const isUser = message.role === 'user';
  const suggested = message.plan?.suggestedServices[0];
  const suggestedTone = suggested ? categoryColor(suggested.category, mode) : null;
  const isStarred = suggested ? favoriteSet.has(suggested.id) : false;

  function starSuggested() {
    if (!suggested) return;
    setServiceMenuOpen(false);
    const wasFav = favoriteSet.has(suggested.id);
    toggleFavorite(suggested.id);
    if (user) {
      toggleFavoriteRemote(suggested.id, user.id, wasFav).catch(() => toggleFavorite(suggested.id));
    }
  }

  function sendSuggestedToFamily() {
    if (!suggested) return;
    setServiceMenuOpen(false);
    openWhatsAppShare(
      [t('assistant.familyMessagePrefix'), suggested.name, suggested.phone, suggested.address]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return (
    <View style={isUser ? styles.userRow : styles.botRow}>
      {!isUser ? <SmallAvatar /> : null}
      <View
        style={[
          styles.message,
          isUser ? styles.userMessage : styles.botMessage,
          {
            backgroundColor: isUser ? colors.chipBg : colors.cardSolid,
            borderColor: colors.border,
          },
        ]}
      >
        {message.attachments?.length ? (
          <View style={styles.messageAttachments}>
            {message.attachments.map((attachment) => (
              <Image
                key={attachment.id}
                source={{ uri: attachment.uri }}
                style={[styles.messageImage, { borderColor: colors.border }]}
              />
            ))}
          </View>
        ) : null}

        <Text selectable style={[styles.messageText, { color: colors.text }]}>
          {message.text}
        </Text>

        {message.errorRetry ? (
          <TouchableOpacity
            onPress={() => onRetry(message.id, message.errorRetry!)}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            activeOpacity={0.82}
            style={[styles.retryButton, { backgroundColor: colors.primaryTint, borderColor: colors.border }]}
          >
            <Feather name="refresh-cw" size={16} color={colors.primaryDark} />
            <Text style={[styles.retryText, { color: colors.primaryDark }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        ) : null}

        {message.plan ? (
          <View style={[styles.simplePlan, { borderTopColor: colors.border }]}>
            {suggested ? (
              <View style={styles.serviceLine}>
                <TouchableOpacity
                  onPress={() => router.push(`/service/${suggested.id}`)}
                  accessibilityRole="link"
                  accessibilityLabel={suggested.name}
                  activeOpacity={0.82}
                  style={styles.serviceLink}
                >
                  <View
                    style={[
                      styles.serviceIcon,
                      {
                        backgroundColor: suggestedTone?.bg ?? colors.primaryTint,
                        borderColor: suggestedTone?.border ?? colors.border,
                      },
                    ]}
                  >
                    <ServiceGlyph category={suggested.category} color={suggestedTone?.fg ?? colors.primaryDark} size={18} />
                  </View>
                  <View style={styles.serviceTextWrap}>
                    <Text style={[styles.serviceName, { color: colors.accent }]} numberOfLines={2}>
                      {suggested.name}
                    </Text>
                    <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={2}>
                      {suggested.address || t('assistant.serviceReady')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View>
                  {serviceMenuOpen ? (
                    <View style={[styles.serviceMenu, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                      <TouchableOpacity
                        onPress={starSuggested}
                        accessibilityRole="button"
                        accessibilityLabel={t(isStarred ? 'assistant.serviceMenu.unstar' : 'assistant.serviceMenu.star')}
                        activeOpacity={0.82}
                        style={styles.plusMenuItem}
                      >
                        <Feather name="star" size={18} color={isStarred ? colors.accent : colors.text} />
                        <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                          {t(isStarred ? 'assistant.serviceMenu.unstar' : 'assistant.serviceMenu.star')}
                        </Text>
                      </TouchableOpacity>
                      {suggested.phone ? (
                        <TouchableOpacity
                          onPress={() => {
                            setServiceMenuOpen(false);
                            const number = suggested.phone;
                            openWhatsAppCall(number).catch(() => onCallFailed(String(number)));
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('assistant.serviceMenu.call')}
                          activeOpacity={0.82}
                          style={styles.plusMenuItem}
                        >
                          <Feather name="phone" size={18} color={colors.text} />
                          <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                            {t('assistant.serviceMenu.call')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={sendSuggestedToFamily}
                        accessibilityRole="button"
                        accessibilityLabel={t('assistant.serviceMenu.sendToFamily')}
                        activeOpacity={0.82}
                        style={styles.plusMenuItem}
                      >
                        <Feather name="users" size={18} color={colors.text} />
                        <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                          {t('assistant.serviceMenu.sendToFamily')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setServiceMenuOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={t('assistant.serviceMenu.more')}
                    activeOpacity={0.82}
                    hitSlop={8}
                    style={styles.serviceMoreButton}
                  >
                    <Feather name="more-horizontal" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {message.plan.proposedReminder ? (
              <View style={[styles.reminderCard, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                <View style={styles.reminderCardHeader}>
                  <Feather name="bell" size={18} color={colors.primaryDark} />
                  <Text style={[styles.reminderCardHeading, { color: colors.textMuted }]}>
                    {t('assistant.reminderCard.heading')}
                  </Text>
                </View>
                <Text style={[styles.reminderCardTitle, { color: colors.text }]}>
                  {message.plan.proposedReminder.title}
                </Text>
                <Text style={[styles.reminderCardMeta, { color: colors.textMuted }]}>
                  {reminderMetaLine(message.plan.proposedReminder, t)}
                </Text>
                {reminderSaved ? (
                  <View style={styles.reminderSavedRow}>
                    <Feather name="check-circle" size={18} color={colors.primaryDark} />
                    <Text style={[styles.reminderSavedText, { color: colors.primaryDark }]}>
                      {t('assistant.reminderCard.savedShort')}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => onSaveReminder(message.id, message.plan!.proposedReminder!)}
                    accessibilityRole="button"
                    accessibilityLabel={t('assistant.reminderCard.save')}
                    activeOpacity={0.82}
                    style={[styles.reminderSaveButton, { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.reminderSaveText, { color: colors.primaryFg }]}>
                      {t('assistant.reminderCard.save')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <Text style={[styles.planHint, { color: colors.textMuted }]}>
              {message.plan.safetyNote}
            </Text>

            {message.plan.status === 'urgent' && onAlertFamily ? (
              <TouchableOpacity
                onPress={() => onAlertFamily(message.id)}
                disabled={familyAlerted}
                accessibilityRole="button"
                accessibilityLabel={t(familyAlerted ? 'assistant.familyAlertedShort' : 'assistant.alertFamily')}
                activeOpacity={0.82}
                style={[
                  styles.alertFamilyButton,
                  {
                    backgroundColor: familyAlerted ? colors.chipBg : colors.danger,
                    borderColor: colors.border,
                    borderWidth: familyAlerted ? 1 : 0,
                  },
                ]}
              >
                <Feather
                  name={familyAlerted ? 'check-circle' : 'users'}
                  size={18}
                  color={familyAlerted ? colors.text : colors.dangerFg}
                />
                <Text
                  style={[
                    styles.alertFamilyText,
                    { color: familyAlerted ? colors.text : colors.dangerFg },
                  ]}
                >
                  {t(familyAlerted ? 'assistant.familyAlertedShort' : 'assistant.alertFamily')}
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.actionRow}>
              {message.plan.actions.slice(0, 3).map((action, index) => (
                <TouchableOpacity
                  key={`${action.kind}-${index}`}
                  onPress={() => onAction(action, message.plan)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  activeOpacity={0.82}
                  hitSlop={6}
                  style={[styles.actionButton, { backgroundColor: colors.primaryTint, borderColor: colors.border }]}
                >
                  <Text style={[styles.actionText, { color: colors.primaryDark }]} numberOfLines={1}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SmallAvatar() {
  const { colors } = useTheme();
  return (
    <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]}>
      <Text style={[styles.smallAvatarText, { color: colors.primaryFg }]}>AI</Text>
    </View>
  );
}

function reminderMetaLine(reminder: ProposedReminder, t: (key: string) => string) {
  const todayISO = toLocalISODate(new Date());
  const [year, month, day] = todayISO.split('-').map(Number);
  const tomorrowISO = toLocalISODate(new Date(year, month - 1, day + 1));
  const dayLabel =
    reminder.dateISO === todayISO
      ? t('reminders.today')
      : reminder.dateISO === tomorrowISO
        ? t('reminders.tomorrow')
        : reminder.dateISO;
  const parts = [dayLabel];
  if (reminder.time) parts.push(reminder.time);
  parts.push(t(`reminders.repeat.${reminder.repeat}`));
  return parts.join(' · ');
}

function welcomeMessage(text: string): AssistantMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    text,
  };
}

function getInitialChatState(t: (key: string) => string): ChatState {
  if (cachedInitialChatState) return cachedInitialChatState;
  const storedState = loadChatState(t);
  cachedInitialChatState = storedState;
  return storedState;
}

function loadChatState(t: (key: string) => string): ChatState {
  const fallbackSession = newChatSession(t);
  const fallback = {
    activeSessionId: fallbackSession.id,
    sessions: [fallbackSession],
  };
  const storage = getWebStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ChatState>;
    const sessions = sanitizeStoredSessions(parsed.sessions, t);
    if (!sessions.length) return fallback;
    const activeSessionId =
      parsed.activeSessionId && sessions.some((sessionItem) => sessionItem.id === parsed.activeSessionId)
        ? parsed.activeSessionId
        : sessions[0].id;
    return { activeSessionId, sessions };
  } catch {
    return fallback;
  }
}

function saveChatState(state: ChatState) {
  if (!state.sessions.length) return;
  // Keep the module cache current so a remount re-initializes from the latest
  // state instead of the snapshot taken on first mount.
  cachedInitialChatState = state;
  const storage = getWebStorage();
  if (!storage) return;

  const storedState = {
    activeSessionId: state.activeSessionId,
    sessions: state.sessions.slice(0, MAX_CHAT_SESSIONS).map(prepareSessionForStorage),
  };

  try {
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    try {
      storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stripStoredImageData(storedState)));
    } catch {
      // Storage can be unavailable or full; the current in-memory chat should still work.
    }
  }
}

function sanitizeStoredSessions(value: unknown, t: (key: string) => string): ChatSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      const id = String(item?.id || '');
      const messages = sanitizeStoredMessages(item?.messages);
      if (!id || !messages.length) return null;
      return summarizeSession(
        {
          id,
          title: String(item?.title || t('assistant.newChat')),
          preview: String(item?.preview || t('assistant.simpleWelcome')),
          updatedAt: typeof item?.updatedAt === 'number' ? item.updatedAt : Date.now(),
          messages,
        },
        t,
      );
    })
    .filter((sessionItem): sessionItem is ChatSession => Boolean(sessionItem))
    .sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHAT_SESSIONS) as ChatSession[];
}

function sanitizeStoredMessages(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((message: any) => {
      const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null;
      const id = String(message?.id || '');
      const text = String(message?.text || '').trim();
      if (!role || !id || !text) return null;
      return {
        id,
        role,
        text,
        attachments: sanitizeStoredAttachments(message?.attachments),
        plan: isRenderableStoredPlan(message?.plan) ? message.plan : undefined,
      } as AssistantMessage;
    })
    .filter(Boolean)
    .slice(-MAX_STORED_MESSAGES_PER_CHAT) as AssistantMessage[];
}

function isRenderableStoredPlan(plan: any): boolean {
  // Old-schema plans without these arrays would crash the message renderer.
  return Boolean(
    plan &&
      typeof plan === 'object' &&
      Array.isArray(plan.suggestedServices) &&
      Array.isArray(plan.actions),
  );
}

function parseActionPayload(value?: string | null): any | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeStoredAttachments(value: unknown): AssistantAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value
    .map((attachment: any) => {
      const id = String(attachment?.id || '');
      const uri = String(attachment?.uri || '');
      if (!id || !uri || !(uri.startsWith('data:image/') || /^https:\/\//i.test(uri))) return null;
      return {
        id,
        type: 'image',
        uri,
        name: attachment?.name ? String(attachment.name) : undefined,
        mimeType: attachment?.mimeType ? String(attachment.mimeType) : undefined,
        size: typeof attachment?.size === 'number' ? attachment.size : undefined,
      } as AssistantAttachment;
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGE_ATTACHMENTS) as AssistantAttachment[];
  return attachments.length ? attachments : undefined;
}

function prepareSessionForStorage(sessionItem: ChatSession): ChatSession {
  return {
    ...sessionItem,
    messages: sessionItem.messages.slice(-MAX_STORED_MESSAGES_PER_CHAT),
  };
}

function stripStoredImageData(state: ChatState): ChatState {
  return {
    ...state,
    sessions: state.sessions.map((sessionItem) => ({
      ...sessionItem,
      messages: sessionItem.messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map((attachment) => ({
          ...attachment,
          uri: '',
        })),
      })),
    })),
  };
}

function newChatSession(t: (key: string) => string): ChatSession {
  const now = Date.now();
  return {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: t('assistant.newChat'),
    preview: t('assistant.simpleWelcome'),
    updatedAt: now,
    messages: [welcomeMessage(t('assistant.simpleWelcome'))],
  };
}

function summarizeSession(sessionItem: ChatSession, t: (key: string) => string): ChatSession {
  const userMessages = sessionItem.messages.filter((message) => message.role === 'user');
  const lastMessage = sessionItem.messages[sessionItem.messages.length - 1];
  const title = userMessages[0]?.text || t('assistant.newChat');
  const preview = lastMessage?.text || t('assistant.simpleWelcome');
  return {
    ...sessionItem,
    title: truncateChatText(title, 42),
    preview: truncateChatText(preview, 76),
  };
}

function truncateChatText(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

function getWebDocument(): any | null {
  return typeof globalThis === 'undefined' ? null : ((globalThis as any).document ?? null);
}

function getWebStorage(): Storage | null {
  return typeof globalThis === 'undefined' ? null : ((globalThis as any).localStorage ?? null);
}

async function readImageFiles(files: unknown[]): Promise<AssistantAttachment[]> {
  const imageFiles = files
    .filter((file: any) => String(file?.type || '').startsWith('image/'))
    .slice(0, MAX_IMAGE_ATTACHMENTS);

  const attachments = await Promise.all(imageFiles.map((file) => readImageFile(file)));
  return attachments.filter(Boolean) as AssistantAttachment[];
}

function readImageFile(file: any): Promise<AssistantAttachment | null> {
  const Reader = typeof globalThis === 'undefined' ? null : (globalThis as any).FileReader;
  if (!Reader) return Promise.resolve(null);

  return new Promise((resolve) => {
    const reader = new Reader();
    reader.onload = () => {
      const uri = typeof reader.result === 'string' ? reader.result : '';
      resolve(
        uri
          ? {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: 'image',
              uri,
              name: file?.name ? String(file.name) : undefined,
              mimeType: file?.type ? String(file.type) : undefined,
              size: typeof file?.size === 'number' ? file.size : undefined,
            }
          : null,
      );
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  assistantLayout: {
    flex: 1,
    width: '100%',
    maxWidth: 1460,
    alignSelf: 'center',
    padding: space.md,
    flexDirection: 'row',
    gap: space.md,
  },
  assistantLayoutStacked: {
    flexDirection: 'column',
  },
  // Floating glass tab bar covers the bottom edge; keep the composer above it.
  // Full clearance: on iPhone Safari the browser toolbar eats extra bottom
  // space and the reduced value left the input half-hidden under the dock.
  assistantLayoutPhone: {
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  historyPanel: {
    width: 286,
    minWidth: 240,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: space.sm,
    ...shadow.sm,
  },
  historyPanelStacked: {
    display: 'none',
  },
  historyHeader: {
    gap: space.sm,
  },
  historyTitle: {
    fontSize: font.md,
    fontFamily: family.bold,
  },
  newChatButton: {
    minHeight: TAP,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  newChatButtonText: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  historyList: { flex: 1 },
  historyListContent: {
    gap: space.sm,
    paddingBottom: space.sm,
  },
  historyListContentStacked: {
    paddingBottom: 0,
    paddingRight: space.sm,
  },
  historyItem: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.sm,
    justifyContent: 'center',
    gap: 4,
  },
  historyItemStacked: {
    width: 220,
  },
  historyItemTitle: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  historyPreview: {
    fontFamily: family.regular,
    fontSize: font.xs,
    lineHeight: font.xs * 1.25,
  },
  chatShell: {
    flex: 1,
    width: '100%',
    gap: space.sm,
    minWidth: 0,
  },
  statusRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Narrow phones: the chips drop below the status text instead of
    // pushing off the right edge.
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: 2,
  },
  statusText: { fontFamily: family.regular, fontSize: font.sm, flexShrink: 1 },
  mobileNewChat: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileNewChatText: { fontSize: font.sm, fontFamily: family.semibold },
  statusActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chatsButton: {
    flexDirection: 'row',
    gap: space.xs,
  },
  chatsCount: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chatsCountText: { fontSize: font.xs, fontFamily: family.semibold },
  sheetNewChat: {
    minHeight: TAP,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  sheetNewChatText: { fontSize: font.md, fontFamily: family.semibold },
  sheetChatList: { flexShrink: 1 },
  sheetChatListContent: { gap: space.sm, paddingBottom: space.sm },
  retryButton: {
    marginTop: space.sm,
    minHeight: 40,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  retryText: { fontSize: font.sm, fontFamily: family.semibold },
  payPayee: { fontSize: font.lg, fontFamily: family.bold, marginBottom: space.sm },
  payDetails: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 4,
  },
  payUpiId: { fontSize: font.md, fontFamily: family.semibold },
  payAmount: { fontSize: font.lg, fontFamily: family.bold },
  payHint: {
    fontFamily: family.regular,
    fontSize: font.sm,
    lineHeight: font.sm * 1.35,
    marginTop: space.sm,
  },
  payActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
  payActionButton: { flex: 1 },
  thread: { flex: 1 },
  threadContent: {
    paddingVertical: space.md,
    gap: space.md,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  smallAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: { fontSize: font.xs, fontFamily: family.bold },
  message: {
    maxWidth: '82%',
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    ...shadow.sm,
  },
  botMessage: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  userMessage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  messageText: {
    fontFamily: family.regular,
    fontSize: font.md,
    lineHeight: font.md * 1.35,
  },
  typingBubble: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  typingText: { fontSize: font.sm, fontFamily: family.semibold },
  simplePlan: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    gap: space.sm,
  },
  serviceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    zIndex: 20,
  },
  serviceLink: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  serviceMoreButton: {
    // Real 56x56, not hitSlop: react-native-web does not use hitSlop for
    // hit-testing, so on the web build only the painted box is tappable.
    width: TAP,
    height: TAP,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    minWidth: 210,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    zIndex: 60,
    ...shadow.md,
  },
  serviceIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTextWrap: { flex: 1, minWidth: 0 },
  serviceName: { fontSize: font.md, fontFamily: family.bold },
  // Address/phone/safety copy is real content, not a caption — font.xs (15) is
  // the caption floor and reads too small for a 70+ user with cataracts.
  serviceMeta: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.3 },
  planHint: {
    fontFamily: family.regular,
    fontSize: font.sm,
    lineHeight: font.sm * 1.4,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actionButton: {
    minHeight: TAP,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    maxWidth: '100%',
  },
  actionText: { fontSize: font.sm, fontFamily: family.semibold },
  composer: {
    paddingTop: space.xs,
    gap: space.sm,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 4,
  },
  plusButton: {
    width: TAP,
    height: TAP,
    marginBottom: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusMenu: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    minWidth: 230,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    zIndex: 30,
    ...shadow.md,
  },
  plusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  plusMenuItemText: {
    fontSize: font.sm,
    fontFamily: family.medium,
  },
  plusMenuDivider: {
    height: 1,
    marginVertical: space.xs,
    marginHorizontal: space.sm,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    fontFamily: family.regular,
    fontSize: font.md,
    lineHeight: font.md * 1.3,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: TAP,
    height: TAP,
    marginBottom: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    width: TAP,
    height: TAP,
    marginBottom: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  reminderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  reminderCardHeading: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  reminderCardTitle: {
    fontSize: font.md,
    fontFamily: family.bold,
  },
  reminderCardMeta: {
    fontSize: font.sm,
    fontFamily: family.regular,
  },
  reminderSaveButton: {
    minHeight: TAP,
    marginTop: space.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  reminderSaveText: {
    fontSize: font.md,
    fontFamily: family.semibold,
  },
  reminderSavedRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  reminderSavedText: {
    fontSize: font.md,
    fontFamily: family.semibold,
  },
  alertFamilyButton: {
    minHeight: TAP,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  alertFamilyText: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  attachmentList: {
    gap: space.sm,
    paddingRight: space.md,
  },
  attachmentPreview: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  attachmentPreviewImage: {
    width: '100%',
    height: '100%',
  },
  // The one control that cannot reach 56: it floats on the thumbnail it removes,
  // and a 56px disc would hide the picture. 48 painted + hitSlop 8 = 64 on native.
  removeAttachmentButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAttachmentText: {
    fontSize: font.md,
    fontFamily: family.bold,
    lineHeight: font.md * 1.15,
  },
  messageAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.xs,
  },
  messageImage: {
    width: 132,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
