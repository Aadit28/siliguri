import { useSimpleMode } from '../context/SimpleModeContext';
import { Tokens, tokensFor } from './theme';

export type ScreenTokens = Tokens & { isSimple: boolean };

// Both results are frozen at module level so `tk` is referentially stable.
// Screens memoize their StyleSheet on `tk`, and a fresh object per render would
// rebuild every sheet on every render.
const normal: ScreenTokens = { ...tokensFor(false), isSimple: false };
const simple: ScreenTokens = { ...tokensFor(true), isSimple: true };

// Screens read type/spacing/touch floors through this instead of importing the
// static tokens, so easy view can scale them without a second style tree.
export function useTokens(): ScreenTokens {
  const { isSimple } = useSimpleMode();
  return isSimple ? simple : normal;
}
