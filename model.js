// 怪兽入侵 S18 数值模型：主C 30秒战斗模拟 + 前排EHP + 经济符文价值 + 官方梯队验证
// 输出 model_results.json 供可视化前端使用
const fs = require('fs');
const path = require('path');
const { currentVersion, currentLineups } = require('./version-context.js');
const D = p => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', p), 'utf8'));

const version = currentVersion(__dirname);
const chess = D('chess.js').data;
const equip = D('equip.js').data;
const race = D('race.js').data;
const job = D('job.js').data;
const monsterD = D('monster.js').data;
const { lineup_list } = D('lineup_detail_total.json');

// ---------- 装备基础属性解析（直接从官方 basicDesc 文本取数） ----------
const STAT_MAP = { 生命上限: 'hp', 护甲: 'armor', 魔法抗性: 'mr', 物理加成: 'adPct', 法术加成: 'ap', 攻击速度: 'asPct', 暴击率: 'critPct', 伤害增幅: 'ampPct', 法力值: 'startMana' };
function itemStats(id) {
  const e = equip[id];
  const s = { hp: 0, armor: 0, mr: 0, adPct: 0, ap: 0, asPct: 0, critPct: 0, ampPct: 0, startMana: 0, name: e ? e.name : id };
  if (!e) return s;
  for (const m of (e.basicDesc || '').matchAll(/\+(\d+)%?(生命上限|护甲|魔法抗性|物理加成|法术加成|攻击速度|暴击率|伤害增幅|法力值)/g)) s[STAT_MAP[m[2]]] += Number(m[1]);
  return s;
}
// 特效装备（数值取自官方 desc 原文）
const SPECIAL = {
  2810: { ragebladeAS: 5 },              // 鬼索：每次攻击+5%攻速可叠加
  2012: { titan: { adPct: 2, ap: 2, max: 25, ampFull: 10 } }, // 泰坦：叠25层满层+10%增幅
  2813: { boltADPct: 50 },               // 飓风：副目标弹体50%AD物理
  2811: { statikk: { every: 3, dmg: 30, mrShred: 0.3 } },     // 电刃：每3次攻击30魔法+30%魔抗击碎
  2822: { manaCostReduce: 10 },          // 蓝霸符
  2004: { manaPerAtk: 5 },               // 朔极之矛
  2037: { armorShred: 0.3 },             // 最后的轻语：30%护甲击碎
  2846: { giantAmp: 20 },                // 巨人捕手：对>1600HP目标+20%（假设目标满足）
  2038: { spellCrit: true }, 2001: { spellCrit: true },       // 珠光/无尽：技能可暴击
  2041: { rampASPerSec: 3 },             // 水银：每秒+3%攻速可叠加
};
// ---------- 技能伤害口径（从 skillValueDesc 分组自动识别 + 少数英雄修正） ----------
// hits 修正：多段单体技能（官方描述：厄运小姐8波弹幕=首波+7波、乐芙兰6魔印、德莱文2斧）
const HIT_OVERRIDE = { 厄运小姐: { 1: 7 }, 乐芙兰: { 0: 6 }, 德莱文: { 1: 2 } };
function parseSpell(h, star) {
  const groups = (h.skillBriefValue || '').split('|').map(g => g.split('/'));
  const descs = (h.skillValueDesc || '').split('|');
  let ad = 0, ap = 0; // 每次施放的AD倍率伤害 / AP倍率伤害
  groups.forEach((g, i) => {
    const label = descs[i] || '';
    if (!/伤害/.test(label) || /时长|几率|次数|抗性|双抗|减少|衰减/.test(label)) return;
    const v = parseFloat(g[Math.min(star, g.length) - 1]);
    if (isNaN(v) || /%/.test(g[0])) return;
    const hits = (HIT_OVERRIDE[h.name] || {})[i] || 1;
    if (/物理加成/.test(label)) ad += v * hits; else ap += v * hits;
  });
  return { ad, ap };
}

