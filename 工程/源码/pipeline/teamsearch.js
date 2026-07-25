// 全阵容自由搜索：羁绊效果建模 + 束搜索自动组8人棋盘，与官方S级同口径对比
// 输出并入 model_results.json 的 teamsearch 字段
const fs = require('fs');
const { simulate, tankEHP, chess, equip, comps } = require('../core/model.js');
const { dataPath, resultPath, publicPath, ensureOutputDirs } = require('../lib/project-paths');

const race = JSON.parse(fs.readFileSync(dataPath('race.js'))).data;
const job = JSON.parse(fs.readFileSync(dataPath('job.js'))).data;
const byName = {}; Object.values(equip).forEach(e => { if (!byName[e.name]) byName[e.name] = e.id; });

// ===== 羁绊效果表（数值取自 race/job desc2 原文；util=无法量化的机制价值权重） =====
// fx: { team:{...}, member:{...} }  字段: adPct ap asPct ampPct critPct armor mr hpPct manaMult onHitMagic ehpMult
const TFX = {
  160: { tiers: [3, 5, 7], fx: t => ({ team: { adPct: [10, 35, 60][t], ap: [10, 35, 60][t] } }) },              // 幻灵战队
  161: { tiers: [1, 2, 3], fx: t => ({ team: { manaMult: [1.04, 1.08, 1.2][t] } }) },                            // 平民英雄
  162: { tiers: [3, 5], fx: t => ({ team: { ampPct: [3, 14][t], ehpMult: [1.03, 1.14][t] }, util: [1, 2][t] }) },// 小天才(制造装备另计util)
  163: { tiers: [3, 5, 7, 9], fx: t => ({ team: { manaMult: [1.35, 1.9, 2.5, 3.4][t] } }) },                     // 星之守护者
  164: { tiers: [3], fx: () => ({ team: { ampPct: 26 } }) },                                                     // 17.7超级英雄(基础20%+假设1个3星×6%)
  165: { tiers: [2, 4, 6, 8, 10], fx: t => ({ team: { armor: [10, 45, 90, 150, 500][t], mr: [10, 45, 90, 150, 500][t] } }) }, // 福牛
  166: { tiers: [3, 5, 8], fx: t => ({ member: { adPct: [60, 110, 110][t], ap: [60, 110, 110][t] }, util: [0, 1, 3][t] }) },  // 战斗机甲(至尊简化为成员)
  169: { tiers: [3, 4, 5, 6, 8], fx: t => ({ util: [2, 2.5, 3, 4, 6][t] }) },                                    // 魔盗团(纯经济)
  170: { tiers: [2, 4, 6], fx: t => ({ util: [1.5, 3, 6][t] }) },                                                // AI程序
  171: { tiers: [3, 5, 7, 10], fx: t => ({ team: { onHitMagic: [27, 35, 55, 80][t] }, util: [0, 1, 1.5, 3][t] }) }, // 源计划
  174: { tiers: [1], fx: () => ({ member: { ap: 80 }, util: 1 }) },                                              // 堕落使者(灵魂折算)
  120: { tiers: [3, 5, 7], fx: t => ({ team: { ampPct: [25, 40, 70][t] } }) },                                   // 混沌战士(取基础值)
  121: { tiers: [3, 4, 5], fx: t => ({ util: [1.5, 2.5, 4][t] }) },                                              // 黑客
  122: { tiers: [2, 3, 4], fx: t => ({ util: [1, 1.5, 2][t] }) },                                                // 淘气包
  123: { tiers: [2, 4, 6, 8], fx: t => ({ team: { ap: [30, 60, 80, 120][t] } }) },                               // 17.7灵能使
  124: { tiers: [2, 4, 6, 8], fx: t => ({ member: { asPct: [30, 54, 90, 144][t] }, util: [0, 0, 1, 2][t] }) },   // 决斗大师(按均值6层折算)
  125: { tiers: [2, 3, 4, 5], fx: t => ({ team: { adPct: [6, 12, 15, 20][t] } }) },                              // 17.7强袭枪手
  126: { tiers: [2, 4, 6], fx: t => ({ team: { armor: [25, 75, 200][t] }, member: { armor: [50, 150, 400][t] } }) }, // 护卫
  127: { tiers: [2, 4, 6], fx: t => ({ team: { ehpMult: [1.015, 1.03, 1.06][t] } }) },                           // 吉祥物
  128: { tiers: [2, 4, 6], fx: t => ({ team: { ap: [4, 7, 11][t] } }) },                                         // 爱心使者
  132: { tiers: [2, 4, 6, 8], fx: t => ({ member: { hpPct: [20, 45, 75, 110][t] } }) },                          // 斗士
  133: { tiers: [2, 3, 4], fx: t => ({ member: { critPct: [20, 75, 100][t] }, util: [0, 0, 1.5][t] }) },         // 情报特工
  134: { tiers: [2, 3, 4, 5], fx: t => ({ team: { mr: [20, 40, 60, 90][t] }, member: { mr: [40, 80, 120, 180][t] } }) }, // 秘术卫士
  135: { tiers: [1, 4], fx: t => ({ team: { ampPct: [6, 14][t] } }) },                                           // 精英战士(处决折算增伤)
  131: { tiers: [1], fx: () => ({ util: 1 }) }, 130: { tiers: [1], fx: () => ({ util: 0.5 }) },
  167: { tiers: [1], fx: () => ({ util: 0 }) },
};

