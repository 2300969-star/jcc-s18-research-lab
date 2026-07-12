// 数值透视：对候选路线做反事实拆解，找真正的数值杠杆
const fs = require('fs');
const { simulate, tankEHP, chess, equip } = require('../core/model.js');
const { dataPath, resultPath, reportPath, publicPath, ensureOutputDirs } = require('../lib/project-paths');

const D = p => JSON.parse(fs.readFileSync(dataPath(p), 'utf8')).data;
const race = D('race.js');
const job = D('job.js');
const transitions = JSON.parse(fs.readFileSync(resultPath('transition_results.json'), 'utf8'));
const discovery = JSON.parse(fs.readFileSync(resultPath('discovery_results.json'), 'utf8'));

const byName = {};
Object.values(equip).forEach(e => { if (e && e.name && !byName[e.name]) byName[e.name] = e.id; });
const itemId = name => byName[name];
const itemName = id => (equip[id] || {}).name || id;

// 与发现模型同口径的可量化羁绊。这里用于“去掉某个羁绊看掉多少”。
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
  124: { tiers: [2, 4, 6, 8], fx: t => ({ member: { asPct: [30, 54, 90, 144][t] }, util: [0, 0, 1, 2][t] }) },
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
  .filter(u => u.showHeroTag === '1' && Number(u.price) >= 1 && Number(u.price) <= 5 && !seenUnit.has(u.name) && seenUnit.add(u.name))
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

function teamUnits(stage) {
  return stage.team.map(x => unitByName[x.name]).filter(Boolean);
}

function pct(x) {
  return Math.round(x * 1000) / 10;
}

function round(n) {
  return Math.round(Number(n) || 0);
}

function stageStar(stageKey, u, role, carryStar) {
  if (role === 'carry') return carryStar;
  if (stageKey === 'early') return u.price <= 1 ? 2 : 1;
  if (stageKey === 'mid') return u.price <= 2 ? 2 : 1;
  return 2;
}

function baseTankValue(u) {
  return u.hp * (1 + (u.armor + u.mr) / 200);
}

const TANK_BUILDS = [
  ['狂徒铠甲', '狂徒铠甲', '圣盾使的誓约'].map(itemId).filter(Boolean),
  ['石像鬼石板甲', '日炎斗篷', '狂徒铠甲'].map(itemId).filter(Boolean),
];

function frontProfile(stage) {
  const team = teamUnits(stage);
  const acts = activeTraits(team);
  const tanks = team.filter(u => u.name !== stage.carry)
    .sort((a, b) => baseTankValue(b) - baseTankValue(a))
    .slice(0, 2);
  let withTraits = 0, noTraits = 0;
  const detail = [];
  tanks.forEach((u, i) => {
    const star = stageStar(stage.key, u, 'front', stage.carryStar);
    const ids = TANK_BUILDS[i];
    const full = tankEHP(u.id, ids, star, bonusFor(u, acts));
    const bare = tankEHP(u.id, ids, star, {});
    if (!full || !bare) return;
    withTraits += full.ehp;
    noTraits += bare.ehp;
    detail.push({
      hero: u.name,
      star,
      items: ids.map(itemName),
      ehp: round(full.ehp),
      traitGainPct: pct(full.ehp / bare.ehp - 1),
    });
  });
  return {
    ehp: round(withTraits),
    noTraitEhp: round(noTraits),
    traitGainPct: noTraits ? pct(withTraits / noTraits - 1) : 0,
    tanks: detail,
  };
}