// ---------- 主C 30秒战斗模拟 ----------
// 假设：单目标木桩 护甲100/魔抗100；暴击伤害140%；攻速上限5.0；星级倍率 HP×1.8/星 AD×1.5/星
const DUMMY = { armor: 100, mr: 100 };
function simulate(heroId, itemIds, star, seconds = 30, bonus = {}) {
  const h = chess[heroId];
  if (!h) return null;
  const items = itemIds.map(itemStats);
  const sp = itemIds.reduce((a, id) => Object.assign(a, SPECIAL[id] || {}), {});
  const baseAD = Number(h.initAttackDamage) * Math.pow(1.5, star - 1);
  const baseAS = Number(h.attackSpeed);
  const adPct = items.reduce((s, i) => s + i.adPct, 0) + (bonus.adPct || 0);
  const apSum = items.reduce((s, i) => s + i.ap, 0) + (bonus.ap || 0);
  const asPct = items.reduce((s, i) => s + i.asPct, 0) + (bonus.asPct || 0);
  const crit = Math.min(100, 25 + items.reduce((s, i) => s + i.critPct, 0)) / 100;
  const amp = 1 + (items.reduce((s, i) => s + i.ampPct, 0) + (sp.giantAmp || 0) + (bonus.ampPct || 0)) / 100;
  const maxMP = Math.max(0, Number(h.maxMP) - (sp.manaCostReduce || 0));
  const spell = parseSpell(h, star);
  const spellIsTrue = /真实伤害/.test(h.skillDesc || '');

  let t = 0, atk = 0, rage = 0, titan = 0, mana = Number(h.initMP) + items.reduce((s, i) => s + i.startMana, 0);
  let dAuto = 0, dSpell = 0, dProc = 0, casts = 0;
  let armorEff = DUMMY.armor * (sp.armorShred ? 1 - sp.armorShred : 1), mrEff = DUMMY.mr;
  let jaxStack = 0, kaisaAS = 0, kayleHits = 0;
  const mitP = () => 100 / (100 + armorEff), mitM = () => 100 / (100 + mrEff);
  const critF = 1 + crit * 0.4;

  while (t < seconds) {
    const asNow = Math.min(5, baseAS * (1 + (asPct + rage + titan * 0 + kaisaAS + (sp.rampASPerSec ? sp.rampASPerSec * t : 0)) / 100));
    t += 1 / asNow;
    if (t >= seconds) break;
    atk++;
    const adMult = 1 + (adPct + (sp.titan ? Math.min(atk, sp.titan.max) * sp.titan.adPct : 0)) / 100;
    const apMult = 1 + (apSum + (sp.titan ? Math.min(atk, sp.titan.max) * sp.titan.ap : 0)) / 100;
    const ampNow = amp * (sp.titan && atk >= sp.titan.max ? 1 + sp.titan.ampFull / 100 : 1);
    // 普攻
    let hit = baseAD * adMult * critF;
    if (h.name === '凯尔' && kayleHits > 0) { dSpell += (spell.ad * adMult * critF * mitP() + spell.ap * apMult * mitM()) * ampNow; kayleHits--; }
    if (h.name === '厄加特') hit = 5 / asNow * (baseAD * 26 / 65 * adMult + 20 * asNow) * critF; // 被动:每秒5次爪击
    dAuto += hit * mitP() * ampNow;
    if (sp.boltADPct) dProc += baseAD * adMult * (sp.boltADPct / 100) * critF * mitP() * ampNow;
    if (sp.ragebladeAS) rage += sp.ragebladeAS;
    if (sp.statikk && atk % sp.statikk.every === 0) { dProc += sp.statikk.dmg * mitM() * ampNow; mrEff = DUMMY.mr * (1 - sp.statikk.mrShred); }
    // 贾克斯/卡莎 被动第3击
    if (h.name === '贾克斯' && atk % 3 === 0) {
      const g = (h.skillBriefValue || '').split('|').map(x => x.split('/'));
      const base = parseFloat(g[0][star - 1]), inc = parseFloat(g[1][star - 1]);
      dSpell += (base + Math.min(jaxStack, 7) * inc) * apMult * mitM() * ampNow; jaxStack++;
    }
    if (h.name === '卡莎' && atk % 3 === 0) dSpell += spell.ap * apMult * mitM() * ampNow;
    if (bonus.onHitMagic) dProc += bonus.onHitMagic * mitM() * ampNow; // 羁绊攻击附魔(源计划等)
    // 法力与施放
    mana += (10 + (sp.manaPerAtk || 0)) * (bonus.manaMult || 1);
    if (maxMP > 0 && mana >= maxMP && h.name !== '卡莎') {
      casts++; mana = 0;
      const sc = sp.spellCrit ? critF : 1;
      let dmg = spell.ad * adMult * sc * (spellIsTrue ? 1 : mitP()) + spell.ap * apMult * sc * (spellIsTrue ? 1 : mitM());
      if (h.name === '凯尔') { kayleHits = 3; dmg = 0; }
      dSpell += dmg * ampNow;
    }
    if (h.name === '卡莎' && maxMP > 0 && mana >= maxMP) { casts++; mana = 0; kaisaAS += 100; } // 主动:+100%攻速可叠加
  }
  const total = dAuto + dSpell + dProc;
  return { hero: h.name, price: Number(h.price), star, dps: total / seconds, auto: dAuto / seconds, spell: dSpell / seconds, proc: dProc / seconds, casts, attacks: atk };
}

