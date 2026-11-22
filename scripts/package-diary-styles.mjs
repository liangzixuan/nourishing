import {readFile, writeFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';

const publicRoot = new URL('../public/', import.meta.url);

export const DIARY_STYLESHEETS = [
  '/mobile-theme.css',
  '/mobile-diary.css',
  '/mobile-food-entry.css',
  '/diary.css',
  '/library.css',
  '/nutrition.css',
  '/charts.css',
  '/repeats.css',
  '/records.css',
  '/target-policies.css',
  '/photo-log.css',
  '/barcode.css',
  '/food-insights.css',
  '/account-surface.css',
  '/fasting.css',
  '/snapshots.css',
  '/profile-settings.css',
  '/backup.css',
  '/recipe-import.css',
  '/library-tools.css',
  '/entry-adjustments.css',
  '/dashboard.css',
  '/streak-sharing.css',
  '/dashboard-health-cards.css',
  '/coach.css',
  '/print-report.css',
  '/report-mobile.css',
  '/food-entry-source/mobile-food-entry.css',
  '/oracle.css',
  '/suggestions.css',
  '/food-search-source/mobile-food-search.css',
  '/food-search-source/food-multi-add.css',
  '/diary-tools.css',
  '/nutrient-detail.css',
  '/note-photos.css',
  '/library-extras.css',
  '/reminders.css',
  '/text-log.css',
  '/health-source/glucose-timeline.css',
  '/health-controls.css',
  '/app-shell.css',
  '/more.css',
  '/diary-summary.css',
  '/add-menu-source/add-menu.css',
];

const IMPORT_RE = /@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)|"([^"]+)"|'([^']+)')\s*;/g;
const URL_RE = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)/g;

function resolvePublicPath(fromPath, target) {
  if (target.startsWith('/')) return posix.normalize(target);
  return posix.resolve(posix.dirname(fromPath), target);
}

function rewriteRelativeUrls(css, fromPath) {
  return css.replace(URL_RE, (match, doubleQuoted, singleQuoted, bare) => {
    const raw = doubleQuoted ?? singleQuoted ?? bare;
    if (!raw || /^(?:data:|https?:|#|\/)/i.test(raw)) return match;
    const resolved = resolvePublicPath(fromPath, raw);
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
    return `url(${quote}${resolved}${quote})`;
  });
}

export async function buildDiaryStyles() {
  const seen = new Set();
  const chunks = ['/* Generated from DIARY_STYLESHEETS by scripts/package-diary-styles.mjs */\n'];

  async function inlineCss(filePath) {
    const normalized = posix.normalize(filePath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const raw = await readFile(new URL(normalized.slice(1), publicRoot), 'utf8');
    const imports = [];
    const withoutImports = raw.replace(IMPORT_RE, (_match, u1, u2, u3, s1, s2) => {
      const target = u1 ?? u2 ?? u3 ?? s1 ?? s2;
      if (target) imports.push(resolvePublicPath(normalized, target));
      return '';
    });
    for (const imported of imports) {
      await inlineCss(imported);
    }
    const rewritten = rewriteRelativeUrls(withoutImports, normalized).trim();
    if (rewritten) {
      chunks.push(`/* ${normalized} */\n${rewritten}\n`);
    }
  }

  for (const sheet of DIARY_STYLESHEETS) {
    await inlineCss(sheet);
  }

  const output = chunks.join('\n');
  await writeFile(new URL('diary-bundle.css', publicRoot), output, 'utf8');
  return {file: '/diary-bundle.css', sources: [...seen], bytes: Buffer.byteLength(output, 'utf8')};
}

export function diaryStylesPackaging() {
  return {
    name: 'nourishing-diary-styles',
    hooks: {'astro:config:setup': buildDiaryStyles},
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildDiaryStyles()));
}
