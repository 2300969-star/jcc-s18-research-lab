// 阵容发现引擎：从棋子/装备/羁绊/符文/抽卡概率出发，寻找官方之外的强候选
const fs = require('fs');
const path = require('path');
const { simulate, tankEHP, chess, equip, comps } = require('../core/model.js');
const { currentVersion } = require('../core/version-context.js');
const { ROOT, resultPath, reportPath, publicPath, ensureOutputDirs } = require('../lib/project-paths');

const version = currentVersion(ROOT);
const D = p => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', p), 'utf8')).data;
const race = D('race.js');
const job = D('job.js');
const hex = D('hex.js');
const duelistPerStack = ((job['124'] || {}).desc2 || '').match(/\+(\d+)%攻击速度/g)?.map(x => Number(x.match(/\d+/)[0])) || [5, 8, 13, 24];

const byName = {};
Object.values(equip).forEach(e => { if (e && e.name && !byName[e.name]) byName[e.name] = e.id; });
const itemName = id => (equip[id] || {}).name || id;

// 可量化羁绊效果。机制羁绊用 util 折算，避免把无法数值化的收益直接丢掉。
const TFX = {
  160: { tiers: [3, 5, 7], fx: t => ({ team: { adPct: [10, 35, 60][t], ap: [10, 35, 60][t] } }) },
  161: { tiers: [1, 2, 3], fx: t => ({ team: { manaMult: [1.04, 1.08, 1.2][t] } }) },
  162: { tiers: [3, 5], fx: t => ({ team: { ampPct: [3, 14][t], ehpMult: [1.03, 1.14][t] }, util: [1, 2][t] }) },
  163: { tiers: [3, 5, 7, 9], fx: t => ({ team: { manaMult: [1.35, 1.9, 2.5, 3.4][t] } }) },
  164: { tiers: [3], fx: () => ({ team: { ampPct: 25 } }) },
  165: { tiers: [2, 4, 6, 8, 10], fx: t => ({ team: { armor: [10, 45, 90, 150, 500][t], mr: [10, 45, 90, 150, 500][t] } }) },
  166: { tiers: [3, 5, 8], fx: t => ({ member: { adPct: [60, 110, 110][t], ap: [60, 110, 110][t] }, util: [0, 1, 3][t] }) },
  169: { tiers: [3, 4, 5, 6, 8], fx: t => ({ util: [2, 2.5, 3, 4, 6][t] }) },
  170: { tiers: [2, 4, 6], fx: t => ({ util: [1.5, 3, 6][t] }) },
  171: { tiers: [3, 5, 7, 10], fx: t => ({ team: { onHitMagic: [27, 35, 55, 80][t] }, util: [0, 1, 1.5, 3][t] }) },
  174: { tiers: [1], fx: () => ({ member: { ap: 80 }, util: 1 }) },
  120: { tiers: [3, 5, 7], fx: t => ({ team: { ampPct: [25, 40, 70][t] } }) },
  121: { tiers: [3, 4, 5], fx: t => ({ util: [1.5, 2.5, 4][t] }) },
  122: { tiers: [2, 4, 6], fx: t => ({ util: [1, 1.5, 2][t] }) },
  123: { tiers: [2, 4, 6, 8], fx: t => ({ team: { ap: [25, 50, 80, 120][t] } }) },
  124: { tiers: [2, 4, 6, 8], fx: t => ({ member: { asPct: duelistPerStack[t] * 6 }, util: [0, 0, 1, 2][t] }) },
  125: { tiers: [2, 3, 4, 5], fx: t => ({ team: { adPct: [5, 10, 15, 20][t] } }) },
  126: { tiers: [2, 4, 6], fx: t => ({ team: { armor: [25, 75, 200][t] }, member: { armor: [50, 150, 400][t] } }) },
  127: { tiers: [2, 4, 6], fx: t => ({ team: { ehpMult: [1.015, 1.03, 1.06][t] } }) },
  128: { tiers: [2, 4, 6], fx: t => ({ team: { ap: [4, 7, 11][t] } }) },
  132: { tiers: [2, 4, 6, 8], fx: t => ({ member: { hpPct: [20, 45, 75, 110][t] } }) },
  133: { tiers: [2, 3, 4], fx: t => ({ member: { critPct: [20, 75, 100][t] }, util: [0, 0, 1.5][t] }) },
  134: { tiers: [2, 3, 4, 5], fx: t => ({ team: { mr: [20, 40, 60, 90][t] }, member: { mr: [40, 80, 120, 180][t] } }) },
  135: { tiers: [1, 4], fx: t => ({ team: { ampPct: [6, 14][t] } }) },
  130: { tiers: [1], fx: () => ({ util: 0.5 }) },
  131: { tiers: [1], fx: () => ({ util: 1 }) },
  167: { tiers: [1], fx: () => ({ util: 0 }) },
};