// ---------- 前排 EHP 模型 ----------
const TANK_ITEMS = new Set(['2834', '2029', '2028', '2025', '2027', '2031', '2023', '2818', '2019']);
function tankEHP(heroId, itemIds, star, bonusDef = {}) {
  const h = chess[heroId];
  if (!h) return null;
  const items = itemIds.map(itemStats);
  let hp = (Number(h.initHP) * Math.pow(1.8, star - 1)) * (1 + (bonusDef.hpPct || 0) / 100) + items.reduce((s, i) => s + i.hp, 0);
  let armor = Number(h.armor) + (bonusDef.armor || 0) + items.reduce((s, i) => s + i.armor, 0);
  let mr = Number(h.magicResist) + (bonusDef.mr || 0) + items.reduce((s, i) => s + i.mr, 0);
  let hpPct = 0, regenPctPerSec = 0, shieldPct = 0, shieldFlat = 0, dr = 0;
  for (const id of itemIds) {
    if (id === '2029') hpPct += 8;                       // 日炎
    if (id === '2027') hpPct += 6;                       // 棘刺
    if (id === '2031') { hpPct += 6; regenPctPerSec += 1.25; } // 龙爪
    if (id === '2834') regenPctPerSec += 2;              // 狂徒
    if (id === '2025') { regenPctPerSec += 1; dr += 8; } // 振奋(已损失生命近似1%/s)
    if (id === '2028') { armor += 30; mr += 30; }        // 石像鬼(假设3个攻击者)
    if (id === '2023') shieldPct += 20;                  // 圣盾使
    if (id === '2818') shieldFlat += [300, 350, 400][star - 1]; // 钢铁烈阳之匣
  }
  hp *= 1 + hpPct / 100;
  const hpTotal = hp * (1 + regenPctPerSec / 100 * 15) * (1 + shieldPct / 100) + shieldFlat; // 15秒站场回复折算
  const mit = 2 / (100 / (100 + armor) + 100 / (100 + mr)); // 物魔各半调和
  return { hero: h.name, star, ehp: hpTotal * mit / (1 - dr / 100) * (bonusDef.ehpMult || 1) };
}

