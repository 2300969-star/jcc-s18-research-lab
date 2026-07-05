const { simulate, tankEHP, chess, equip, comps } = require('./model.js');

const byName = {};
Object.values(equip).forEach(e => {
  if (!byName[e.name]) byName[e.name] = e.id;
});

const id = name => byName[name];
const OFFENSE = [
  '无尽之刃',
  '海克斯科技枪刃',
  '朔极之矛',
  '夜之锋刃',
  '汲取剑',
  '泰坦的坚决',
  '班克斯的魔法帽',
  '大天使之杖',
  '最后的轻语',
  '珠光护手',
  '水银',
  '强袭者的链枷',
  '锐利之刃',
  '疾射火炮',
  '鬼索的狂暴之刃',
  '斯塔缇克电刃',
  '卢安娜的飓风',
  '蓝霸符',
  '巨人捕手',
  '莫雷洛秘典',
  '正义之手',
  '基克的先驱',
].map(id).filter(Boolean);

const DEFENSE = [
  '狂徒铠甲',
  '日炎斗篷',
  '圣盾使的誓约',
  '石像鬼石板甲',
  '振奋盔甲',
  '棘刺背心',
  '巨龙之爪',
  '钢铁烈阳之匣',
  '离子火花',
  '夜之锋刃',
  '水银',
  '汲取剑',
].map(id).filter(Boolean);

const UNIQUE = new Set([id('蓝霸符')].filter(Boolean));

function* combos3(pool) {
  for (let i = 0; i < pool.length; i++) {
    for (let j = i; j < pool.length; j++) {
      for (let k = j; k < pool.length; k++) {
        if (UNIQUE.has(pool[i]) && i === j) continue;
        if (UNIQUE.has(pool[j]) && j === k) continue;
        yield [pool[i], pool[j], pool[k]];
      }
    }
  }
}

function uniqueShownHeroes() {
  const seen = new Set();
  return Object.values(chess)
    .filter(u => u.showHeroTag === '1' && Number(u.price) >= 1 && Number(u.price) <= 5)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .filter(u => !seen.has(u.name) && seen.add(u.name));
}

function hasDuplicateItems(items) {
  return new Set(items).size < items.length;
}

function officialSets() {
  const officialBuilds = new Set();
  const officialCarries = new Set();
  const officialUsed = new Set();
  comps.forEach(c => {
    if (c.carry) {
      officialCarries.add(c.carry.hero);
      officialBuilds.add(c.carry.hero + '|' + c.carryItems.slice().sort().join());
    }
    (c.detail.heroes || []).forEach(h => officialUsed.add(h.name));
  });
  return { officialBuilds, officialCarries, officialUsed };
}

function flagBuild(heroName, itemNames, sets) {
  const key = heroName + '|' + itemNames.slice().sort().join();
  if (sets.officialBuilds.has(key)) return '官方同款';
  if (sets.officialCarries.has(heroName)) return '同C换装';
  if (sets.officialUsed.has(heroName)) return '官方非C';
  return '野路子';
}

function runDpsSearch(heroes, sets) {
  const best = [];
  const bestPerHero = {};
  const duplicateItemRows = [];

  for (const h of heroes) {
    const star = Number(h.price) <= 3 ? 3 : 2;
    for (const combo of combos3(OFFENSE)) {
      const r = simulate(h.id, combo, star);
      if (!r) continue;
      const itemNames = combo.map(x => equip[x].name);
      const row = {
        hero: h.name,
        price: Number(h.price),
        star,
        items: itemNames,
        dps: Math.round(r.dps),
        auto: Math.round(r.auto),
        spell: Math.round(r.spell),
        proc: Math.round(r.proc),
        casts: r.casts,
        attacks: r.attacks,
        duplicateItems: hasDuplicateItems(itemNames),
        flag: flagBuild(h.name, itemNames, sets),
      };

      if (!bestPerHero[h.name] || row.dps > bestPerHero[h.name].dps) bestPerHero[h.name] = row;
      if (row.duplicateItems) duplicateItemRows.push(row);
      if (best.length < 300 || row.dps > best[best.length - 1].dps) {
        best.push(row);
        best.sort((a, b) => b.dps - a.dps);
        if (best.length > 300) best.length = 300;
      }
    }
  }

  return { best, bestPerHero, duplicateItemRows };
}

function runTankSearch(heroes) {
  const best = [];
  for (const h of heroes) {
    const star = 2;
    for (const combo of combos3(DEFENSE)) {
      const r = tankEHP(h.id, combo, star);
      if (!r) continue;
      const row = {
        hero: h.name,
        price: Number(h.price),
        star,
        items: combo.map(x => equip[x].name),
        ehp: Math.round(r.ehp),
        duplicateItems: hasDuplicateItems(combo.map(x => equip[x].name)),
      };
      if (best.length < 200 || row.ehp > best[best.length - 1].ehp) {
        best.push(row);
        best.sort((a, b) => b.ehp - a.ehp);
        if (best.length > 200) best.length = 200;
      }
    }
  }
  return best;
}

function runOutliersAudit() {
  const heroes = uniqueShownHeroes();
  const sets = officialSets();
  const dps = runDpsSearch(heroes, sets);
  const tank = runTankSearch(heroes);
  const officialBestDps = Math.round(Math.max(...comps.filter(c => c.carry).map(c => c.carry.dps)));

  const topDps = dps.best.slice(0, 25);
  const perHeroTop = Object.values(dps.bestPerHero).sort((a, b) => b.dps - a.dps).slice(0, 20);
  const nonOfficialCarryOutliers = Object.values(dps.bestPerHero)
    .filter(r => r.flag === '官方非C' || r.flag === '野路子')
    .sort((a, b) => b.dps - a.dps)
    .slice(0, 20);
  const duplicateItemOutliers = dps.duplicateItemRows
    .filter(r => r.dps >= officialBestDps * 0.85)
    .sort((a, b) => b.dps - a.dps)
    .slice(0, 20);

  const tankSeen = new Set();
  const topTankByHero = tank.filter(r => !tankSeen.has(r.hero) && tankSeen.add(r.hero)).slice(0, 20);

  return {
    summary: {
      heroes: heroes.length,
      offenseCombos: [...combos3(OFFENSE)].length,
      defenseCombos: [...combos3(DEFENSE)].length,
      officialBestDps,
      topDps: topDps.length,
      nonOfficialCarryOutliers: nonOfficialCarryOutliers.length,
      duplicateItemOutliers: duplicateItemOutliers.length,
    },
    topDps,
    perHeroTop,
    nonOfficialCarryOutliers,
    duplicateItemOutliers,
    topTankByHero,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runOutliersAudit(), null, 2));
}

module.exports = { runOutliersAudit };