function carryProfile(stage) {
  const team = teamUnits(stage);
  const carry = unitByName[stage.carry];
  const ids = stage.items.map(itemId).filter(Boolean);
  const star = stage.carryStar;
  const acts = activeTraits(team);
  const bonus = bonusFor(carry, acts);
  const base = simulate(carry.id, [], star);
  const itemsOnly = simulate(carry.id, ids, star);
  const traitsOnly = simulate(carry.id, [], star, 30, bonus);
  const full = simulate(carry.id, ids, star, 30, bonus);
  const itemGain = itemsOnly.dps / base.dps;
  const traitGain = traitsOnly.dps / base.dps;
  const fullGain = full.dps / base.dps;
  const interaction = full.dps - (itemsOnly.dps + traitsOnly.dps - base.dps);

  const itemDrops = ids.map((id, idx) => {
    const rest = ids.filter((_, i) => i !== idx);
    const r = simulate(carry.id, rest, star, 30, bonus);
    return {
      item: itemName(id),
      dpsWithout: round(r.dps),
      drop: round(full.dps - r.dps),
      dropPct: pct(1 - r.dps / full.dps),
    };
  }).sort((a, b) => b.drop - a.drop);

  const traitDrops = acts.map(a => {
    const filtered = acts.filter(x => x.id !== a.id);
    const r = simulate(carry.id, ids, star, 30, bonusFor(carry, filtered));
    return {
      trait: a.need + a.name,
      appliesToCarry: carry.traits.includes(a.id) || !!a.fx.team,
      dpsWithout: round(r.dps),
      drop: round(full.dps - r.dps),
      dropPct: pct(1 - r.dps / full.dps),
    };
  }).filter(x => x.drop > 0).sort((a, b) => b.drop - a.drop).slice(0, 6);

  return {
    hero: carry.name,
    star,
    price: carry.price,
    items: stage.items,
    dps: round(full.dps),
    baseDps: round(base.dps),
    itemsOnlyDps: round(itemsOnly.dps),
    traitsOnlyDps: round(traitsOnly.dps),
    auto: round(full.auto),
    spell: round(full.spell),
    proc: round(full.proc),
    itemGainX: Math.round(itemGain * 100) / 100,
    traitGainX: Math.round(traitGain * 100) / 100,
    fullGainX: Math.round(fullGain * 100) / 100,
    interaction: round(interaction),
    interactionPct: pct(interaction / full.dps),
    itemDrops,
    traitDrops,
    activeTraits: acts.map(a => a.need + a.name),
    bonus,
  };
}

function routeLens(route) {
  const stageProfiles = {};
  for (const key of ['early', 'mid', 'late']) {
    const stage = route.stages[key];
    stageProfiles[key] = {
      label: stage.label,
      score: stage.score,
      team: stage.team,
      traits: stage.traits,
      carry: carryProfile(stage),
      front: frontProfile(stage),
      originalReason: stage.reason,
    };
  }
  return {
    name: route.name,
    routeScore: route.score,
    routeTags: route.tags,
    verdict: route.verdict,
    routeComponents: {
      strength: route.strength,
      smooth: route.smooth,
      risk: route.risk,
      pivotCost: route.pivotCost,
      strategic: route.strategic || 0,
    },
    transition: route.transition,
    stages: stageProfiles,
    keyFindings: findings(stageProfiles, route),
  };
}

function findings(stages, route) {
  const out = [];
  const late = stages.late.carry;
  if (late.itemDrops[0]) out.push(`后期${late.hero}最怕少${late.itemDrops[0].item}：DPS -${late.itemDrops[0].dropPct}%`);
  if (late.traitDrops[0]) out.push(`后期第一羁绊杠杆是${late.traitDrops[0].trait}：DPS -${late.traitDrops[0].dropPct}%`);
  if (late.interaction > 0) out.push(`后期装备与羁绊存在正乘法：额外 +${late.interaction} DPS`);
  const mid = stages.mid.carry;
  if (mid.fullGainX >= 5) out.push(`中期${mid.hero}从裸装到完整口径提升 ${mid.fullGainX}x，吃装备/羁绊程度极高`);
  const keep = route.transition.midToLate.keep || [];
  if (keep.length >= 3) out.push(`中后期保留${keep.join('、')}，换壳成本可控`);
  return out.slice(0, 5);
}