// ---------- 逐阵容计算 ----------
const Q = { S: 0, A: 1, B: 2 };
const currentOfficialLineups = currentLineups(lineup_list, __dirname);
const comps = currentOfficialLineups.map(l => {
  const d = JSON.parse(l.detail);
  const hl = d.hero_location || [];
  let carry = hl.find(x => x.is_carry_hero) || hl.slice().sort((a, b) => (b.equipment_id || '').length - (a.equipment_id || '').length)[0];
  const cItems = (carry.equipment_id || '').split(',').filter(Boolean);
  const cHero = chess[carry.hero_id];
  const cStar = cHero && Number(cHero.price) <= 3 ? 3 : 2; // 3费以下主C按追三计
  const sim = simulate(carry.hero_id, cItems, cStar);
  const simBare = simulate(carry.hero_id, [], cStar);
  let ehp = 0; const tanks = [];
  for (const u of hl) {
    const ids = (u.equipment_id || '').split(',').filter(Boolean);
    if (!ids.some(i => TANK_ITEMS.has(i))) continue;
    const uh = chess[u.hero_id]; if (!uh) continue;
    const st = Number(uh.price) >= 5 ? 1 : 2;
    const r = tankEHP(u.hero_id, ids, st);
    if (r) { ehp += r.ehp; tanks.push(r); }
  }
  // 完整详情（供前端弹窗展示）
  const hexD = D('hex.js').data;
  const star3 = new Set(String(d.level_3_heros || '').split(',').filter(Boolean));
  const augOf = ids => (ids || '').split(',').filter(Boolean).map(id => hexD[id] ? { name: hexD[id].name, level: Number(hexD[id].level), desc: (hexD[id].desc || '').replace(/\s+/g, ' ') } : null).filter(Boolean);
  const monOf = ids => (ids || '').split(',').filter(Boolean).map(id => (monsterD[id] || {}).name).filter(Boolean);
  const detail = {
    author: (l.lineupauthor_data || {}).name || '',
    heroes: hl.map(u => {
      const uh = chess[u.hero_id] || {};
      const [row, col] = (u.location || '0,0').split(',').map(Number);
      return { name: uh.name || '?', price: Number(uh.price || 0), row, col, carry: !!u.is_carry_hero,
        star3: star3.has(u.hero_id), items: (u.equipment_id || '').split(',').filter(Boolean).map(i => itemStats(i).name) };
    }),
    traits: (d.contact || []).map(c => {
      const t = job[c.id] || race[c.id]; if (!t) return null;
      const min = Number(String(t.numList || '').split('|')[0]) || 1;
      return { label: c.num + t.name, active: c.num >= min, need: min };
    }).filter(Boolean),
    augRec: augOf(d.hexbuff && d.hexbuff.recomm),
    augRep: augOf(d.hexbuff && d.hexbuff.replace),
    monsters: monOf(d.monster && d.monster.recomm),
    monsterRep: monOf(d.monster && d.monster.replace),
    order: (d.equipment_order || '').split(',').filter(Boolean).map(i => itemStats(i).name),
    notes: { hex: d.hex_info || '', equip: d.equipment_info || '', early: d.early_info || '', enemy: d.enemy_info || '', monster: d.monster_info || '' },
  };
  return { name: d.line_name, quality: l.quality, sortID: Number(l.sortID), carry: sim, carryBare: simBare, carryItems: cItems.map(i => itemStats(i).name), carryItemIds: cItems, carryHeroId: carry.hero_id, carryStar: cStar, frontEHP: Math.round(ehp), tanks, detail };
}).sort((a, b) => Q[a.quality] - Q[b.quality] || b.sortID - a.sortID);

// ---------- 验证：模型分 vs 官方 S/A/B ----------
const z = arr => { const m = arr.reduce((s, x) => s + x, 0) / arr.length, sd = Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length) || 1; return arr.map(x => (x - m) / sd); };
const zD = z(comps.map(c => c.carry ? c.carry.dps : 0)), zE = z(comps.map(c => c.frontEHP));
comps.forEach((c, i) => c.score = Math.round((0.55 * zD[i] + 0.45 * zE[i]) * 100) / 100);
const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = []; let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
const tierVal = comps.map(c => ({ S: 3, A: 2, B: 1 })[c.quality]);
const r1 = rank(comps.map(c => c.score)), r2 = rank(tierVal);
const mr1 = r1.reduce((s, x) => s + x, 0) / r1.length, mr2 = r2.reduce((s, x) => s + x, 0) / r2.length;
const spearman = r1.reduce((s, x, i) => s + (x - mr1) * (r2[i] - mr2), 0) /
  Math.sqrt(r1.reduce((s, x) => s + (x - mr1) ** 2, 0) * r2.reduce((s, x) => s + (x - mr2) ** 2, 0));
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const tierStats = ['S', 'A', 'B'].map(q => ({ tier: q, n: comps.filter(c => c.quality === q).length, median: Math.round(med(comps.filter(c => c.quality === q).map(c => c.score)) * 100) / 100 }));

