/* IndoPak Converter — Arabic → IndoPak script
 *
 * Two layers of conversion:
 *  1. RULES  — reversible, well-defined Unicode-level transforms (Uthmani → IndoPak conventions).
 *  2. FONT   — the visual IndoPak letterforms, applied via the selected typeface.
 *
 * The rule layer only touches characters where Uthmani and IndoPak encodings genuinely
 * differ; everything else is passed through untouched so meaning is preserved.
 */

'use strict';

// ── Unicode code points we care about ───────────────────────────────
const CH = {
  ALEF_WASLA:        'ٱ', // ٱ  alif with wasla (Uthmani)
  ALEF:              'ا', // ا  plain alif
  SMALL_HIGH_KHAH:   'ۡ', // ۡ  Uthmani "sukoon" (small high dotless head of khah)
  SUKOON:            'ْ', // ْ  standard sukoon — rendered as jazm in IndoPak fonts
  DAGGER_ALEF:       'ٰ', // ٰ  superscript (dagger) alif
  TATWEEL:           'ـ', // ـ  kashida / tatweel
  // Urdu / IndoPak letter forms
  YEH_AR:            'ي', // ي  Arabic yeh (two dots)
  YEH_UR:            'ی', // ی  Farsi/Urdu yeh (dotless final)
  KAF_AR:            'ك', // ك  Arabic kaf
  KAF_UR:            'ک', // ک  Urdu keheh
  HEH_AR:            'ه', // ه  Arabic heh
  HEH_UR:            'ہ', // ہ  Urdu heh goal
};

// Quranic annotation & waqf marks (small high letters, stop signs, etc.)
// Range U+06D6–U+06ED plus a few stragglers. Stripped only when the user opts in.
const ANNOTATION_RE = /[ۖ-ۜ۞-۠ۢ-ۭ]/g;

// ── Individual rule transforms ──────────────────────────────────────
// Each returns { text, count } so we can report how much was changed.
function countReplace(text, pattern, replacement) {
  let count = 0;
  const out = text.replace(pattern, (m) => { count++; return replacement; });
  return { text: out, count };
}

const RULES = {
  rWasl:    (t) => countReplace(t, new RegExp(CH.ALEF_WASLA, 'g'), CH.ALEF),
  // Khari alif: a fatha immediately before a dagger alif draws an extra slanted
  // stroke (عَٰ). IndoPak writes the long-ā as the dagger alone (عٰ) — just the
  // vertical stroke — so drop that fatha.
  rKhari:   (t) => countReplace(t, /َٰ/g, CH.DAGGER_ALEF),
  rSukoon:  (t) => countReplace(t, new RegExp(CH.SMALL_HIGH_KHAH, 'g'), CH.SUKOON),
  // Dagger alif → a single standing alif, without ever producing a double alif:
  //  • dagger next to an existing alif → just drop the dagger (alif already there)
  //  • fatha + dagger (long ā, no written alif) → one alif, dropping the now-redundant
  //    fatha (which the IndoPak font would otherwise draw as a second vertical stroke)
  //  • any remaining lone dagger → standing alif
  rDagger: (t) => {
    let count = 0;
    const bump = () => { count++; return CH.ALEF; };
    let out = t
      .replace(/اٰ/g, () => { count++; return CH.ALEF; }) // alif + dagger
      .replace(/ٰا/g, () => { count++; return CH.ALEF; }) // dagger + alif
      .replace(/َ?ٰ/g, bump);                            // (fatha?) + dagger
    return { text: out, count };
  },
  rMarks:   (t) => countReplace(t, ANNOTATION_RE, ''),
  rTatweel: (t) => countReplace(t, new RegExp(CH.TATWEEL, 'g'), ''),
  // Urdu / IndoPak letter forms
  rYeh:     (t) => countReplace(t, new RegExp(CH.YEH_AR, 'g'), CH.YEH_UR),
  rKaf:     (t) => countReplace(t, new RegExp(CH.KAF_AR, 'g'), CH.KAF_UR),
  rHeh:     (t) => countReplace(t, new RegExp(CH.HEH_AR, 'g'), CH.HEH_UR),
};

const RULE_LABELS = {
  rWasl: 'alif-wasla',
  rKhari: 'khari alif (drop fatha)',
  rSukoon: 'sukoon→jazm',
  rDagger: 'dagger-alif',
  rMarks: 'marks stripped',
  rTatweel: 'tatweel removed',
  rYeh: 'yeh→ی',
  rKaf: 'kaf→ک',
  rHeh: 'heh→ہ',
};

