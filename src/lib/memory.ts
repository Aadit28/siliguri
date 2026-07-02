import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'saathi.memory.v1';

const MAX_TURNS = 30;
const CONTEXT_MAX_FACTS = 12;
const CONTEXT_MAX_TURNS = 8;
const CONTEXT_MAX_TEXT_LENGTH = 200;

export type MemoryFact = {
  id: string;
  text: string;
  createdAt: string;
};

export type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  at: string;
};

export type AssistantMemory = {
  facts: MemoryFact[];
  turns: ChatTurn[];
  prefs: {
    speakReplies?: boolean;
  };
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function emptyMemory(): AssistantMemory {
  return { facts: [], turns: [], prefs: {} };
}

function isFact(item: unknown): item is MemoryFact {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as MemoryFact).id === 'string' &&
    typeof (item as MemoryFact).text === 'string' &&
    typeof (item as MemoryFact).createdAt === 'string'
  );
}

function isTurn(item: unknown): item is ChatTurn {
  if (!item || typeof item !== 'object') return false;
  const turn = item as ChatTurn;
  return (
    (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.text === 'string' &&
    typeof turn.at === 'string'
  );
}

async function readStore(): Promise<AssistantMemory> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyMemory();
    const facts = Array.isArray(parsed.facts) ? parsed.facts.filter(isFact) : [];
    const turns = Array.isArray(parsed.turns) ? parsed.turns.filter(isTurn) : [];
    const prefs: AssistantMemory['prefs'] =
      parsed.prefs && typeof parsed.prefs === 'object' && !Array.isArray(parsed.prefs)
        ? {
            ...(typeof parsed.prefs.speakReplies === 'boolean'
              ? { speakReplies: parsed.prefs.speakReplies }
              : {}),
          }
        : {};
    return { facts, turns, prefs };
  } catch {
    return emptyMemory();
  }
}

async function writeStore(memory: AssistantMemory) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

export async function loadMemory(): Promise<AssistantMemory> {
  return readStore();
}

export async function clearMemory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function appendTurn(turn: { role: ChatTurn['role']; text: string }): Promise<void> {
  const memory = await readStore();
  memory.turns.push({ role: turn.role, text: turn.text, at: new Date().toISOString() });
  if (memory.turns.length > MAX_TURNS) {
    memory.turns = memory.turns.slice(-MAX_TURNS);
  }
  await writeStore(memory);
}

export async function rememberFact(text: string): Promise<MemoryFact> {
  const memory = await readStore();
  const fact: MemoryFact = {
    id: makeId('fact'),
    text,
    createdAt: new Date().toISOString(),
  };
  memory.facts.push(fact);
  await writeStore(memory);
  return fact;
}

export async function forgetFact(id: string): Promise<void> {
  const memory = await readStore();
  memory.facts = memory.facts.filter((fact) => fact.id !== id);
  await writeStore(memory);
}

export async function setPref<K extends keyof AssistantMemory['prefs']>(
  key: K,
  value: AssistantMemory['prefs'][K],
): Promise<void> {
  const memory = await readStore();
  memory.prefs = { ...memory.prefs, [key]: value };
  await writeStore(memory);
}

export async function buildAssistantContext(): Promise<{
  facts: string[];
  recentTurns: { role: string; text: string }[];
}> {
  const memory = await readStore();
  const facts = memory.facts
    .slice(-CONTEXT_MAX_FACTS)
    .map((fact) => fact.text.slice(0, CONTEXT_MAX_TEXT_LENGTH));
  const recentTurns = memory.turns.slice(-CONTEXT_MAX_TURNS).map((turn) => ({
    role: turn.role,
    text: turn.text.slice(0, CONTEXT_MAX_TEXT_LENGTH),
  }));
  return { facts, recentTurns };
}