// ---------- 全棋子数值总览（2星） ----------
const seenU = new Set();
const units = Object.values(chess).filter(u => Number(u.price) >= 1 && Number(u.price) <= 5 && u.showHeroTag === '1' && !seenU.has(u.name) && seenU.add(u.name)).map(u => ({
  name: u.name, price: Number(u.price),
  dps: Math.round(Number(u.initAttackDamage) * 1.5 * Number(u.attackSpeed) * (1 + 0.25 * 0.4)),
  ehp: Math.round(Number(u.initHP) * 1.8 * (2 / (100 / (100 + Number(u.armor)) + 100 / (100 + Number(u.magicResist))))),
}));

// ---------- 经济符文价值曲线（假设模型，回合1-20 ≈ 2-1至5-1） ----------
// 假设：每回合刷新3次的场景给明智消费计经验价值(1金/点)；对冲基金按第6回合起存满100金
const rounds = Array.from({ length: 20 }, (_, i) => i + 1);
const econ = [
  { name: 'DD街区', curve: rounds.map(r => 2 + 2 * r) },
  { name: '明智消费', curve: rounds.map(r => 1 + Math.max(0, r - 2) * 6) },
  { name: '对冲基金', curve: rounds.map(r => 22 + Math.max(0, Math.min(r, 20) - 5) * 5) },
  { name: '前瞻思维', curve: rounds.map(r => r < 5 ? -2 * r : 62 - 10) },
  { name: '开摆', curve: rounds.map(r => r < 3 ? -3 * r : 17 - 9) },
  { name: '后期专家', curve: rounds.map(r => r >= 15 ? 27 : 0) },
];

// ---------- 结论层：最强英雄 / 组合 / 符文 / 装备 ----------
const hexData = D('hex.js').data;
const Slist = currentOfficialLineups.filter(l => l.quality === 'S');

// 最强英雄：主C榜（被当主C的次数+模拟DPS）、前排榜（坦装出场+EHP）、万金油榜（S级出场率）
const carryAgg = {}, tankAgg = {}, useAgg = {};
comps.filter(c => c.quality === 'S').forEach(c => {
  if (c.carry) {
    const k = c.carry.hero;
    carryAgg[k] = carryAgg[k] || { hero: k, star: c.carry.star, price: c.carry.price, n: 0, dps: 0, items: c.carryItems };
    carryAgg[k].n++; carryAgg[k].dps = Math.max(carryAgg[k].dps, Math.round(c.carry.dps));
  }
  c.tanks.forEach(t => { tankAgg[t.hero] = tankAgg[t.hero] || { hero: t.hero, n: 0, ehp: 0 }; tankAgg[t.hero].n++; tankAgg[t.hero].ehp = Math.max(tankAgg[t.hero].ehp, Math.round(t.ehp)); });
});
Slist.forEach(l => {
  const d = JSON.parse(l.detail);
  new Set((d.hero_location || []).map(h => (chess[h.hero_id] || {}).name).filter(Boolean)).forEach(n => useAgg[n] = (useAgg[n] || 0) + 1);
});
const heroRank = {
  carry: Object.values(carryAgg).sort((a, b) => b.n - a.n || b.dps - a.dps).slice(0, 6),
  tank: Object.values(tankAgg).sort((a, b) => b.n - a.n || b.ehp - a.ehp).slice(0, 6),
  glue: Object.entries(useAgg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([hero, n]) => ({ hero, n, price: Number((Object.values(chess).find(c => c.name === hero) || {}).price || 0) })),
};

