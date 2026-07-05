const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const readJSON = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const data = {
  chess: readJSON('data/chess.js').data,
  equip: readJSON('data/equip.js').data,
  race: readJSON('data/race.js').data,
  job: readJSON('data/job.js').data,
  hex: readJSON('data/hex.js').data,
  monster: readJSON('data/monster.js').data,
  lineups: readJSON('data/lineup_detail_total.json').lineup_list,
};

const VERSION = readJSON('data/chess.js').version;
const EDITION = '17.17.6';

function splitCsv(s) {
  return String(s || '').split(',').map(x => x.trim()).filter(Boolean);
}

function splitPipe(s) {
  return String(s || '').split('|').map(x => x.trim()).filter(x => x && x !== '-1');
}

function detailOf(lineup) {
  try {
    return JSON.parse(lineup.detail || '{}');
  } catch (err) {
    return {};
  }
}

function traitDef(id) {
  return data.job[id] || data.race[id] || null;
}

function traitName(id) {
  return (traitDef(id) || {}).name || id;
}

function traitThresholds(id) {
  const t = traitDef(id);
  if (!t) return [1];
  const nums = String(t.numList || '').split('|').map(Number).filter(n => Number.isFinite(n) && n > 0);
  return nums.length ? nums : [1];
}

function minTraitCount(id) {
  return traitThresholds(id)[0] || 1;
}

function activeTier(id, n) {
  let tier = -1;
  traitThresholds(id).forEach((need, i) => {
    if (n >= need) tier = i;
  });
  return tier;
}

function unitTraitIds(unit) {
  if (!unit) return [];
  return [...splitPipe(unit.species), ...splitPipe(unit.class)];
}

function addCount(counts, id, n = 1) {
  if (!id || id === '-1') return;
  counts[id] = (counts[id] || 0) + n;
}

function inferTraitCounts(heroLocation = []) {
  const counts = {};
  for (const h of heroLocation || []) {
    const unit = data.chess[h.hero_id];
    unitTraitIds(unit).forEach(id => addCount(counts, id));

    for (const itemId of splitCsv(h.equipment_id)) {
      const item = data.equip[itemId];
      for (const fid of splitPipe(item && item.fetterID)) addCount(counts, fid);
    }
  }
  return counts;
}

function activeTraitsFromCounts(counts) {
  return Object.entries(counts)
    .filter(([id, n]) => traitDef(id) && activeTier(id, n) >= 0)
    .map(([id, n]) => ({ id, n, name: traitName(id), label: `${n}${traitName(id)}`, tier: activeTier(id, n) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function officialLineups() {
  return data.lineups.filter(l => l.simulator_edition === EDITION);
}

function uniqueHeroes() {
  const seen = new Set();
  return Object.values(data.chess)
    .filter(u => u.showHeroTag === '1' && Number(u.price) >= 1 && Number(u.price) <= 5)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .filter(u => !seen.has(u.name) && seen.add(u.name));
}

function itemName(id) {
  return (data.equip[id] || {}).name || `?${id}`;
}

function heroName(id) {
  return (data.chess[id] || {}).name || `?${id}`;
}

function hexName(id) {
  return (data.hex[id] || {}).name || `?${id}`;
}

function monsterName(id) {
  return (data.monster[id] || {}).name || `?${id}`;
}

function shortLineName(name) {
  const m = String(name || '').match(/【(.+?)】/);
  return m ? m[1] : String(name || '');
}

function mdCell(s) {
  return String(s == null ? '' : s).replace(/\|/g, '/').replace(/\n/g, '<br>');
}

module.exports = {
  ROOT,
  VERSION,
  EDITION,
  data,
  splitCsv,
  splitPipe,
  detailOf,
  traitDef,
  traitName,
  traitThresholds,
  minTraitCount,
  activeTier,
  unitTraitIds,
  inferTraitCounts,
  activeTraitsFromCounts,
  officialLineups,
  uniqueHeroes,
  itemName,
  heroName,
  hexName,
  monsterName,
  shortLineName,
  mdCell,
};
