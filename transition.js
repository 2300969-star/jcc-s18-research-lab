// 前中后期过渡路线搜索：把阶段最强候选串成可落地的运营路线
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'discovery_results.json'), 'utf8'));
let POSTGAME = null;
try {
  POSTGAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'postgame_review.json'), 'utf8'));
} catch (_) {
  POSTGAME = null;
}

const STAGE = { early: '前期', mid: '中期', late: '后期' };
const STAGE_NOTE = {
  early: '2-1 到 3-2：少D牌，保血连胜，优先拿可继承装备的打工C。',
  mid: '3-2 到 4-2：根据来牌决定小D稳血或追三，尽量不把装备路线打断。',
  late: '4-5 以后：上8/9补终局核心，保留前排壳和关键羁绊。',
};

function names(row) {
  return new Set((row.team || []).map(u => u.name));
}
function traitNames(row) {
  return new Set((row.traits || []).map(t => String(t).replace(/^\d+/, '')));
}
function intersect(a, b) {
  return [...a].filter(x => b.has(x));
}
function itemOverlap(a, b) {
  const x = [...a.carryItems];
  const y = [...b.carryItems];
  let n = 0;
  for (const it of x) {
    const idx = y.indexOf(it);
    if (idx >= 0) { n++; y.splice(idx, 1); }
  }
  return n;
}
function maxScore(stage) {
  return Math.max(...D.stageComps[stage].map(r => r.score));
}
function costOf(row) {
  return (row.team || []).reduce((s, u) => s + u.price, 0);
}
function highCostCount(row) {
  return (row.team || []).filter(u => u.price >= 4).length;
}
function carryRisk(row) {
  const hit = (D.shopModel.targetHits || []).find(x => x.hero === row.carry);
  if (!hit) return row.carryPrice >= 5 ? 35 : row.carryPrice >= 4 ? 24 : row.carryStar >= 3 ? 18 : 8;
  const p = hit.pct || 0;
  if (row.carryStar >= 3) return Math.max(5, 45 - p * 1.4);
  return Math.max(4, 30 - p);
}
function routeName(e, m, l) {
  const seq = [e.carry, m.carry, l.carry].filter((x, i, arr) => i === 0 || x !== arr[i - 1]);
  const shell = dominantShell(e, m, l);
  return shell ? `${shell}：${seq.join(' -> ')}` : seq.join(' -> ');
}
function dominantShell(e, m, l) {
  const allTraits = [e, m, l].flatMap(r => [...traitNames(r)]);
  const hit = {};
  allTraits.forEach(t => hit[t] = (hit[t] || 0) + 1);
  const ordered = Object.entries(hit)
    .filter(([t, n]) => n >= 2 && !['精英战士', '平民英雄', '气象主播'].includes(t))
    .sort((a, b) => b[1] - a[1]);
  return ordered[0] ? ordered[0][0] : '';
}
function routeTags(e, m, l) {
  const tags = [];
  const shell = dominantShell(e, m, l);
  if (shell) tags.push(shell + '壳');
  if (e.carry === m.carry || m.carry === l.carry) tags.push('同C继承');
  if (itemOverlap(e, m) >= 2 || itemOverlap(m, l) >= 2) tags.push('装备平滑');
  if (l.carryPrice >= 5) tags.push('高费上限');
  if (m.carryStar >= 3) tags.push('中期追三');
  return tags.slice(0, 4);
}