// 最强符文：S级推荐位(recomm权重1)+替补位(0.5)，带分类
const ECON = new Set(['DD街区', '明智消费', '高端购物', '对冲基金', '开摆', '升级咯！', '后期专家', '前瞻思维', '大买特买', '利滚利', '黄金门票', '棱彩门票', '金色追求', '珍藏财宝', '炼狱合约']);
const UNITRES = new Set(['团队建设', '英勇福袋', '升星之运', '三费小组', '双排', '生日礼物', '大百宝袋']);
const EQUIPAUG = new Set(['便携锻炉', '便携锻炉+', '便携锻炉++', '光明圣物', '光明重构器', '活体锻炉', '休眠锻炉']);
const augAgg = {};
Slist.forEach(l => {
  const d = JSON.parse(l.detail);
  const add = (ids, w) => (ids || '').split(',').filter(Boolean).forEach(id => {
    const h = hexData[id]; if (!h) return;
    const a = augAgg[h.name] = augAgg[h.name] || { name: h.name, level: Number(h.level), rec: 0, rep: 0, score: 0, desc: (h.desc || '').replace(/\s+/g, ' ').slice(0, 46) };
    if (w === 1) a.rec++; else a.rep++; a.score += w;
  });
  add(d.hexbuff && d.hexbuff.recomm, 1); add(d.hexbuff && d.hexbuff.replace, 0.5);
});
const augCat = a => a.level === 4 ? '专属强化' : ECON.has(a.name) ? '经济' : UNITRES.has(a.name) ? '棋子资源' : EQUIPAUG.has(a.name) ? '装备' : '战力';
const augRank = Object.values(augAgg).map(a => ({ ...a, cat: augCat(a) })).sort((x, y) => y.score - x.score || y.rec - x.rec);

// 最强装备：S级成装出场，按用途分类；散件首选
const ITEMCAT = { 鬼索的狂暴之刃: '攻击', 疾射火炮: '攻击', 卢安娜的飓风: '攻击', 锐利之刃: '攻击', 最后的轻语: '攻击', 泰坦的坚决: '攻击', 斯塔缇克电刃: '攻击', 无尽之刃: '攻击', 朔极之矛: '攻击', 夜之锋刃: '攻击', 汲取剑: '攻击', 巨人捕手: '攻击', 海克斯科技枪刃: '攻击', 基克的先驱: '攻击', 强袭者的链枷: '攻击', 珠光护手: '法系', 蓝霸符: '法系', 班克斯的魔法帽: '法系', 莫雷洛秘典: '法系', 大天使之杖: '法系', 正义之手: '法系', 狂徒铠甲: '防御', 日炎斗篷: '防御', 圣盾使的誓约: '防御', 石像鬼石板甲: '防御', 振奋盔甲: '防御', 棘刺背心: '防御', 巨龙之爪: '防御', 钢铁烈阳之匣: '防御', 离子火花: '防御', 水银: '防御', 灵风: '功能', 秘法手套: '功能' };
const itemAgg = {}, carryItemAgg = {}, compFirst = {};
Slist.forEach(l => {
  const d = JSON.parse(l.detail);
  (d.hero_location || []).forEach(h => (h.equipment_id || '').split(',').filter(Boolean).forEach(id => {
    const n = (equip[id] || {}).name; if (!n) return;
    itemAgg[n] = (itemAgg[n] || 0) + 1;
    if (h.is_carry_hero) carryItemAgg[n] = (carryItemAgg[n] || 0) + 1;
  }));
  const first = (d.equipment_order || '').split(',')[0];
  if (first && equip[first]) compFirst[equip[first].name] = (compFirst[equip[first].name] || 0) + 1;
});
const itemRank = Object.entries(itemAgg).map(([name, n]) => ({ name, n, carry: carryItemAgg[name] || 0, cat: ITEMCAT[name] || '其他' })).sort((a, b) => b.n - a.n);
const componentFirst = Object.entries(compFirst).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);

// 版本梯队由 meta-solver.js 在全英雄组队和英雄强化反事实模拟后写入。
const verdicts = [];

