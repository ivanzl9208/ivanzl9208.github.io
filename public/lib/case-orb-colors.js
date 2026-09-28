// Light / Shadow inputs for the shared orb-21 shader, keyed by case URL slug.
export const caseOrbColors = Object.freeze({
  esim: { light: '#FFBC35', shadow: '#E44F03' },
  menu: { light: '#5B8FFF', shadow: '#FF681F' },
  'ai-assistant': { light: '#dbac6e', shadow: '#F04F1A' },
  b2b: { light: '#303C43', shadow: '#F26722' },
  'pre-sbermobile': { light: '#20AFFF', shadow: '#7AE82F' },
  'ripped-text': { light: '#1abcfe', shadow: '#a259ff' },
  'director-wb': { light: '#24272a', shadow: '#c8cdd2' },
});

// Preserve the original thinking palette for any unconfigured case.
const defaultColors = Object.freeze({ light: '#e6d4ff', shadow: '#3b3f96' });
export function colorsForCase(pathname) {
  const slug = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)?.[1];
  return Object.hasOwn(caseOrbColors, slug) ? caseOrbColors[slug] : defaultColors;
}