const seenUnit = new Set();
const units = Object.values(chess)
  .filter(u => u.showHeroTag === '1'
    && Number(u.price) >= 1 && Number(u.price) <= 5
    && !(String(u.species) === '-1' && String(u.class) === '-1')
    && !seenUnit.has(u.name) && seenUnit.add(u.name))
  .map(u => ({
    id: u.id,
    name: u.name,
    price: Number(u.price),
    hp: Number(u.initHP),
    ad: Number(u.initAttackDamage),
    as: Number(u.attackSpeed),
    armor: Number(u.armor),
    mr: Number(u.magicResist),
    traits: [...String(u.species || '').split('|'), ...String(u.class || '').split('|')].filter(t => TFX[t]),
  }));
const unitByName = Object.fromEntries(units.map(u => [u.name, u]));
const traitName = id => (job[id] || race[id] || {}).name || id;

const officialCarries = new Set();
const officialUsed = new Set();
comps.forEach(c => {
  if (c.carry) officialCarries.add(c.carry.hero);
  (c.detail.heroes || []).forEach(h => officialUsed.add(h.name));
});

function activeTraits(team) {
  const cnt = {};
  team.forEach(u => u.traits.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
  const act = [];
  for (const [t, n] of Object.entries(cnt)) {
    const def = TFX[t];
    let tier = -1;
    def.tiers.forEach((th, i) => { if (n >= th) tier = i; });
    if (tier >= 0) act.push({ id: t, name: traitName(t), n, need: def.tiers[tier], tier, fx: def.fx(tier) });
  }
  return act;
}

function bonusFor(unit, acts) {
  const b = { adPct: 0, ap: 0, asPct: 0, ampPct: 0, critPct: 0, armor: 0, mr: 0, hpPct: 0, manaMult: 1, onHitMagic: 0, ehpMult: 1 };
  const merge = fx => {
    if (!fx) return;
    for (const k of ['adPct', 'ap', 'asPct', 'ampPct', 'critPct', 'armor', 'mr', 'hpPct', 'onHitMagic']) b[k] += fx[k] || 0;
    if (fx.manaMult) b.manaMult *= fx.manaMult;
    if (fx.ehpMult) b.ehpMult *= fx.ehpMult;
  };
  acts.forEach(a => {
    merge(a.fx.team);
    if (unit.traits.includes(a.id)) merge(a.fx.member);
  });
  return b;
}

const OFFENSE = [
  '无尽之刃', '海克斯科技枪刃', '朔极之矛', '夜之锋刃', '汲取剑', '泰坦的坚决',
  '班克斯的魔法帽', '大天使之杖', '最后的轻语', '珠光护手', '水银', '强袭者的链枷',
  '锐利之刃', '疾射火炮', '鬼索的狂暴之刃', '斯塔缇克电刃', '卢安娜的飓风',
  '蓝霸符', '巨人捕手', '莫雷洛秘典', '正义之手', '基克的先驱',
].map(n => byName[n]).filter(Boolean);
const DEFENSE = [
  '狂徒铠甲', '日炎斗篷', '圣盾使的誓约', '石像鬼石板甲', '振奋盔甲',
  '棘刺背心', '巨龙之爪', '钢铁烈阳之匣', '离子火花', '夜之锋刃', '水银', '汲取剑',
].map(n => byName[n]).filter(Boolean);
const UNIQUE = new Set([byName['蓝霸符']].filter(Boolean));

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

const offenseCombos = [...combos3(OFFENSE)];
const defenseCombos = [...combos3(DEFENSE)];
const bestItemCache = new Map();
function bestItemsFor(u, star) {
  const key = u.id + ':' + star;
  if (bestItemCache.has(key)) return bestItemCache.get(key);
  let best = null;
  for (const ids of offenseCombos) {
    const r = simulate(u.id, ids, star);
    if (r && (!best || r.dps > best.dps)) {
      best = { dps: r.dps, ids, items: ids.map(itemName), auto: r.auto, spell: r.spell, proc: r.proc };
    }
  }
  bestItemCache.set(key, best);
  return best;
}

// 装备不能脱离阵容羁绊单独最优：同一英雄在不同棋盘上重新遍历三件套。
const teamItemCache = new Map();
function bestItemsForTeam(u, star, team, scenario = {}) {
  const acts = activeTraits(team);
  const traitKey = acts.map(a => `${a.id}:${a.need}`).sort().join('|');
  const extraBonus = scenario.carryBonus || {};
  const bonusKey = Object.entries(extraBonus).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join('|');
  const key = `${u.id}:${star}:${traitKey}:${scenario.id || ''}:${bonusKey}`;
  if (teamItemCache.has(key)) return teamItemCache.get(key);
  const traitBonus = bonusFor(u, acts);
  const bonus = { ...traitBonus };
  for (const [k, v] of Object.entries(extraBonus || {})) {
    if (k === 'manaMult' || k === 'ehpMult') bonus[k] = (bonus[k] || 1) * Number(v || 1);
    else bonus[k] = Number(bonus[k] || 0) + Number(v || 0);
  }
  let best = null;
  for (const ids of offenseCombos) {
    const base = simulate(u.id, ids, star, 30, bonus);
    const r = scenario.transformCarry ? scenario.transformCarry(base, { carry: u, items: { ids, items: ids.map(itemName) }, team, acts, stage: null }) : base;
    if (r && (!best || r.dps > best.dps)) {
      best = { dps: r.dps, ids, items: ids.map(itemName), auto: r.auto, spell: r.spell, proc: r.proc };
    }
  }
  teamItemCache.set(key, best);
  return best;
}

const tankCache = new Map();
function bestTankFor(u, star) {
  const key = u.id + ':' + star;
  if (tankCache.has(key)) return tankCache.get(key);
  let best = null;
  for (const ids of defenseCombos) {
    const r = tankEHP(u.id, ids, star);
    if (r && (!best || r.ehp > best.ehp)) best = { ehp: r.ehp, ids, items: ids.map(itemName) };
  }
  tankCache.set(key, best);
  return best;
}

const STAGES = [
  {
    key: 'early', title: '前期最强候选', level: 5, maxCost: 3, carryCosts: [1, 2, 3],
    pricePenalty: 34, fivePenalty: 999, frontScale: 16, expand: 14, beam: 28,
    star: (u, role) => role === 'carry' ? (u.price <= 2 ? 2 : 1) : (u.price <= 1 ? 2 : 1),
    note: '5人口，1/2费二星或3费一星；目标是连胜、保血、少花钱。',
  },
  {
    key: 'mid', title: '中期最强候选', level: 7, maxCost: 4, carryCosts: [2, 3, 4],
    pricePenalty: 12, fivePenalty: 160, frontScale: 20, expand: 16, beam: 32,
    star: (u, role) => role === 'carry' ? (u.price <= 2 ? 3 : u.price <= 3 ? 2 : 1) : (u.price <= 2 ? 2 : 1),
    note: '7人口，二三费可以追，四费先按一星；目标是4阶段战力窗口。',
  },
  {
    key: 'late', title: '后期最强候选', level: 9, maxCost: 5, carryCosts: [3, 4, 5],
    pricePenalty: 2, fivePenalty: 0, frontScale: 25, expand: 18, beam: 36,
    star: (u, role) => role === 'carry' ? (u.price <= 3 ? 3 : 2) : (u.price <= 3 ? 2 : 2),
    note: '9人口终局，三费追三或四五费二星；目标是满成型上限。',
  },
];

function baseTankValue(u) {
  return u.hp * (1 + (u.armor + u.mr) / 200);
}

function traitProgressValue(team, cand) {
  const cnt = {};
  team.forEach(u => u.traits.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
  let v = 0;
  cand.traits.forEach(t => {
    const def = TFX[t];
    const n = (cnt[t] || 0) + 1;
    const next = def.tiers.find(th => n <= th);
    if (!next) return;
    if (n === next) v += 18;
    else v += Math.max(0, 5 - (next - n)) * 2.5;
  });
  return v;
}

function partialHeuristic(team, cand, carry, stage) {
  const t2 = [...team, cand];
  const acts = activeTraits(t2);
  const cb = bonusFor(carry, acts);
  const util = acts.reduce((s, a) => s + (a.fx.util || 0), 0);
  const offense = cb.ampPct * 3.2 + cb.asPct * 1.1 + cb.adPct * 1.1 + cb.ap * 0.75
    + cb.critPct * 0.55 + (cb.manaMult - 1) * 120 + cb.onHitMagic * 0.8;
  const defense = baseTankValue(cand) / 850 + (cand.traits.some(t => ['126', '132', '134', '127', '165'].includes(t)) ? 8 : 0);
  const price = cand.price * stage.pricePenalty + (cand.price === 5 ? stage.fivePenalty : 0);
  return offense + defense + util * 7 + traitProgressValue(team, cand) + acts.length * 1.8 - price;
}

function partialTeamHeuristic(team, carry, stage) {
  return team.reduce((s, u, i) => s + (i ? partialHeuristic(team.slice(0, i), u, carry, stage) : 0), 0);
}

function scoreTeam(stage, carry, carryItems, team, scenario = {}) {
  const acts = activeTraits(team);
  const util = acts.reduce((s, a) => s + (a.fx.util || 0), 0);
  const cStar = stage.star(carry, 'carry');
  const carryBonus = bonusFor(carry, acts);
  for (const [k, v] of Object.entries(scenario.carryBonus || {})) {
    if (k === 'manaMult' || k === 'ehpMult') carryBonus[k] = (carryBonus[k] || 1) * Number(v || 1);
    else carryBonus[k] = Number(carryBonus[k] || 0) + Number(v || 0);
  }
  const baseSim = simulate(carry.id, carryItems.ids, cStar, 30, carryBonus);
  const sim = scenario.transformCarry ? scenario.transformCarry(baseSim, { carry, items: carryItems, team, acts, stage }) : baseSim;

  const tanks = team.filter(u => u.name !== carry.name)
    .sort((a, b) => baseTankValue(b) - baseTankValue(a))
    .slice(0, 2);
  let frontEHP = 0;
  const tankDetail = [];
  tanks.forEach((u, i) => {
    const star = stage.star(u, 'front');
    const bonus = bonusFor(u, acts);
    for (const [key, value] of Object.entries(scenario.teamBonus || {})) {
      if (key === 'manaMult' || key === 'ehpMult') bonus[key] = (bonus[key] || 1) * Number(value || 1);
      else bonus[key] = Number(bonus[key] || 0) + Number(value || 0);
    }
    const ids = i === 0
      ? [byName['狂徒铠甲'], byName['狂徒铠甲'], byName['圣盾使的誓约']].filter(Boolean)
      : [byName['石像鬼石板甲'], byName['日炎斗篷'], byName['狂徒铠甲']].filter(Boolean);
    const r = tankEHP(u.id, ids, star, bonus);
    if (r) {
      frontEHP += r.ehp;
      tankDetail.push({ hero: u.name, star, ehp: Math.round(r.ehp), items: ids.map(itemName) });
    }
  });

  let subDps = 0;
  team.forEach(u => {
    if (u.name === carry.name || tanks.includes(u)) return;
    const b = bonusFor(u, acts);
    const star = stage.star(u, 'side');
    subDps += u.ad * Math.pow(1.5, star - 1) * u.as * (1 + b.adPct / 100) * (1 + b.ampPct / 100) * 0.55;
  });
  const teamCost = team.reduce((s, u) => s + u.price, 0);
  const tempoPenalty = teamCost * stage.pricePenalty * 0.08 + team.filter(u => u.price === 5).length * stage.fivePenalty * 0.15;
  const raw = sim.dps + subDps * 0.45 + frontEHP / stage.frontScale + util * 20 + acts.length * 8;
  const score = raw - tempoPenalty;
  const traits = acts.sort((a, b) => b.need - a.need || b.tier - a.tier).map(a => a.need + a.name);
  return {
    score: Math.round(score),
    rawScore: Math.round(raw),
    tempoPenalty: Math.round(tempoPenalty),
    carryDps: Math.round(sim.dps),
    frontEHP: Math.round(frontEHP),
    subDps: Math.round(subDps),
    util: Math.round(util * 10) / 10,
    teamCost,
    traits,
    tankDetail,
  };
}

function reasonFor(row, stage) {
  const parts = [];
  if (row.carryPrice <= 2 && stage.key !== 'late') parts.push('低费高效率，适合保血连胜');
  if (row.carryPrice === 3 && row.carryStar >= 2) parts.push('三费战力窗口明确，可围绕追三');
  if (row.carryPrice >= 4) parts.push('高费主C上限高，但依赖经济与搜卡节奏');
  if ((row.traits || []).some(t => /斗士|护卫|秘术|福牛|吉祥物/.test(t))) parts.push('前排羁绊能把输出时间拉长');
  if ((row.traits || []).some(t => /决斗|幻灵|混沌|源计划|星之守护者|灵能/.test(t))) parts.push('输出羁绊直接喂主C或全队');
  if (row.carryItems.some(i => /鬼索|蓝霸符|朔极|火炮/.test(i))) parts.push('装备强化攻击频率/施法频率');
  return parts.slice(0, 3).join('；') || '综合分来自主C输出、前排EHP、羁绊与成型成本。';
}

function findStageComps(stage) {
  const allowed = units.filter(u => u.price <= stage.maxCost);
  const carryPool = allowed.filter(u => stage.carryCosts.includes(u.price));
  const carryCands = carryPool.map(u => {
    const star = stage.star(u, 'carry');
    const best = bestItemsFor(u, star);
    const priceTax = u.price * stage.pricePenalty * 0.7 + (u.price === 5 ? stage.fivePenalty : 0);
    return { u, star, best, seedScore: best.dps - priceTax };
  }).filter(x => x.best)
    .sort((a, b) => b.seedScore - a.seedScore);

  const finals = [];
  for (const cc of carryCands) {
    let beam = [[cc.u]];
    for (let slot = 1; slot < stage.level; slot++) {
      const next = [];
      for (const team of beam) {
        const names = new Set(team.map(u => u.name));
        allowed.filter(u => !names.has(u.name))
          .map(u => ({ u, h: partialHeuristic(team, u, cc.u, stage) }))
          .sort((a, b) => b.h - a.h)
          .slice(0, stage.expand)
          .forEach(x => next.push([...team, x.u]));
      }
      const seen = new Set();
      beam = next.map(t => ({ t, h: partialTeamHeuristic(t, cc.u, stage) }))
        .sort((a, b) => b.h - a.h)
        .filter(x => {
          const k = x.t.map(u => u.name).sort().join(',');
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, stage.beam)
        .map(x => x.t);
    }
    beam.slice(0, 8).forEach(team => {
      const optimizedItems = bestItemsForTeam(cc.u, cc.star, team);
      const s = scoreTeam(stage, cc.u, optimizedItems, team);
      const row = {
        stage: stage.key,
        stageTitle: stage.title,
        level: stage.level,
        carry: cc.u.name,
        carryPrice: cc.u.price,
        carryStar: cc.star,
        carryId: cc.u.id,
        carryItems: optimizedItems.items,
        carryItemIds: optimizedItems.ids,
        carryTraitBonus: bonusFor(cc.u, activeTraits(team)),
        officialFlag: officialCarries.has(cc.u.name) ? '官方主C' : officialUsed.has(cc.u.name) ? '官方配角' : '野路子',
        team: team.map(u => ({ name: u.name, price: u.price })),
        ...s,
      };
      row.reason = reasonFor(row, stage);
      finals.push(row);
    });
  }
  const seen = new Set();
  const sorted = finals.sort((a, b) => b.score - a.score)
    .filter(r => {
      const k = r.carry + '|' + r.team.map(u => u.name).sort().join(',');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const carrySeen = new Set();
  const diverse = sorted.filter(r => {
    if (carrySeen.has(r.carry)) return false;
    carrySeen.add(r.carry);
    return true;
  });
  return {
    top: [...diverse, ...sorted.filter(r => !diverse.includes(r))].slice(0, 8),
    byCarry: diverse,
  };
}

// 条件场景只约束机制所需棋子，棋盘和装备仍由同一束搜索自动推出。
function optimizeScenario(stageKey, carryName, mandatoryNames = [], scenario = {}) {
  const stage = STAGES.find(s => s.key === stageKey);
  const carry = unitByName[carryName];
  if (!stage || !carry || !stage.carryCosts.includes(carry.price)) return [];
  const allowed = units.filter(u => u.price <= stage.maxCost);
  const mandatory = mandatoryNames.map(name => unitByName[name]).filter(Boolean).filter(u => u.name !== carry.name);
  if (mandatory.some(u => !allowed.includes(u)) || mandatory.length + 1 > stage.level) return [];
  let beam = [[carry, ...mandatory]];
  for (let slot = beam[0].length; slot < stage.level; slot++) {
    const next = [];
    for (const team of beam) {
      const names = new Set(team.map(u => u.name));
      allowed.filter(u => !names.has(u.name))
        .map(u => ({ u, h: partialHeuristic(team, u, carry, stage) }))
        .sort((a, b) => b.h - a.h)
        .slice(0, stage.expand)
        .forEach(x => next.push([...team, x.u]));
    }
    const seen = new Set();
    beam = next.map(t => ({ t, h: partialTeamHeuristic(t, carry, stage) }))
      .sort((a, b) => b.h - a.h)
      .filter(x => {
        const key = x.t.map(u => u.name).sort().join(',');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, stage.beam)
      .map(x => x.t);
  }
  return beam.slice(0, 10).map(team => {
    const items = bestItemsForTeam(carry, stage.star(carry, 'carry'), team, scenario);
    const result = scoreTeam(stage, carry, items, team, scenario);
    return {
      stage: stage.key,
      level: stage.level,
      carry: carry.name,
      carryPrice: carry.price,
      carryStar: stage.star(carry, 'carry'),
      carryItems: items.items,
      carryItemIds: items.ids,
      carryTraitBonus: bonusFor(carry, activeTraits(team)),
      team: team.map(u => ({ name: u.name, price: u.price })),
      ...result,
    };
  }).sort((a, b) => b.score - a.score);
}

function numericMonsters() {
  const carryRows = units.map(u => {
    const star = u.price <= 3 ? 3 : 2;
    const b = bestItemsFor(u, star);
    return {
      hero: u.name,
      price: u.price,
      star,
      dps: Math.round(b.dps),
      items: b.items,
      auto: Math.round(b.auto),
      spell: Math.round(b.spell),
      proc: Math.round(b.proc),
      officialFlag: officialCarries.has(u.name) ? '官方主C' : officialUsed.has(u.name) ? '官方配角' : '野路子',
      value: Math.round(b.dps / Math.pow(u.price, 1.45)),
    };
  });
  const tankRows = units.map(u => {
    const star = u.price >= 4 ? 2 : 2;
    const b = bestTankFor(u, star);
    return { hero: u.name, price: u.price, star, ehp: Math.round(b.ehp), items: b.items };
  });
  return {
    carry: carryRows.slice().sort((a, b) => b.dps - a.dps).slice(0, 12),
    efficiency: carryRows.slice().sort((a, b) => b.value - a.value || b.dps - a.dps).slice(0, 12),
    tank: tankRows.slice().sort((a, b) => b.ehp - a.ehp).slice(0, 12),
  };
}

// 17.7 当前客户端/公告证据：规则集 mechanics.shopOdds。
// 1、2、7 级规则集仍标记为未验证，暂沿用旧表先验；10级仅用于高端购物虚拟概率。
const SHOP_ODDS = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [25, 40, 30, 5, 0],
  7: [19, 30, 35, 15, 1],
  8: [16, 20, 35, 25, 4],
  9: [9, 15, 30, 30, 16],
  10: [5, 10, 20, 40, 25],
};

function binomTail(n, p, k) {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return n >= k ? 1 : 0;
  let pmf = Math.pow(1 - p, n);
  let cdf = pmf;
  for (let i = 1; i < k; i++) {
    pmf *= (n - i + 1) / i * p / (1 - p);
    cdf += pmf;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

function hitProb({ level, cost, copies, gold, owned = 0 }) {
  const odds = (SHOP_ODDS[level] || [0, 0, 0, 0, 0])[cost - 1] / 100;
  const count = units.filter(u => u.price === cost).length || 1;
  const pSlot = odds / count;
  const shops = Math.floor(gold / 2);
  const slots = shops * 5;
  const need = Math.max(0, copies - owned);
  return { level, cost, copies, owned, gold, shops, slots, unitCount: count, pSlot, probability: binomTail(slots, pSlot, need) };
}

function shopModel(stageComps) {
  const unitCounts = Object.fromEntries([1, 2, 3, 4, 5].map(c => [c, units.filter(u => u.price === c).length]));
  const generic = [
    { name: '1费三星慢D', level: 5, cost: 1, copies: 9, gold: 50, note: '5级50金搜，适合低费赌狗。' },
    { name: '2费三星慢D', level: 6, cost: 2, copies: 9, gold: 50, note: '6级50金搜，适合二费核心。' },
    { name: '3费三星慢D', level: 7, cost: 3, copies: 9, gold: 50, note: '7级50金搜，适合贾克斯/佐伊这类三费核心。' },
    { name: '4费二星启动', level: 8, cost: 4, copies: 3, gold: 40, note: '8级40金搜二星四费。' },
    { name: '5费二星九五', level: 9, cost: 5, copies: 3, gold: 60, note: '9级60金搜二星五费，极吃经济。' },
  ].map(p => ({ ...p, ...hitProb(p), pct: Math.round(hitProb(p).probability * 1000) / 10 }));

  const targetNames = [...new Set([
    ...stageComps.early.slice(0, 2).map(r => r.carry),
    ...stageComps.mid.slice(0, 3).map(r => r.carry),
    ...stageComps.late.slice(0, 4).map(r => r.carry),
  ])];
  const targetHits = targetNames.map(name => {
    const u = unitByName[name];
    const level = u.price <= 1 ? 5 : u.price === 2 ? 6 : u.price === 3 ? 7 : u.price === 4 ? 8 : 9;
    const copies = u.price <= 3 ? 9 : 3;
    const gold = u.price <= 3 ? 50 : u.price === 4 ? 40 : 60;
    const p = hitProb({ level, cost: u.price, copies, gold });
    return { hero: name, price: u.price, target: copies === 9 ? '三星' : '二星', ...p, pct: Math.round(p.probability * 1000) / 10 };
  });
  return {
    odds: SHOP_ODDS,
    unitCounts,
    generic,
    targetHits,
    evidence: {
      source: 'data/ruleset/monster-invasion-17.7.json',
      confirmedLevels: [3, 4, 5, 6, 8, 9],
      priorLevels: [1, 2, 7],
      virtualLevels: [10],
    },
  };
}

function scoreAug(h) {
  const text = ((h.name || '') + ' ' + (h.desc || '')).replace(/\s+/g, ' ');
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)%?/g)].map(m => Number(m[1]));
  const nsum = nums.reduce((s, n) => s + Math.min(n, 120), 0);
  const level = Number(h.level || 0);
  const base = level === 3 ? 18 : level === 2 ? 10 : level === 4 ? 12 : 6;
  const combat = /攻击速度|攻速|伤害|法术|物理|暴击|护甲|魔抗|生命|护盾|治疗|全能吸血|减伤|强度|抗性|最大生命/.test(text);
  const economy = /金币|利息|经验|商店|刷新|免费|战利品|宝箱|存钱|购买经验|升级/.test(text);
  const item = /装备|成装|基础装备|组件|奥恩|光明|重铸|锻炉|百宝袋|散件/.test(text);
  const trait = /之心|之徽|之冕|纹章|羁绊|队伍规模/.test(text);
  const hero = level === 4 || /提供1个.*。|你的.*获得/.test(text);
  const cats = [];
  if (hero) cats.push('hero');
  if (combat) cats.push('combat');
  if (economy) cats.push('economy');
  if (item) cats.push('item');
  if (trait) cats.push('trait');
  if (!cats.length) cats.push('other');
  const score = base + nsum * 0.08 + (combat ? 18 : 0) + (economy ? 16 : 0) + (item ? 14 : 0) + (trait ? 13 : 0) + (hero ? 8 : 0);
  let reason = [];
  if (combat) reason.push('直接战力');
  if (economy) reason.push('经济/经验');
  if (item) reason.push('装备资源');
  if (trait) reason.push('羁绊入口');
  if (hero) reason.push('英雄强化');
  return {
    name: h.name,
    level,
    score: Math.round(score),
    cats,
    reason: reason.join('、') || '文本未命中主分类',
    desc: text.slice(0, 96),
  };
}

function augmentLeads() {
  const rows = Object.values(hex).filter(h => h && h.name).map(scoreAug);
  const byCat = cat => rows.filter(r => r.cats.includes(cat)).sort((a, b) => b.score - a.score).slice(0, 10);
  return {
    combat: byCat('combat'),
    economy: byCat('economy'),
    item: byCat('item'),
    trait: byCat('trait'),
    hero: byCat('hero'),
  };
}

function writeReport(out) {
  const lines = [];
  lines.push('# 阵容发现研究');
  lines.push('');
  lines.push(`生成时间：${out.generated}`);
  lines.push('');
  lines.push('## 阶段阵容候选');
  for (const [key, rows] of Object.entries(out.stageComps)) {
    const title = STAGES.find(s => s.key === key).title;
    lines.push('');
    lines.push(`### ${title}`);
    rows.slice(0, 5).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.carry}${r.carryStar}星（${r.officialFlag}） ${r.carryItems.join('+')}：${r.score}分；${r.traits.slice(0, 5).join(' / ')}`);
      lines.push(`   阵容：${r.team.map(u => u.name + u.price + '费').join('、')}`);
      lines.push(`   理由：${r.reason}`);
    });
  }
  lines.push('');
  lines.push('## 数值怪');
  out.numericMonsters.carry.slice(0, 8).forEach((r, i) => lines.push(`${i + 1}. ${r.hero}${r.star}星 ${r.items.join('+')} = ${r.dps}/秒（${r.officialFlag}）`));
  lines.push('');
  lines.push('## 抽卡概率样例');
  out.shopModel.generic.forEach(r => lines.push(`- ${r.name}：${r.level}级，${r.gold}金，命中${r.copies}张同名的近似概率 ${r.pct}%`));
  ensureOutputDirs();
  fs.writeFileSync(reportPath('阵容发现研究.md'), lines.join('\n'));
}

const stageSearch = Object.fromEntries(STAGES.map(s => [s.key, findStageComps(s)]));
const stageComps = Object.fromEntries(STAGES.map(s => [s.key, stageSearch[s.key].top]));
const carryAtlas = Object.fromEntries(STAGES.map(s => [s.key, stageSearch[s.key].byCarry]));
function generatedDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const out = {
  version: version.label,
  generated: generatedDate(),
  searchSpace: {
    heroes: units.length,
    offenseCombos: offenseCombos.length,
    defenseCombos: defenseCombos.length,
    stageStates: STAGES.reduce((s, x) => s + x.level * x.beam * x.expand, 0),
  },
  stages: STAGES.map(s => ({ key: s.key, title: s.title, level: s.level, note: s.note })),
  stageComps,
  carryAtlas,
  numericMonsters: numericMonsters(),
  shopModel: shopModel(stageComps),
  augmentLeads: augmentLeads(),
  assumptions: [
    '阶段星级是假设：前期不默认追三，中期二三费可追，后期按满成型上限。',
    '抽卡概率是独立近似模型：按每次商店5格、费用概率、同费用英雄均匀分布计算，未扣除公共牌库、同行和已拿牌。',
    '羁绊只建模可直接量化的攻击/法强/攻速/双抗/生命/回蓝/增伤；黑客、魔盗团、AI程序等机制按 util 保守折算。',
    '输出模拟仍是30秒单体木桩，会低估AOE、控制、斩杀、站位和技能打断收益。',
  ],
};

const confirmedShopOdds = {
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [25, 40, 30, 5, 0],
  8: [16, 20, 35, 25, 4],
  9: [9, 15, 30, 30, 16],
};
for (const [level, expected] of Object.entries(confirmedShopOdds)) {
  if (JSON.stringify(out.shopModel.odds[level]) !== JSON.stringify(expected)) {
    throw new Error(`17.7商店概率漂移：等级${level}`);
  }
}
if (out.shopModel.unitCounts[5] !== 8) throw new Error('17.7五费英雄种数应为8');
if (units.some(unit => /训练假人/.test(unit.name))) throw new Error('非商店训练假人混入抽卡模型');

fs.writeFileSync(resultPath('discovery_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(publicPath('discovery-data.js'), 'window.DISCOVERY=' + JSON.stringify(out) + ';');
writeReport(out);

console.log('阵容发现完成:', out.version);
for (const s of STAGES) {
  const top = out.stageComps[s.key][0];
  console.log(`${s.title}: ${top.carry}${top.carryStar}星 ${top.score}分 ${top.traits.slice(0, 4).join('/')}`);
}
console.log('输出: artifacts/results/discovery_results.json, public/discovery-data.js, docs/reports/阵容发现研究.md');

module.exports = { optimizeScenario, activeTraits, bonusFor, units, unitByName, STAGES, itemName };
