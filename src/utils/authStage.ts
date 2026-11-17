export type AuthStageMode = 'intro' | 'auth';

/**
 * Resolves the initial LoginView stage.
 * Always opens in Boro-style 'intro' ("Get started") by default unless an explicit
 * form bypass query (?stage=auth, ?autostart=1, or ?verify_token=...) is present.
 */
export function resolveInitialAuthStage(search = ''): AuthStageMode {
  if (!search) return 'intro';
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  if (
    params.get('stage') === 'auth' ||
    params.get('autostart') === '1' ||
    Boolean(params.get('verify_token'))
  ) {
    return 'auth';
  }
  return 'intro';
}
