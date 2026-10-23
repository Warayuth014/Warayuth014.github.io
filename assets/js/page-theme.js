// Loaded by the generated article pages: applies the editable theme from content/site.json.
// Any failure is silent; the default tokens from site.css stay.
import { applyTheme } from './theme.js';

fetch('/content/site.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((site) => { if (site && typeof site === 'object') applyTheme(site.theme); })
  .catch(() => { /* default theme */ });
