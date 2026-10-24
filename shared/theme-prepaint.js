// Inline pre-paint script: applies the last theme the visitor saw (written by assets/js/theme.js into
// localStorage 'site.themeVars') before first paint, so pages do not flash the default colours while
// content/site.json is still loading. The fetched theme is applied afterwards and always wins.
// Values are checked: only known custom properties and #rrggbb colours are accepted.
//
// Pure string module (the Worker and tools/render-articles.mjs import it). index.html and
// resume/index.html carry the same text verbatim; tests/theme-prepaint.test.mjs keeps them identical.
export const THEME_PREPAINT = `(function(){try{var j=JSON.parse(localStorage.getItem('site.themeVars'));if(!j||typeof j!=='object')return;var r=document.documentElement,l=j.mode==='light',v=j.vars||{},k;r.setAttribute('data-mode',l?'light':'dark');for(k in v)if(/^--(bg[12]|accent[123]|fg|muted|line|on-accent)$/.test(k)&&/^#[0-9a-f]{6}$/i.test(v[k]))r.style.setProperty(k,v[k]);if(l)r.style.setProperty('--card','rgba(255,255,255,.72)')}catch(e){}})();`;
