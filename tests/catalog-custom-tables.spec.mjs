import { test, expect } from '@playwright/test';

const URL = 'http://localhost:3333/unturned/catalog/';

test('PRESET_TABLES is defined and has entries', async ({ page }) => {
  await page.goto(URL);
  const count = await page.evaluate(() => PRESET_TABLES.length);
  expect(count).toBeGreaterThanOrEqual(8);
});

test('filterEntriesByTable filters weapons correctly', async ({ page }) => {
  await page.goto(URL);
  // Wait for data to load
  await page.waitForFunction(() => typeof allEntries !== 'undefined' && allEntries.length > 0);
  const result = await page.evaluate(() => {
    const weapons = filterEntriesByTable(allEntries, PRESET_TABLES[0]);
    return {
      count: weapons.length,
      types: [...new Set(weapons.map(e => e.type))].sort(),
    };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.types).toEqual(expect.arrayContaining(['Gun']));
  // Should only contain weapon types
  for (const t of result.types) {
    expect(['Gun', 'Melee', 'Throwable']).toContain(t);
  }
});

test('detectColumnsForEntries returns relevant columns for weapons', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => typeof allEntries !== 'undefined' && allEntries.length > 0);
  const cols = await page.evaluate(() => {
    const weapons = filterEntriesByTable(allEntries, PRESET_TABLES[0]);
    return detectColumnsForEntries(weapons).map(c => c.key);
  });
  expect(cols).toContain('name');
  expect(cols).toContain('properties.damage_player');
});

test('loadTableDefs returns preset tables on first load', async ({ page }) => {
  await page.goto(URL);
  // Clear any existing localStorage
  await page.evaluate(() => localStorage.removeItem('ut:catalog:tables'));
  const defs = await page.evaluate(() => loadTableDefs());
  expect(defs.length).toBeGreaterThanOrEqual(8);
  expect(defs[0].label).toBe('Weapons');
  expect(defs[0].anyConditions.length).toBeGreaterThan(0);
});

test('getKnownFieldValues returns type values', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => typeof allEntries !== 'undefined' && allEntries.length > 0);
  const types = await page.evaluate(() => getKnownFieldValues(allEntries, 'type'));
  expect(types).toContain('Gun');
  expect(types).toContain('Food');
  expect(types).toContain('Vehicle');
});
