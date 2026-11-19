import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';

const publicRoot = new URL('../public/', import.meta.url);
const EXTERNAL_DYNAMIC = new Set(['./offline-sync.js', './report-source/renderer.js']);

export async function buildDiaryBundle() {
  const input = fileURLToPath(new URL('diary.js', publicRoot));
  const file = fileURLToPath(new URL('diary-bundle.js', publicRoot));
  const bundle = await rolldown({
    input,
    external: source => EXTERNAL_DYNAMIC.has(source) || source.startsWith('/vendor/'),
  });
  try {
    await bundle.write({
      file,
      format: 'es',
      minify: true,
    });
  } finally {
    await bundle.close();
  }
  const {size} = await stat(file);
  return {file: '/diary-bundle.js', bytes: size};
}

export function diaryBundlePackaging() {
  return {
    name: 'nourishing-diary-bundle',
    hooks: {'astro:config:setup': buildDiaryBundle},
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildDiaryBundle()));
}
