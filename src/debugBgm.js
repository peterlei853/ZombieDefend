/**
 * Listen shortcut for the victory → shop beds. Off unless the page URL has
 * `debugBgm=1` or `debug=1`. The 90s stage timer is unchanged.
 * @param {string} [search]
 */
export function debugBgmEnabled(search) {
  const raw = search ?? (typeof location !== 'undefined' ? location.search : '');
  const q = new URLSearchParams(raw || '');
  return q.get('debugBgm') === '1' || q.get('debug') === '1';
}
