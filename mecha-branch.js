// 机甲线分叉实验：同一套机甲前中期壳子下，比较贾克斯/蕾欧娜/瑟提/佛耶戈终局分支。
const fs = require('fs');
const path = require('path');
const { currentVersion } = require('./version-context.js');
const { simulate, tankEHP, chess, equip } = require('./model.js');

const ROOT = __dirname;
const version = currentVersion(ROOT);
const readData = p => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', p), 'utf8')).data;
const race = readData('race.js');
const job = readData('job.js');

const byName = {};
Object.values(equip).forEach(e => {
  if (e && e.name && !byName[e.name]) byName[e.name] = e.id;
});
const itemName = id => (equip[id] || {}).name || id;

// 与 teamsearch.js 保持同一羁绊口径：直接数值羁绊入模型，机制羁绊用 util 保守折算。
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

const traitName = id => (job[id] || race[id] || {}).name || id;
const seen = new Set();
const units = Object.values(chess)
  .filter(u => u.showHeroTag === '1' && Number(u.price) >= 1 && Number(u.price) <= 5 && !seen.has(u.name) && seen.add(u.name))
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

function activeTraits(team) {
  const cnt = {};
  team.forEach(u => u.traits.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
  const act = [];
  for (const [id, n] of Object.entries(cnt)) {
    const def = TFX[id];
    if (!def) continue;
    let tier = -1;
    def.tiers.forEach((th, i) => { if (n >= th) tier = i; });
    if (tier >= 0) act.push({ id, name: traitName(id), n, need: def.tiers[tier], tier, fx: def.fx(tier) });
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

function countTrait(team, id) {
  return team.reduce((s, u) => s + (u.traits.includes(id) ? 1 : 0), 0);
}

function baseTankValue(u) {
  return u.hp * (1 + (u.armor + u.mr) / 200);
}

function combos(pool, k, start, picked, visit) {
  if (picked.length === k) {
    visit(picked.slice());
    return;
  }
  for (let i = start; i <= pool.length - (k - picked.length); i++) {
    picked.push(pool[i]);
    combos(pool, k, i + 1, picked, visit);
    picked.pop();
  }
}

function itemCombos(names) {
  const ids = names.map(n => byName[n]).filter(Boolean);
  const unique = new Set([byName['蓝霸符']].filter(Boolean));
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i; j < ids.length; j++) {
      for (let k = j; k < ids.length; k++) {
        if (unique.has(ids[i]) && i === j) continue;
        if (unique.has(ids[j]) && j === k) continue;
        out.push([ids[i], ids[j], ids[k]]);
      }
    }
  }
  return out;
}

const COMMON_POOL = [
  '孙悟空', '德莱文', '贾克斯', '瑟提', '蕾欧娜',
  '卡蜜尔', '乐芙兰', '佛耶戈',
  '蔚', '锐雯', '布里茨', '瑟庄妮',
  '波比', '芮尔', '阿利斯塔', '艾克',
  '迦娜', '费德提克', '莫德凯撒', '厄斐琉斯',
  '莎弥拉', '娑娜', '厄加特', '努努和威朗普',
].map(n => unitByName[n]).filter(Boolean);

const ITEM_POOLS = {
  jax: ['鬼索的狂暴之刃', '水银', '泰坦的坚决', '疾射火炮', '汲取剑', '珠光护手', '班克斯的魔法帽', '巨人捕手', '正义之手', '夜之锋刃'],
  leona: ['朔极之矛', '鬼索的狂暴之刃', '水银', '泰坦的坚决', '珠光护手', '班克斯的魔法帽', '蓝霸符', '正义之手', '巨人捕手'],
  viego: ['珠光护手', '正义之手', '泰坦的坚决', '汲取剑', '鬼索的狂暴之刃', '朔极之矛', '班克斯的魔法帽', '蓝霸符', '巨人捕手', '离子火花'],
  sett: ['泰坦的坚决', '汲取剑', '水银', '正义之手', '鬼索的狂暴之刃', '狂徒铠甲', '圣盾使的誓约', '石像鬼石板甲', '振奋盔甲', '巨龙之爪'],
};

const TANK_BUILD_1 = ['狂徒铠甲', '狂徒铠甲', '圣盾使的誓约'].map(n => byName[n]).filter(Boolean);
const TANK_BUILD_2 = ['石像鬼石板甲', '日炎斗篷', '狂徒铠甲'].map(n => byName[n]).filter(Boolean);

const BRANCHES = [
  {
    key: 'leona',
    label: '蕾欧娜终局C',
    carry: '蕾欧娜',
    star: 2,
    required: ['蕾欧娜', '德莱文', '瑟提', '佛耶戈', '卡蜜尔'],
    minTraits: { 166: 3, 120: 3 },
    itemPool: ITEM_POOLS.leona,
    type: 'carry',
    thesis: '贾克斯壳子上9后，如果有蕾欧娜2星与青龙刀/鬼索/水银，转成真实终局上限。',
  },
  {
    key: 'jax',
    label: '贾克斯三星停牌',
    carry: '贾克斯',
    star: 3,
    required: ['贾克斯', '德莱文', '瑟提'],
    minTraits: { 166: 3 },
    itemPool: ITEM_POOLS.jax,
    type: 'carry',
    thesis: '最稳落地分支，靠三费三星和机甲/斗士/护卫把输出时间拉满。',
  },
  {
    key: 'viego',
    label: '混沌佛耶戈收割',
    carry: '佛耶戈',
    star: 2,
    required: ['佛耶戈', '卡蜜尔', '蕾欧娜', '德莱文', '瑟提'],
    minTraits: { 120: 3, 166: 3 },
    itemPool: ITEM_POOLS.viego,
    type: 'carry',
    thesis: '同样吃混沌，但更依赖切入残局和法系装备，理论上不如蕾欧娜稳定。',
  },
  {
    key: 'sett',
    label: '瑟提主坦/半肉C',
    carry: '瑟提',
    star: 2,
    required: ['瑟提', '贾克斯', '德莱文'],
    minTraits: { 166: 3 },
    itemPool: ITEM_POOLS.sett,
    type: 'frontline',
    thesis: '检验瑟提到底能不能从主坦升格成“吃装备的核心”，而不是只当机甲挂件。',
  },
];
BRANCHES.forEach(b => { b.itemCombos = itemCombos(b.itemPool); });

function starOf(u, branch, role) {
  if (u.name === branch.carry) return branch.star;
  if (role === 'tank') return u.price >= 5 ? 1 : 2;
  return u.price <= 3 ? 2 : 1;
}

function roughScore(branch, team, level) {
  const acts = activeTraits(team);
  const carry = unitByName[branch.carry];
  const b = bonusFor(carry, acts);
  const util = acts.reduce((s, a) => s + (a.fx.util || 0), 0);
  const traitScore = acts.reduce((s, a) => s + a.need * 10 + a.tier * 8, 0);
  const offense = b.ampPct * 3.5 + b.asPct * 1.2 + b.adPct + b.ap * 0.8 + (b.manaMult - 1) * 130 + b.onHitMagic;
  const frontline = team.slice().sort((a, b2) => baseTankValue(b2) - baseTankValue(a)).slice(0, 3)
    .reduce((s, u) => s + baseTankValue(u) / 900, 0);
  const costTax = team.reduce((s, u) => s + Math.max(0, u.price - 3) * 3, 0) + (level === 9 ? 0 : 8);
  const exact = Object.entries(branch.minTraits || {}).reduce((s, [id, n]) => s + Math.max(0, countTrait(team, id) - n), 0);
  return offense + frontline + traitScore + util * 10 + exact * 7 - costTax;
}

function satisfies(branch, team) {
  return Object.entries(branch.minTraits || {}).every(([id, n]) => countTrait(team, id) >= Number(n));
}

function bestItemsForBranch(branch, carry, acts) {
  let best = null;
  const bonus = bonusFor(carry, acts);
  for (const ids of branch.itemCombos) {
    const sim = simulate(carry.id, ids, branch.star, 30, bonus);
    if (!sim) continue;
    let primaryEHP = 0;
    if (branch.type === 'frontline') {
      const ehp = tankEHP(carry.id, ids, branch.star, bonus);
      primaryEHP = ehp ? ehp.ehp : 0;
    }
    const value = branch.type === 'frontline'
      ? sim.dps * 0.65 + primaryEHP / 14
      : sim.dps;
    if (!best || value > best.value) best = { ids, names: ids.map(itemName), sim, primaryEHP, value };
  }
  return best;
}

function scoreTeam(branch, team, level) {
  const acts = activeTraits(team);
  const carry = unitByName[branch.carry];
  const best = bestItemsForBranch(branch, carry, acts);
  if (!best) return null;

  const tankCandidates = team.filter(u => u.name !== branch.carry)
    .sort((a, b) => baseTankValue(b) - baseTankValue(a))
    .slice(0, 2);
  let frontEHP = 0;
  const tankDetail = [];
  tankCandidates.forEach((u, i) => {
    const ids = i === 0 ? TANK_BUILD_1 : TANK_BUILD_2;
    const r = tankEHP(u.id, ids, starOf(u, branch, 'tank'), bonusFor(u, acts));
    if (r) {
      frontEHP += r.ehp;
      tankDetail.push({ hero: u.name, star: starOf(u, branch, 'tank'), ehp: Math.round(r.ehp), items: ids.map(itemName) });
    }
  });

  let subDps = 0;
  team.forEach(u => {
    if (u.name === branch.carry || tankCandidates.includes(u)) return;
    const b = bonusFor(u, acts);
    subDps += u.ad * Math.pow(1.5, starOf(u, branch, 'side') - 1) * u.as
      * (1 + b.adPct / 100) * (1 + b.ampPct / 100) * 0.55;
  });
  const util = acts.reduce((s, a) => s + (a.fx.util || 0), 0);
  const traitBonus = acts.length * 8;
  const highCostTax = Math.max(0, team.filter(u => u.price === 5).length - (level === 9 ? 2 : 1)) * 28;
  const raw = branch.type === 'frontline'
    ? best.sim.dps * 0.65 + best.primaryEHP / 14 + frontEHP / 28 + subDps * 0.42 + util * 18 + traitBonus
    : best.sim.dps + frontEHP / 22 + subDps * 0.45 + util * 18 + traitBonus;
  const score = Math.round(raw - highCostTax);
  return {
    branch: branch.key,
    label: branch.label,
    level,
    carry: branch.carry,
    carryStar: branch.star,
    score,
    carryDps: Math.round(best.sim.dps),
    primaryEHP: Math.round(best.primaryEHP || 0),
    frontEHP: Math.round(frontEHP),
    subDps: Math.round(subDps),
    util: Math.round(util * 10) / 10,
    items: best.names,
    traits: acts.sort((a, b) => b.need - a.need || b.tier - a.tier).map(a => `${a.need}${a.name}`),
    team: team.map(u => ({ name: u.name, price: u.price })),
    tanks: tankDetail,
    thesis: branch.thesis,
  };
}

function searchBranch(branch, level) {
  const required = [...new Set(branch.required)].map(n => unitByName[n]).filter(Boolean);
  const reqNames = new Set(required.map(u => u.name));
  const rest = COMMON_POOL.filter(u => !reqNames.has(u.name));
  const need = level - required.length;
  const rough = [];
  combos(rest, need, 0, [], picked => {
    const team = [...required, ...picked];
    if (!satisfies(branch, team)) return;
    rough.push({ team, rough: roughScore(branch, team, level) });
  });
  const topRough = rough.sort((a, b) => b.rough - a.rough).slice(0, 180);
  const scored = topRough.map(x => scoreTeam(branch, x.team, level)).filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
}

function branchFindings(rows) {
  const bestByBranch = Object.fromEntries(BRANCHES.map(b => {
    const best = rows.filter(r => r.branch === b.key).sort((a, c) => c.score - a.score)[0];
    return [b.key, best];
  }));
  const overall = rows.slice().sort((a, b) => b.score - a.score);
  const top = overall[0];
  const jax = bestByBranch.jax;
  const leona = bestByBranch.leona;
  const sett = bestByBranch.sett;
  const viego = bestByBranch.viego;
  const findings = [];
  if (leona && jax) {
    const gap = leona.score - jax.score;
    findings.push(gap >= 0
      ? `蕾欧娜分支反超贾克斯 ${gap} 分，说明机甲壳的终局上限不是停贾克斯，而是上9找蕾欧娜2星。`
      : `贾克斯分支领先蕾欧娜 ${Math.abs(gap)} 分，说明当前参数下三星贾克斯仍是更稳终点。`);
  }
  if (viego && leona) {
    findings.push(`佛耶戈分支比蕾欧娜低 ${Math.max(0, leona.score - viego.score)} 分，混沌牌更像给蕾欧娜开乘区，不是抢主C。`);
  }
  if (sett && jax) {
    findings.push(`瑟提半肉分支比贾克斯低 ${Math.max(0, jax.score - sett.score)} 分，但会显著抬前排；它更适合当主坦阈值，不适合作为最终输出答案。`);
  }
  findings.push(`当前最高路线是：${top.label}，${top.level}人口，${top.items.join('+')}，模型分 ${top.score}。`);
  return findings;
}

function generatedDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function writeReport(out) {
  const lines = [];
  lines.push('# 机甲线分叉实验');
  lines.push('');
  lines.push(`生成时间：${out.generated}`);
  lines.push(`数据版本：${out.version}`);
  lines.push('');
  lines.push('## 新发现');
  out.findings.forEach(x => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## 分支最高排名');
  out.summary.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.label}（${r.level}人口） ${r.score}分：${r.carry}${r.carryStar}星 ${r.items.join('+')}`);
    lines.push(`   阵容：${r.team.map(u => `${u.name}${u.price}费`).join('、')}`);
    lines.push(`   羁绊：${r.traits.slice(0, 7).join(' / ')}`);
  });
  lines.push('');
  lines.push('## 运营判断');
  lines.push('- 前中期仍按机甲壳开：孙悟空/德莱文/贾克斯/护卫或斗士过渡，羊刀/水银/泰坦优先让贾克斯吃。');
  lines.push('- 上9后看到蕾欧娜2星、佛耶戈、卡蜜尔，并且能做青龙刀时，优先测试蕾欧娜C；没有蕾欧娜2星就继续停贾克斯。');
  lines.push('- 佛耶戈不是不能C，但模型显示同一混沌机甲壳里它更像收割副C；除非法系装备特别歪，否则不要为了佛耶戈拆贾克斯/蕾欧娜装备。');
  lines.push('- 瑟提装备收益主要体现在前排阈值，适合吃肉装稳血，不适合作为“颠覆性输出核心”。');
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', '机甲分叉实验.md'), lines.join('\n'));
}

const rows = [];
for (const branch of BRANCHES) {
  [8, 9].forEach(level => rows.push(...searchBranch(branch, level)));
}
const summary = BRANCHES.map(b => rows.filter(r => r.branch === b.key).sort((a, c) => c.score - a.score)[0])
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);
const out = {
  version: version.label,
  generated: generatedDate(),
  assumptions: [
    '这是同壳分叉实验：候选池固定为机甲、混沌、护卫、斗士、秘术、五费补强等与机甲线自然相关的棋子。',
    '打分口径沿用 teamsearch：主C 30秒木桩DPS + 副输出折算 + 前排EHP + 机制羁绊 util。',
    '瑟提分支使用半肉/主坦口径，额外计算自身EHP；它和纯输出C不是完全同一角色，但可判断装备是否值得倾斜。',
    '模型未模拟站位、仇恨、技能命中、控制链和真实对局同行，只用于发现值得实战验证的分叉。',
  ],
  branches: BRANCHES.map(b => ({ key: b.key, label: b.label, carry: b.carry, thesis: b.thesis, required: b.required, minTraits: b.minTraits, itemPool: b.itemPool })),
  summary,
  findings: branchFindings(rows),
  rows: rows.sort((a, b) => b.score - a.score),
};

fs.writeFileSync(path.join(ROOT, 'mecha_branch_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(ROOT, '可视化', 'mecha-branch-data.js'), 'window.MECHA_BRANCH=' + JSON.stringify(out) + ';');
writeReport(out);

console.log('机甲分叉实验完成:', out.version);
console.log('\n== 分支最高排名 ==');
summary.forEach((r, i) => {
  console.log(`${i + 1}. [${r.score}分] ${r.label} ${r.level}人口 ${r.carry}${r.carryStar}星 ${r.items.join('+')}`);
  console.log(`   阵容: ${r.team.map(u => u.name + '(' + u.price + ')').join(' ')}`);
  console.log(`   羁绊: ${r.traits.slice(0, 8).join(' / ')} | C:${r.carryDps} EHP:${r.frontEHP} 副:${r.subDps}`);
});
console.log('\n== 新发现 ==');
out.findings.forEach(x => console.log('- ' + x));
console.log('输出: mecha_branch_results.json, 可视化/mecha-branch-data.js, reports/机甲分叉实验.md');
