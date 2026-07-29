export const ONBOARDING_VERSION = 1;
export const ONBOARDING_STATE_KEY = 'joeanime-onboarding-state-v1';
export const LEGACY_ONBOARDING_VERSION_KEY = 'joeanime-onboarding-version';
export const ONBOARDING_TIP_IDS = [
  'library',
  'analytics',
  'assistant',
  'discover',
  'following',
  'settings'
];

const EMPTY_STATE = {
  version: ONBOARDING_VERSION,
  status: 'not-started',
  step: 0,
  dismissedTips: [],
  startedAt: '',
  completedAt: '',
  source: ''
};

function storageAvailable() {
  return typeof localStorage !== 'undefined';
}

function normalizeState(value = {}) {
  const dismissedTips = Array.isArray(value.dismissedTips)
    ? [...new Set(value.dismissedTips.map(String).filter(Boolean))]
    : [];

  return {
    ...EMPTY_STATE,
    ...value,
    version: ONBOARDING_VERSION,
    step: Math.max(0, Math.min(4, Number(value.step || 0))),
    dismissedTips
  };
}

export function readOnboardingState() {
  if (!storageAvailable()) return null;

  try {
    const raw = localStorage.getItem(ONBOARDING_STATE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));

    if (localStorage.getItem(LEGACY_ONBOARDING_VERSION_KEY)) {
      return normalizeState({
        status: 'completed',
        step: 4,
        dismissedTips: ONBOARDING_TIP_IDS,
        completedAt: new Date().toISOString(),
        source: 'legacy-version'
      });
    }
  } catch (error) {
    console.warn('Could not read onboarding state:', error);
  }

  return null;
}

export function saveOnboardingState(nextState = {}) {
  const normalized = normalizeState(nextState);

  if (storageAvailable()) {
    try {
      localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(normalized));
      if (['completed', 'skipped'].includes(normalized.status)) {
        localStorage.setItem(LEGACY_ONBOARDING_VERSION_KEY, String(ONBOARDING_VERSION));
      }
    } catch (error) {
      console.warn('Could not save onboarding state:', error);
    }
  }

  return normalized;
}

export function beginOnboarding({ replay = false } = {}) {
  const previous = readOnboardingState();
  return saveOnboardingState({
    ...EMPTY_STATE,
    status: 'in-progress',
    step: 0,
    dismissedTips: replay ? [] : (previous?.dismissedTips || []),
    startedAt: new Date().toISOString(),
    source: replay ? 'settings-replay' : 'first-run'
  });
}

export function updateOnboardingStep(currentState, step) {
  return saveOnboardingState({
    ...(currentState || EMPTY_STATE),
    status: 'in-progress',
    step
  });
}

export function finishOnboarding(currentState, status = 'completed') {
  const finalStatus = status === 'skipped' ? 'skipped' : 'completed';
  return saveOnboardingState({
    ...(currentState || EMPTY_STATE),
    status: finalStatus,
    step: 4,
    dismissedTips: finalStatus === 'skipped'
      ? ONBOARDING_TIP_IDS
      : (currentState?.dismissedTips || []),
    completedAt: new Date().toISOString()
  });
}

export function markExistingUserOnboardingComplete(currentState = null) {
  return saveOnboardingState({
    ...(currentState || EMPTY_STATE),
    status: 'completed',
    step: 4,
    dismissedTips: [
      ...(currentState?.dismissedTips || []),
      ...ONBOARDING_TIP_IDS
    ],
    completedAt: currentState?.completedAt || new Date().toISOString(),
    source: currentState?.source || 'existing-user'
  });
}

export function dismissOnboardingTip(currentState, tipId) {
  return saveOnboardingState({
    ...(currentState || EMPTY_STATE),
    dismissedTips: [
      ...(currentState?.dismissedTips || []),
      String(tipId || '')
    ].filter(Boolean)
  });
}

export function clearOnboardingState() {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(ONBOARDING_STATE_KEY);
    localStorage.removeItem(LEGACY_ONBOARDING_VERSION_KEY);
  } catch {}
}