// ---------- 城市怪兽（守护者）：全量数据 + 阵容推荐关联 + 模型实测 ----------
// 推荐关联：每个怪兽被哪些S级阵容首推/替补
const gRec = {};
comps.filter(c => c.quality === 'S').forEach(c => {
  const short = (c.name.match(/【(.+?)】/) || [])[1] || c.name;
  (c.detail.monsters || []).forEach(n => { (gRec[n] = gRec[n] || { rec: [], rep: [] }).rec.push(short); });
  (c.detail.monsterRep || []).forEach(n => { (gRec[n] = gRec[n] || { rec: [], rep: [] }).rep.push(short); });
});
const seenG = new Set();
const guardians = Object.values(monsterD)
  .filter(g => !seenG.has(g.name) && seenG.add(g.name))
  .map(g => ({ name: g.name, kind: g.type === '2' ? '经济' : '战力', skill: g.skillName || '',
    desc: (g.skillDesc || '').replace(/\s+/g, ' '), hp: Number(g.initHP), ad: Number(g.initAttackDamage),
    as: Number(g.attackSpeed), armor: Number(g.armor), mr: Number(g.magicResist),
    recBy: (gRec[g.name] || {}).rec || [], repBy: (gRec[g.name] || {}).rep || [] }))
  .sort((a, b) => b.recBy.length - a.recBy.length || b.repBy.length - a.repBy.length);

// 模型实测①：增益型战力怪兽对主C DPS 的提升（同一模拟引擎，加 buff 重跑）
const carryOf = short => comps.find(c => c.name.includes(short));
const buffTests = [];
const percentValues = text => [...String(text || '').matchAll(/(\d+)%/g)].map(m => Number(m[1]));
const fatDragon = Object.values(monsterD).find(g => g.name === '胖胖龙（战力）');
const [fatDragonPower = 0, fatDragonOmnivamp = 0] = percentValues(fatDragon && fatDragon.skillDesc);
[['贾克斯', carryOf('黑客贾克斯')], ['佐伊', carryOf('小天才九五')]].forEach(([nm, c]) => {
  if (!c) return;
  const base = c.carry.dps;
  const run = bonus => simulate(c.carryHeroId, c.carryItemIds, c.carryStar, 30, bonus).dps;
  buffTests.push(
    { carry: nm + c.carryStar + '星', guardian: '胖胖龙（战力）', effect: `全队+${fatDragonPower}%双强、${fatDragonOmnivamp}%全能汲取(触发后)`, base: Math.round(base), buffed: Math.round(run({ adPct: fatDragonPower, ap: fatDragonPower })), },
    { carry: nm + c.carryStar + '星', guardian: '魄罗粉丝（战力）', effect: '聚光灯格+20%增幅', base: Math.round(base), buffed: Math.round(run({ ampPct: 20 })) },
  );
});
buffTests.forEach(t => t.gain = Math.round((t.buffed / t.base - 1) * 1000) / 10);

// 模型实测②：站场型怪兽面板折算（同口径：物魔各半调和、木桩魔抗100）
const amumu = Object.values(monsterD).find(g => g.name === '阿木木（战力）');
const tower = Object.values(monsterD).find(g => g.name === '防御塔（战力）');
const amumuDamage = Number((String(amumu && amumu.skillDesc).match(/每秒(\d+)/) || [])[1]) || 0;
const mit2 = (a, m) => 2 / (100 / (100 + a) + 100 / (100 + m));
const fieldTests = [
  { name: '阿木木（战力）', ehp: Math.round(Number(amumu.initHP) * mit2(66, 66)), dps: Math.round(amumuDamage * 100 / 200), note: `光环每秒${amumuDamage}魔法伤害(可用情书叠法强，未计叠层)；EHP≈${Math.round(Number(amumu.initHP) * mit2(66, 66))}，约等于白嫖0.7个带肉装的二星四费前排` },
  { name: '防御塔（战力）', ehp: Math.round(1000 * mit2(50, 50)), dps: Math.round(50 * 0.5 * 100 / 200), note: '射程无限免控；前排摆法被摧毁回血、后排摆法击杀叠永久攻击——面板DPS低，价值在挡刀与斩杀成长' },
  { name: '卡牌大师（战力）', ehp: 0, dps: 0, note: '红牌使敌方最强弈子6秒内伤害-30%：折算全队等效EHP约+6%（30秒战斗口径），另有蓝牌残局翻盘' },
  { name: '胖胖龙（经济）', ehp: 0, dps: 0, note: '血量降至30时+25金币+1金铲铲：约等于白嫖半件成装+2.5轮利息，S级阵容里作为经济替补出现5次' },
];