// ===== 棋子池（62个，多羁绊拆分） =====
const seen = new Set();
const units = Object.values(chess)
  .filter(u => u.showHeroTag === '1' && Number(u.price) >= 1 && Number(u.price) <= 5 && !seen.has(u.name) && seen.add(u.name))
  .map(u => ({ id: u.id, name: u.name, price: Number(u.price), hp: Number(u.initHP), armor: Number(u.armor), mr: Number(u.magicResist),
    traits: [...String(u.species).split('|'), ...String(u.class).split('|')].filter(t => TFX[t]) }));
const traitName = id => (job[id] || race[id] || {}).name || id;

// ===== 羁绊聚合 =====
function activeTraits(team) {
  const cnt = {};
  team.forEach(u => u.traits.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
  const act = [];
  for (const [t, n] of Object.entries(cnt)) {
    const def = TFX[t]; if (!def) continue;
    let tier = -1; def.tiers.forEach((th, i) => { if (n >= th) tier = i; });
    if (tier >= 0) act.push({ id: t, name: traitName(t), n: cnt[t], need: def.tiers[tier], tier, fx: def.fx(tier) });
  }
  return act;
}
function bonusFor(unit, acts, kind) { // kind: 'atk' | 'def'
  const b = { adPct: 0, ap: 0, asPct: 0, ampPct: 0, critPct: 0, armor: 0, mr: 0, hpPct: 0, manaMult: 1, onHitMagic: 0, ehpMult: 1 };
  const merge = fx => { if (!fx) return;
    for (const k of ['adPct', 'ap', 'asPct', 'ampPct', 'critPct', 'armor', 'mr', 'hpPct', 'onHitMagic']) b[k] += fx[k] || 0;
    if (fx.manaMult) b.manaMult *= fx.manaMult;
    if (fx.ehpMult) b.ehpMult *= fx.ehpMult; };
  acts.forEach(a => { merge(a.fx.team); if (unit.traits.includes(a.id)) merge(a.fx.member); });
  return b;
}

// ===== 评分器（官方阵容与模型阵容同口径） =====
const DEF_BUILDS = [['狂徒铠甲', '狂徒铠甲', '圣盾使的誓约'], ['石像鬼石板甲', '日炎斗篷', '狂徒铠甲']].map(b => b.map(n => byName[n]));
function scoreTeam(carryUnit, carryItems, team) {
  const acts = activeTraits(team);
  const util = acts.reduce((s, a) => s + (a.fx.util || 0), 0);
  const cStar = carryUnit.price <= 3 ? 3 : 2;
  const cb = bonusFor(carryUnit, acts, 'atk');
  const sim = simulate(carryUnit.id, carryItems, cStar, 30, cb);
  // 前排：除主C外按(生命×抗性)选2个最坦的，配固定坦装
  const tanks = team.filter(u => u.name !== carryUnit.name)
    .sort((a, b) => b.hp * (1 + (b.armor + b.mr) / 200) - a.hp * (1 + (a.armor + a.mr) / 200)).slice(0, 2);
  let ehp = 0; const tankDetail = [];
  tanks.forEach((u, i) => {
    const db = bonusFor(u, acts, 'def');
    const r = tankEHP(u.id, DEF_BUILDS[i], u.price >= 5 ? 1 : 2, db);
    if (r) { ehp += r.ehp; tankDetail.push({ hero: u.name, ehp: Math.round(r.ehp), items: DEF_BUILDS[i].map(x => equip[x].name) }); }
  });
  // 副输出：其余棋子的普攻DPS粗算(享受团队加成)
  let sub = 0;
  team.forEach(u => { if (u === carryUnit || tanks.includes(u)) return;
    const ub = bonusFor(u, acts, 'atk');
    const star = u.price >= 5 ? 1 : 2;
    sub += Number(chess[u.id].initAttackDamage) * Math.pow(1.5, star - 1) * Number(chess[u.id].attackSpeed)
      * (1 + ub.adPct / 100) * (1 + ub.ampPct / 100) * 0.5; });
  const score = sim.dps + sub * 0.5 + ehp / 22 + util * 15;
  return { score: Math.round(score), carryDps: Math.round(sim.dps), frontEHP: Math.round(ehp), subDps: Math.round(sub), util,
    acts: acts.filter(a => a.tier >= 0).map(a => a.need + a.name), tankDetail };
}

// ===== 候选主C与其最优出装（小型逐C搜索） =====
const OFFENSE = ['无尽之刃', '海克斯科技枪刃', '朔极之矛', '汲取剑', '泰坦的坚决', '班克斯的魔法帽', '最后的轻语', '珠光护手', '水银', '锐利之刃', '疾射火炮', '鬼索的狂暴之刃', '斯塔缇克电刃', '卢安娜的飓风', '蓝霸符', '巨人捕手'].map(n => byName[n]).filter(Boolean);
function* combos3(pool) { for (let i = 0; i < pool.length; i++) for (let j = i; j < pool.length; j++) for (let k = j; k < pool.length; k++) { if (pool[i] === byName['蓝霸符'] && i === j) continue; if (pool[j] === byName['蓝霸符'] && j === k) continue; yield [pool[i], pool[j], pool[k]]; } }
const solo = units.map(u => {
  const star = u.price <= 3 ? 3 : 2; let best = null;
  for (const c of combos3(OFFENSE)) { const r = simulate(u.id, c, star); if (r && (!best || r.dps > best.dps)) best = { dps: r.dps, items: c }; }
  return { u, ...best };
}).sort((a, b) => b.dps - a.dps);
const carryCands = solo.slice(0, 12);
console.error('主C候选:', carryCands.map(c => c.u.name + Math.round(c.dps)).join(' '));

// ===== 束搜索组队 =====
function heuristic(team, cand, carryUnit) { // 廉价启发式：加入cand后的边际价值
  const t2 = [...team, cand];
  const acts = activeTraits(t2);
  const cb = bonusFor(carryUnit, acts, 'atk');
  const offense = cb.adPct + cb.ap + cb.asPct * 0.8 + cb.ampPct * 2.2 + cb.critPct * 0.5 + (cb.manaMult - 1) * 120 + cb.onHitMagic;
  const tankVal = cand.hp * (1 + (cand.armor + cand.mr) / 200) / 900;
  const util = acts.reduce((s, a) => s + (a.fx.util || 0), 0);
  return offense + tankVal + util * 6 + acts.length * 2;
}
const finals = [];
for (const cc of carryCands) {
  let beam = [[cc.u]];
  for (let slot = 1; slot < 8; slot++) {
    const next = [];
    for (const team of beam) {
      const names = new Set(team.map(u => u.name));
      const scored = units.filter(u => !names.has(u.name)).map(u => ({ u, h: heuristic(team, u, cc.u) }))
        .sort((a, b) => b.h - a.h).slice(0, 14);
      scored.forEach(s => next.push([...team, s.u]));
    }
    const seenT = new Set();
    beam = next.map(t => ({ t, h: t.reduce((s, u, i) => s + (i ? heuristic(t.slice(0, i), u, cc.u) : 0), 0) }))
      .sort((a, b) => b.h - a.h)
      .filter(x => { const k = x.t.map(u => u.name).sort().join(); return !seenT.has(k) && seenT.add(k); })
      .slice(0, 24).map(x => x.t);
  }
  beam.slice(0, 6).forEach(team => {
    const s = scoreTeam(cc.u, cc.items, team);
    finals.push({ carry: cc.u.name, carryPrice: cc.u.price, carryStar: cc.u.price <= 3 ? 3 : 2,
      carryItems: cc.items.map(i => equip[i].name), team: team.map(u => ({ name: u.name, price: u.price })), ...s });
  });
}
// 每个主C保留最优1套，取Top8
const bestByCarry = {};
finals.forEach(f => { if (!bestByCarry[f.carry] || f.score > bestByCarry[f.carry].score) bestByCarry[f.carry] = f; });
const topTeams = Object.values(bestByCarry).sort((a, b) => b.score - a.score).slice(0, 8);

// ===== 官方S级同口径重评分 =====
const officialScored = comps.filter(c => c.quality === 'S').map(c => {
  const teamUnits = (c.detail.heroes || []).map(h => units.find(u => u.name === h.name)).filter(Boolean);
  const carryU = units.find(u => u.name === (c.carry || {}).hero);
  if (!carryU || !teamUnits.length) return null;
  const ids = c.carryItemIds;
  const s = scoreTeam(carryU, ids, teamUnits);
  return { name: (c.name.match(/【(.+?)】/) || [])[1] || c.name, carry: carryU.name, ...s };
}).filter(Boolean).sort((a, b) => b.score - a.score);

const out = JSON.parse(fs.readFileSync(resultPath('model_results.json'), 'utf8'));
out.teamsearch = { topTeams, officialScored };
ensureOutputDirs();
fs.writeFileSync(resultPath('model_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(publicPath('data.js'), 'window.MODEL=' + JSON.stringify(out) + ';');

console.log('\n== 模型自建阵容 Top8（同口径总分 = 主C DPS + 副输出/2 + EHP/22 + 机制分）==');
topTeams.forEach((t, i) => {
  console.log(`\n${i + 1}. [${t.score}分] ${t.carry}${t.carryStar}星C ${t.carryItems.join('+')}`);
  console.log(`   阵容: ${t.team.map(u => u.name + '(' + u.price + ')').join(' ')}`);
  console.log(`   羁绊: ${t.acts.join(' / ')} ｜ 主C ${t.carryDps}dps · 前排EHP ${t.frontEHP} · 机制分${t.util}`);
});
console.log('\n== 官方S级同口径 ==');
officialScored.forEach((o, i) => console.log(`${i + 1}. [${o.score}分] ${o.name} (${o.carry}C ${o.carryDps}dps/EHP${o.frontEHP}) ${o.acts.join('/')}`));