function practicalAdjustment(e, m, l) {
  const out = { riskDelta: 0, strategicDelta: 0, scoreDelta: 0, tags: [], notes: [] };
  const hasJaxMid = m.carry === '贾克斯';
  const terminalJax = l.carry === '贾克斯';
  if (!hasJaxMid && !terminalJax) return out;

  const samples = POSTGAME && POSTGAME.reviews || [];
  const failed = samples.find(x => x.id === 'jax-loss-20260705-a');
  const twoStarStartup = failed && Number(failed.twoStarStartupRatioPct);

  if (terminalJax) {
    out.riskDelta += 16;
    out.strategicDelta -= 8;
    out.scoreDelta -= 6;
    out.tags.push('启动折损');
    const ref = twoStarStartup ? `实战校准：二星启动失败样本仅${twoStarStartup}%` : '实战校准：近战启动不稳定';
    out.notes.push(`${ref}，终局贾克斯只在三星/无情连打/水银/防控齐全时保留争一分`);
  } else if (hasJaxMid) {
    out.strategicDelta += 4;
    out.tags.push('贾克斯过渡');
    out.notes.push('实战校准：贾克斯更适合作为中期吃分桥，后期转蕾欧娜/五费控制补争一上限');
  }
  return out;
}
function stageLine(row, key) {
  return {
    key,
    label: STAGE[key],
    note: STAGE_NOTE[key],
    carry: row.carry,
    carryStar: row.carryStar,
    carryPrice: row.carryPrice,
    score: row.score,
    items: row.carryItems,
    team: row.team,
    traits: row.traits,
    reason: row.reason,
    flag: row.officialFlag,
  };
}

function scoreRoute(e, m, l) {
  const eMax = maxScore('early'), mMax = maxScore('mid'), lMax = maxScore('late');
  const strength = (e.score / eMax) * 18 + (m.score / mMax) * 32 + (l.score / lMax) * 50;

  const en = names(e), mn = names(m), ln = names(l);
  const et = traitNames(e), mt = traitNames(m), lt = traitNames(l);
  const emUnits = intersect(en, mn);
  const mlUnits = intersect(mn, ln);
  const emTraits = intersect(et, mt);
  const mlTraits = intersect(mt, lt);
  const emItems = itemOverlap(e, m);
  const mlItems = itemOverlap(m, l);

  let smooth = 0;
  smooth += Math.min(24, emUnits.length * 4.8);
  smooth += Math.min(24, mlUnits.length * 4.2);
  smooth += Math.min(12, emTraits.length * 3);
  smooth += Math.min(12, mlTraits.length * 3);
  smooth += (emItems + mlItems) * 5;
  if (e.carry === m.carry) smooth += 8;
  if (m.carry === l.carry) smooth += 8;
  if (e.carryPrice <= 2 && m.carryPrice <= 3 && l.carryPrice >= 3) smooth += 8;
  if (dominantShell(e, m, l)) smooth += 8;

  const pivotCost = (m.team.length - emUnits.length) * 2.2 + (l.team.length - mlUnits.length) * 1.8;
  const practical = practicalAdjustment(e, m, l);
  const risk = carryRisk(m) * 0.45 + carryRisk(l) * 0.55 + highCostCount(l) * 2.5 + Math.max(0, costOf(l) - 26) * 0.8 + practical.riskDelta;
  const shell = dominantShell(e, m, l);
  let strategic = 0;
  if (shell === '战斗机甲') strategic += 12;
  if (shell === '小天才') strategic += 6;
  if (shell === '决斗大师') strategic += 5;
  if (l.carry === '蕾欧娜' && hasAny(e, ['德莱文', '孙悟空']) && hasAny(m, ['贾克斯', '德莱文'])) strategic += 6;
  if (m.carry === '贾克斯') strategic += 4;
  if (m.score < 1450) strategic -= 4;
  strategic += practical.strategicDelta;
  const total = strength * 0.58 + smooth * 0.48 - risk * 0.32 - pivotCost + strategic + practical.scoreDelta;

  const transition = {
    earlyToMid: {
      keep: emUnits,
      add: [...mn].filter(x => !en.has(x)),
      remove: [...en].filter(x => !mn.has(x)),
      sharedTraits: emTraits,
      itemOverlap: emItems,
    },
    midToLate: {
      keep: mlUnits,
      add: [...ln].filter(x => !mn.has(x)),
      remove: [...mn].filter(x => !ln.has(x)),
      sharedTraits: mlTraits,
      itemOverlap: mlItems,
    },
  };

  return {
    name: routeName(e, m, l),
    score: Math.round(total),
    strength: Math.round(strength),
    smooth: Math.round(smooth),
    risk: Math.round(risk),
    strategic,
    pivotCost: Math.round(pivotCost),
    tags: [...new Set([...routeTags(e, m, l), ...practical.tags])].slice(0, 5),
    practical,
    stages: {
      early: stageLine(e, 'early'),
      mid: stageLine(m, 'mid'),
      late: stageLine(l, 'late'),
    },
    transition,
    verdict: verdictText(e, m, l, transition, practical),
  };
}