// ---------- 成型悬崖：以官方最优主C为例的星级/装备阶梯（解释"模型分=满成型上限"） ----------
const bestC = comps.filter(c => c.quality === 'S' && c.carry).sort((a, b) => b.carry.dps - a.carry.dps)[0];
const oneBest = bestC.carryItemIds.map(i => ({ i, d: simulate(bestC.carryHeroId, [i], 2).dps })).sort((a, b) => b.d - a.d)[0];
const canStar3 = Number(chess[bestC.carryHeroId].price) <= 3;
const formLadder = {
  hero: bestC.carry.hero, items: bestC.carryItems, avgS: Math.round(comps.filter(c => c.quality === 'S' && c.carry).reduce((s, c) => s + c.carry.dps, 0) / comps.filter(c => c.quality === 'S' && c.carry).length),
  steps: [
    { label: '2星裸装（刚拿到C）', dps: Math.round(simulate(bestC.carryHeroId, [], 2).dps) },
    { label: '2星+首件（' + equip[oneBest.i].name + '）', dps: Math.round(oneBest.d) },
    { label: '2星三件套', dps: Math.round(simulate(bestC.carryHeroId, bestC.carryItemIds, 2).dps) },
    ...(canStar3 ? [{ label: '3星三件套（=榜单口径）', dps: Math.round(simulate(bestC.carryHeroId, bestC.carryItemIds, 3).dps) }] : []),
  ],
};

const out = { version: version.label, generated: new Date().toISOString().slice(0, 10), comps, spearman: Math.round(spearman * 1000) / 1000, tierStats, units, econ, rounds, heroRank, augRank, itemRank, componentFirst, verdicts, guardians, buffTests, fieldTests, formLadder };

// 供 search.js / teamsearch.js 复用引擎；仅直接运行时写文件（否则会抹掉它们补写的 combosearch/teamsearch 字段）
module.exports = { simulate, tankEHP, itemStats, chess, equip, comps, monsterD };
if (require.main !== module) return;

const prevPath = path.join(__dirname, 'model_results.json');
if (fs.existsSync(prevPath)) {
  const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
  if (prev.combosearch) out.combosearch = prev.combosearch;
  if (prev.teamsearch) out.teamsearch = prev.teamsearch;
}
fs.writeFileSync(prevPath, JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, '可视化', 'data.js'), 'window.MODEL=' + JSON.stringify(out) + ';');

// 控制台摘要
console.log('Spearman ρ(模型分, 官方梯队) =', out.spearman);
console.table(tierStats);
console.log('\nS级主C DPS（30秒模拟，木桩双抗100）:');
comps.filter(c => c.quality === 'S').forEach(c => c.carry && console.log(
  ` ${c.carry.hero}${c.carry.star}星 ${String(Math.round(c.carry.dps)).padStart(5)} dps (平A${Math.round(c.carry.auto)}/技能${Math.round(c.carry.spell)}/特效${Math.round(c.carry.proc)}) 裸装${Math.round(c.carryBare.dps)} ×${(c.carry.dps / c.carryBare.dps).toFixed(2)} | ${c.name.slice(0, 18)}`));
console.log('\n前排EHP Top5:', comps.slice().sort((a, b) => b.frontEHP - a.frontEHP).slice(0, 5).map(c => `${c.name.slice(0, 12)}:${c.frontEHP}`).join('  '));