function globalLevers(lenses) {
  const rows = [];
  lenses.forEach(route => {
    for (const key of ['early', 'mid', 'late']) {
      const c = route.stages[key].carry;
      rows.push({
        route: route.name,
        stage: route.stages[key].label,
        hero: c.hero,
        dps: c.dps,
        fullGainX: c.fullGainX,
        itemGainX: c.itemGainX,
        traitGainX: c.traitGainX,
        topItem: c.itemDrops[0] && c.itemDrops[0].item,
        topItemDropPct: c.itemDrops[0] && c.itemDrops[0].dropPct,
        topTrait: c.traitDrops[0] && c.traitDrops[0].trait,
        topTraitDropPct: c.traitDrops[0] && c.traitDrops[0].dropPct,
      });
    }
  });
  return {
    highestDps: [...rows].sort((a, b) => b.dps - a.dps).slice(0, 10),
    mostItemDependent: [...rows].sort((a, b) => (b.topItemDropPct || 0) - (a.topItemDropPct || 0)).slice(0, 10),
    mostTraitDependent: [...rows].sort((a, b) => (b.topTraitDropPct || 0) - (a.topTraitDropPct || 0)).slice(0, 10),
    biggestMultiplier: [...rows].sort((a, b) => b.fullGainX - a.fullGainX).slice(0, 10),
  };
}

function writeReport(out) {
  const lines = ['# 数值透视：真正的杠杆在哪里', '', `生成时间：${out.generated}`, ''];
  out.routes.slice(0, 6).forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.name}`);
    lines.push('');
    lines.push(`路线分：${r.routeScore}；分解：强度${r.routeComponents.strength} / 平滑${r.routeComponents.smooth} / 风险${r.routeComponents.risk} / 换壳${r.routeComponents.pivotCost}`);
    r.keyFindings.forEach(x => lines.push(`- ${x}`));
    for (const key of ['early', 'mid', 'late']) {
      const s = r.stages[key], c = s.carry, f = s.front;
      lines.push(`- ${s.label} ${c.hero}${c.star}星：裸${c.baseDps} -> 装备${c.itemsOnlyDps} -> 羁绊${c.traitsOnlyDps} -> 完整${c.dps} DPS（完整${c.fullGainX}x）；前排EHP ${f.ehp}`);
      if (c.itemDrops[0]) lines.push(`  - 最大装备杠杆：${c.itemDrops[0].item}，少它掉 ${c.itemDrops[0].dropPct}%`);
      if (c.traitDrops[0]) lines.push(`  - 最大羁绊杠杆：${c.traitDrops[0].trait}，少它掉 ${c.traitDrops[0].dropPct}%`);
    }
    lines.push('');
  });
  ensureOutputDirs();
  fs.writeFileSync(reportPath('数值透视.md'), lines.join('\n'));
}

const routeSource = transitions.routes.slice(0, 8);
const lenses = routeSource.map(routeLens);
const out = {
  version: discovery.version,
  generated: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  routes: lenses,
  globalLevers: globalLevers(lenses),
  assumptions: [
    '反事实拆解使用同一个30秒木桩战斗模拟。',
    '装备边际 = 保留星级/羁绊，移除单件装备后的DPS损失。',
    '羁绊边际 = 保留装备/星级，移除单个已激活羁绊效果后的DPS损失。',
    '这层仍未解决站位、控制、AOE命中人数、专属强化完整逻辑，需要继续补实战校准。',
  ],
};

fs.writeFileSync(resultPath('numeric_lens_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(publicPath('numeric-lens-data.js'), 'window.NUMERIC_LENS=' + JSON.stringify(out) + ';');
writeReport(out);

console.log('数值透视完成');
out.routes.slice(0, 5).forEach((r, i) => console.log(`${i + 1}. ${r.name}: ${r.keyFindings.join('；')}`));
console.log('输出: artifacts/results/numeric_lens_results.json, public/numeric-lens-data.js, docs/reports/数值透视.md');
