import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

/**
 * Sign-out with a confirmation the platform can actually show.
 *
 * Two-tap confirm on web: native `confirm()` is blocked in embedded webviews
 * and cannot be styled for elder-sized touch targets, so the control arms
 * itself and the second tap commits. Native gets a real Alert.
 *
 * `armed` is exposed so the caller can change its own label and colour; the
 * hook owns the timing so every sign-out affordance behaves the same way.
 */
export function useSignOutConfirm() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    // Long enough for an unhurried reader to notice the prompt and decide.
    const timer = setTimeout(() => setArmed(false), 10000);
    return () => clearTimeout(timer);
  }, [armed]);

  const confirmSignOut = useCallback(() => {
    if (Platform.OS === 'web') {
      if (armed) {
        setArmed(false);
        void signOut();
      } else {
        setArmed(true);
      }
      return;
    }
    Alert.alert(`${t('common.signOut')}?`, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [armed, signOut, t]);

  return { armed, confirmSignOut };
}