function convert(text, enabled) {
  let result = text;
  const applied = [];
  for (const key of Object.keys(RULES)) {
    if (!enabled[key]) continue;
    const { text: out, count } = RULES[key](result);
    result = out;
    if (count > 0) applied.push(`${RULE_LABELS[key]} ×${count}`);
  }
  return { result, applied };
}

// ── DOM wiring ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const input = $('input');
const output = $('output');
const inCount = $('inCount');
const ruleCount = $('ruleCount');
const fontSel = $('fontSel');
const sizeRange = $('sizeRange');
const sizeVal = $('sizeVal');
const layoutSel = $('layoutSel');

const LAYOUT_CLASSES = ['lay-justified', 'lay-centered', 'lay-verse', 'lay-spacious', 'lay-compact'];

const RULE_IDS = ['rWasl', 'rKhari', 'rSukoon', 'rDagger', 'rMarks', 'rTatweel', 'rYeh', 'rKaf', 'rHeh'];

const SAMPLE = 'بِسۡمِ اللهِ الرَّحۡمٰنِ الرَّحِيۡمِ\nاَلۡحَمۡدُ لِلّٰهِ رَبِّ الۡعٰلَمِيۡنَۙ\nالرَّحۡمٰنِ الرَّحِيۡمِۙ\nمٰلِكِ يَوۡمِ الدِّيۡنِؕ';

function currentRules() {
  const enabled = {};
  RULE_IDS.forEach((id) => { enabled[id] = $(id).checked; });
  return enabled;
}

function render() {
  const text = input.value;
  inCount.textContent = `${[...text].length} characters`;

  const { result, applied } = convert(text, currentRules());
  output.textContent = result;

  ruleCount.textContent = applied.length
    ? `Applied: ${applied.join(' · ')}`
    : (text ? 'No matching characters to convert' : 'No conversions applied');
}

function applyFont() {
  output.style.fontFamily = fontSel.value;
}
function applySize() {
  const px = sizeRange.value;
  output.style.fontSize = px + 'px';
  input.style.fontSize = px + 'px';
  sizeVal.textContent = px + 'px';
}
function applyLayout() {
  [input, output].forEach((el) => {
    el.classList.remove(...LAYOUT_CLASSES);
    if (layoutSel.value) el.classList.add(layoutSel.value);
  });
  localStorage.setItem('indopak-layout', layoutSel.value);
}

// Toast helper
let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// ── Events ──────────────────────────────────────────────────────────
input.addEventListener('input', render);
RULE_IDS.forEach((id) => $(id).addEventListener('change', render));
fontSel.addEventListener('change', applyFont);
sizeRange.addEventListener('input', applySize);
layoutSel.addEventListener('change', applyLayout);

$('sampleBtn').addEventListener('click', () => { input.value = SAMPLE; render(); });
$('clearBtn').addEventListener('click', () => { input.value = ''; render(); input.focus(); });

$('pasteBtn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    input.value = text;
    render();
    toast('Pasted');
  } catch {
    toast('Clipboard blocked — paste manually');
    input.focus();
  }
});

// Import Arabic text from a file (.txt / .md), read as UTF-8.
const fileInput = $('fileInput');
function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    input.value = reader.result;
    render();
    toast(`Imported ${file.name}`);
  };
  reader.onerror = () => toast('Could not read file');
  reader.readAsText(file, 'UTF-8');
}
$('importBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  loadFile(fileInput.files[0]);
  fileInput.value = ''; // allow re-importing the same file
});

// Drag & drop a text file onto the input.
['dragenter', 'dragover'].forEach((ev) =>
  input.addEventListener(ev, (e) => { e.preventDefault(); input.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((ev) =>
  input.addEventListener(ev, (e) => { e.preventDefault(); input.classList.remove('dragging'); }));
input.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files[0];
  if (file) loadFile(file);
});

$('copyBtn').addEventListener('click', async () => {
  if (!output.textContent) { toast('Nothing to copy'); return; }
  try {
    await navigator.clipboard.writeText(output.textContent);
    toast('Copied IndoPak text');
  } catch {
    toast('Copy failed');
  }
});

$('themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  localStorage.setItem('indopak-theme', next);
});

// ── Init ────────────────────────────────────────────────────────────
(function init() {
  const savedTheme = localStorage.getItem('indopak-theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  const savedLayout = localStorage.getItem('indopak-layout');
  if (savedLayout) layoutSel.value = savedLayout;
  applyFont();
  applySize();
  applyLayout();
  input.value = SAMPLE;
  render();
})();

// Service worker (offline-ready, optional)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