function hasAny(row, wanted) {
  return (row.team || []).some(u => wanted.includes(u.name)) || wanted.includes(row.carry);
}

function verdictText(e, m, l, t, practical) {
  const bits = [];
  if (t.earlyToMid.keep.length >= 3) bits.push(`前中期可保留 ${t.earlyToMid.keep.join('、')}`);
  if (t.midToLate.keep.length >= 3) bits.push(`中后期可保留 ${t.midToLate.keep.join('、')}`);
  if (t.earlyToMid.itemOverlap + t.midToLate.itemOverlap >= 3) bits.push('主C装备继承较顺');
  if (l.carryPrice >= 5) bits.push('终局上限高但依赖上9/五费二星');
  if (m.carryStar >= 3) bits.push(`中期需要围绕${m.carry}追三稳血`);
  if (practical && practical.notes) bits.push(...practical.notes);
  return bits.join('；') || '强度可观，但中途换壳较多，适合作为备选转线。';
}

function dedupe(routes) {
  const seen = new Set();
  const out = [];
  for (const r of routes) {
    const k = [r.stages.early.carry, r.stages.mid.carry, r.stages.late.carry, dominantShell(r.stages.early, r.stages.mid, r.stages.late)].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

const routes = [];
for (const e of D.stageComps.early) {
  for (const m of D.stageComps.mid) {
    for (const l of D.stageComps.late) {
      routes.push(scoreRoute(e, m, l));
    }
  }
}
routes.sort((a, b) => b.score - a.score);

const out = {
  version: D.version,
  generated: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  routes: dedupe(routes).slice(0, 12),
  assumptions: [
    '路线分 = 阶段强度 + 棋子/羁绊/装备继承 - 搜卡风险 - 换壳成本。',
    '搜卡风险沿用 discovery 的独立抽卡近似模型，未扣同行和公共牌库。',
    '贾克斯路线已接入两局实战校准：终局贾克斯扣启动风险，中期贾克斯转五费上限加稳定性。',
    '路线只给运营骨架，不替代实战站位、海克斯选择和装备掉落判断。',
  ],
};

function writeReport(data) {
  const lines = ['# 平滑过渡阵容路线', '', `生成时间：${data.generated}`, ''];
  data.routes.slice(0, 8).forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.name}（${r.score}分）`);
    lines.push('');
    lines.push(`标签：${r.tags.join('、') || '-'}`);
    lines.push(`判断：${r.verdict}`);
    lines.push('');
    for (const key of ['early', 'mid', 'late']) {
      const s = r.stages[key];
      lines.push(`- ${s.label}：${s.carry}${s.carryStar}星，${s.items.join('+')}；${s.team.map(u => u.name).join('、')}；${s.traits.slice(0, 5).join(' / ')}`);
    }
    lines.push(`- 前->中：保留 ${r.transition.earlyToMid.keep.join('、') || '-'}；补 ${r.transition.earlyToMid.add.join('、') || '-'}`);
    lines.push(`- 中->后：保留 ${r.transition.midToLate.keep.join('、') || '-'}；补 ${r.transition.midToLate.add.join('、') || '-'}`);
    lines.push('');
  });
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', '平滑过渡阵容路线.md'), lines.join('\n'));
}

fs.writeFileSync(path.join(ROOT, 'transition_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(ROOT, '可视化', 'transition-data.js'), 'window.TRANSITIONS=' + JSON.stringify(out) + ';');
writeReport(out);

console.log('平滑过渡路线生成完成');
out.routes.slice(0, 8).forEach((r, i) => console.log(`${i + 1}. [${r.score}] ${r.name} | ${r.verdict}`));
console.log('输出: transition_results.json, 可视化/transition-data.js, reports/平滑过渡阵容路线.md');
