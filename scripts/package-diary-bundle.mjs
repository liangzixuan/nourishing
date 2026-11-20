import {stat,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
import {buildLocalCharts} from './package-local-charts.mjs';
import {buildLocalSettings} from './package-local-settings.mjs';
import {buildLocalDiary} from './package-local-diary.mjs';
import {packageAdjustmentModel} from './package-adjustment-model.mjs';

const publicRoot = new URL('../public/', import.meta.url);
const EXTERNAL_DYNAMIC = new Set(['./report-source/renderer.js','./local-chart-projection.js','./local-diary-projection.js']);

export async function buildDiaryBundle() {
  const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  await writeFile(new URL('app-version.js',publicRoot),'export const appVersion='+JSON.stringify(version)+';\n');
  await buildLocalCharts();
  await buildLocalSettings();
  await buildLocalDiary();
  await packageAdjustmentModel();
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
      codeSplitting: false,
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
