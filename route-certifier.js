// 路线认证器：用同一批确定性蒙特卡洛扰动检验路线稳健性。
// 这些是模型样本，不是真实对局；真实战绩留出集接入前，最高只授予 L2.5。
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SAMPLE_SIZE = 5000;
const SAMPLE_SEED = 20260712;
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const stage2 = read('stage2_matcher_results.json');
const discovery = read('discovery_results.json');
const model = read('model_results.json');
const meta = read('meta_discovery_results.json');
const templates = stage2.templates || [];
const shopOdds = (discovery.shopModel || {}).odds || {};
const unitCounts = (discovery.shopModel || {}).unitCounts || {};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round(n, digits = 1) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function normal(next) {
  const u = Math.max(1e-9, next());
  const v = Math.max(1e-9, next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function uniq(rows) {
  return [...new Set((rows || []).filter(Boolean))];
}

function jaccard(a, b) {
  const aa = new Set(a || []), bb = new Set(b || []);
  const union = new Set([...aa, ...bb]);
  if (!union.size) return 0;
  return [...aa].filter(x => bb.has(x)).length / union.size;
}

function profile(t) {
  return t.routeProfile || {};
}

function mainCarry(t) {
  return profile(t).mainCarry || { name: (t.carryUnits || [])[0] || '', starTarget: 2, items: (t.completedPrefs || []).slice(0, 3) };
}

function itemComponents(t) {
  const carry = mainCarry(t);
  const profileItems = (profile(t).items || []).filter(x => x.role === 'mainCarry' && (carry.items || []).includes(x.name));
  const rows = profileItems.length ? profileItems : (profile(t).items || []).filter(x => (carry.items || []).includes(x.name));
  return rows.flatMap(x => x.components || []);
}

function itemDirection(t) {
  if (t.role === '普攻') return 'physical';
  if (t.role === '法系') return 'magic';
  const names = (mainCarry(t).items || []).join('');
  const physical = (names.match(/鬼索|火炮|轻语|无尽|锐利|泰坦|飓风|汲取/g) || []).length;
  const magic = (names.match(/蓝霸|珠光|帽|电刃|朔极|离子/g) || []).length;
  return physical > magic ? 'physical' : magic > physical ? 'magic' : 'mixed';
}

function routeFeatures(t) {
  const carry = mainCarry(t);
  const carryUnit = (profile(t).units || []).find(x => x.name === carry.name) || {};
  const cost = Number(carryUnit.price || 3);
  const starTarget = Number(carry.starTarget || (cost <= 3 ? 3 : 2));
  const level = cost <= 1 ? 5 : cost === 2 ? 6 : cost === 3 ? 7 : cost === 4 ? 8 : 9;
  const transition = (jaccard(t.earlyUnits, t.midUnits) + jaccard(t.midUnits, t.coreUnits)) / 2;
  const components = itemComponents(t);
  const componentCounts = components.reduce((acc, x) => ({ ...acc, [x]: (acc[x] || 0) + 1 }), {});
  const maxDuplicate = Math.max(0, ...Object.values(componentCounts));
  const itemFlex = components.length ? clamp(1 - Math.max(0, maxDuplicate - 1) * 0.14 - Math.max(0, uniq(components).length - 5) * 0.04, 0.35, 1) : 0.55;
  const traits = (profile(t).activeTraits || []).map(x => x.name || x.label || String(x));
  const frontline = (profile(t).units || []).filter(x => x.role === 'frontline').length;
  const control = (t.coreUnits || []).filter(name => /瑟庄妮|费德提克|迦娜|艾克|阿利斯塔|拉莫斯|科加斯|努努/.test(name)).length;
  const mechanism = !!t.mechanic;
  const base = t.quality === 'S' ? 67 : t.quality === 'A' ? 58 : 49;
  const strengthPrior = clamp(Number(t.strengthPrior || 0), 0, 1.2);
  return {
    carry,
    cost,
    starTarget,
    targetCopies: starTarget >= 3 ? 9 : 3,
    level,
    transition,
    itemFlex,
    components,
    direction: itemDirection(t),
    frontline,
    control,
    traits,
    mechanism,
    base: base + strengthPrior * 10 + clamp((t.coreUnits || []).length - 7, -2, 2),
  };
}

function componentSupply(name, scenario) {
  if (/暴风之剑|反曲之弓|拳套/.test(name)) return scenario.physicalItems;
  if (/无用大棒|女神之泪/.test(name)) return scenario.magicItems;
  if (/锁子甲|负极斗篷|巨人腰带/.test(name)) return scenario.tankItems;
  return (scenario.physicalItems + scenario.magicItems + scenario.tankItems) / 3;
}

function shopReadiness(f, scenario) {
  const odds = Number(((shopOdds[f.level] || [])[f.cost - 1]) || 0) / 100;
  const count = Number(unitCounts[f.cost] || 1);
  if (!odds) return 0;
  const gold = 24 + scenario.economy * 44;
  const expectedCopies = gold / 2 * 5 * odds / count * scenario.shopLuck[f.cost - 1];
  return clamp(expectedCopies / f.targetCopies, 0, 1.12);
}

function itemReadiness(f, scenario) {
  if (!f.components.length) return 0.55;
  return clamp(f.components.reduce((sum, name) => sum + componentSupply(name, scenario), 0) / f.components.length * f.itemFlex, 0.2, 1.15);
}

function opponentFit(f, scenario) {
  const has = pattern => f.traits.some(x => pattern.test(x));
  if (scenario.opponent === 0) return has(/护卫|福牛/) ? 1.12 : 0.94;
  if (scenario.opponent === 1) return has(/秘术|福牛/) ? 1.12 : 0.94;
  if (scenario.opponent === 2) return clamp(0.9 + f.frontline * 0.035 + f.control * 0.04, 0.88, 1.14);
  return clamp(0.93 + f.control * 0.035 + (f.direction === 'physical' ? 0.03 : 0), 0.9, 1.12);
}

function sampleUtility(t, f, scenario, routeNoise) {
  const shop = shopReadiness(f, scenario);
  const items = itemReadiness(f, scenario);
  const directionSupply = f.direction === 'physical' ? scenario.physicalItems : f.direction === 'magic' ? scenario.magicItems
    : (scenario.physicalItems + scenario.magicItems) / 2;
  const transition = f.transition * scenario.tempo;
  const defense = clamp(0.88 + f.frontline * 0.035 + f.control * 0.025, 0.88, 1.17);
  const gate = f.mechanism ? 0.9 + scenario.mechanism * 0.1 : 1;
  const dependencyRisk = (f.starTarget >= 3 ? 3.5 : 1.5) + (1 - f.itemFlex) * 5 + (f.mechanism ? 2.5 : 0);
  const value = f.base
    + shop * 19
    + items * 14
    + directionSupply * 8
    + transition * 9
    + defense * 7
    + opponentFit(f, scenario) * 8
    - dependencyRisk
    + routeNoise * 3.2;
  return value * gate;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index), hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function dependencies(t, f) {
  const rows = [];
  if (t.mechanic && t.mechanic.requiredAugment) rows.push(`符文:${t.mechanic.requiredAugment}`);
  if (t.mechanic && (t.mechanic.requiredUnits || []).length) rows.push(`机制棋子:${t.mechanic.requiredUnits.join('+')}`);
  if (f.carry.name) rows.push(`${f.carry.name}${f.starTarget}星`);
  if ((f.carry.items || []).length) rows.push(`三件套:${f.carry.items.slice(0, 3).join('+')}`);
  return rows;
}

function drivers(f) {
  return [
    `转型重合${Math.round(f.transition * 100)}%`,
    `装备弹性${Math.round(f.itemFlex * 100)}%`,
    `${f.level}级追${f.carry.name || '主C'}${f.starTarget}星`,
  ];
}

const features = new Map(templates.map(t => [t.id, routeFeatures(t)]));
const values = new Map(templates.map(t => [t.id, []]));
const ranks = new Map(templates.map(t => [t.id, []]));
const next = rng(SAMPLE_SEED);

for (let sample = 0; sample < SAMPLE_SIZE; sample++) {
  const scenario = {
    economy: 0.72 + next() * 0.58,
    physicalItems: 0.62 + next() * 0.76,
    magicItems: 0.62 + next() * 0.76,
    tankItems: 0.62 + next() * 0.76,
    shopLuck: Array.from({ length: 5 }, () => 0.58 + next() * 0.84),
    tempo: 0.72 + next() * 0.56,
    mechanism: 0.7 + next() * 0.3,
    opponent: Math.floor(next() * 4),
  };
  const groups = { stable: [], conditional: [] };
  templates.forEach(t => {
    const f = features.get(t.id);
    const routeNext = rng((SAMPLE_SEED ^ hash(t.id) ^ Math.imul(sample + 1, 2654435761)) >>> 0);
    const utility = sampleUtility(t, f, scenario, normal(routeNext));
    values.get(t.id).push(utility);
    groups[f.mechanism ? 'conditional' : 'stable'].push({ id: t.id, utility });
  });
  Object.values(groups).forEach(rows => rows.sort((a, b) => b.utility - a.utility).forEach((row, i) => ranks.get(row.id).push(i + 1)));
}

const certificates = templates.map(t => {
  const f = features.get(t.id);
  const sorted = values.get(t.id).slice().sort((a, b) => a - b);
  const rankRows = ranks.get(t.id);
  const peerCount = templates.filter(x => !!x.mechanic === f.mechanism).length;
  const topQuartileCut = Math.max(1, Math.ceil(peerCount / 4));
  const mean = sorted.reduce((sum, x) => sum + x, 0) / sorted.length;
  const cvarRows = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.1)));
  const cvar10 = cvarRows.reduce((sum, x) => sum + x, 0) / cvarRows.length;
  const top1Rate = rankRows.filter(x => x === 1).length / SAMPLE_SIZE * 100;
  const top5Rate = rankRows.filter(x => x <= 5).length / SAMPLE_SIZE * 100;
  const topQuartileRate = rankRows.filter(x => x <= topQuartileCut).length / SAMPLE_SIZE * 100;
  // 105 是本模型“关键组件未同时到位”的经验失速线；仅表示模型运营失败，不等同真实第八率。
  const failureRate = sorted.filter(x => x < 105).length / SAMPLE_SIZE * 100;
  const cvarNorm = clamp((cvar10 - 95) / 25 * 100, 0, 100);
  const robustness = clamp(topQuartileRate * 0.4 + top5Rate * 0.2 + (100 - failureRate) * 0.25 + cvarNorm * 0.15, 0, 100);
  const priorPoints = clamp(Math.round((robustness - 50) / 10), -5, 5);
  const evidenceLevel = topQuartileRate >= 55 && failureRate <= 12 ? 'L2.5 模型扰动稳健'
    : topQuartileRate >= 30 && failureRate <= 30 ? 'L2 模型候选' : 'L1.5 高敏感假设';
  return {
    templateId: t.id,
    templateName: t.name,
    peerGroup: f.mechanism ? '条件路线（已满足专属门槛）' : '常规路线',
    sampleSize: SAMPLE_SIZE,
    seed: SAMPLE_SEED,
    evidenceLevel,
    priorPoints,
    metrics: {
      meanUtility: round(mean),
      interval95: [round(quantile(sorted, 0.025)), round(quantile(sorted, 0.975))],
      cvar10: round(cvar10),
      top1Rate: round(top1Rate),
      top5Rate: round(top5Rate),
      topQuartileRate: round(topQuartileRate),
      failureRate: round(failureRate),
      robustness: round(robustness),
    },
    drivers: drivers(f),
    dependencies: dependencies(t, f),
    warning: '模型扰动样本，不是真实排位；未校准AOE、技能打断、逐格走位和公共牌库竞争。',
  };
}).sort((a, b) => b.metrics.robustness - a.metrics.robustness || b.metrics.cvar10 - a.metrics.cvar10);

const byId = new Map(certificates.map(x => [x.templateId, x]));
templates.forEach(t => { t.certification = byId.get(t.id); });
stage2.certification = {
  sampleSize: SAMPLE_SIZE,
  seed: SAMPLE_SEED,
  method: '同随机种子蒙特卡洛：经济、商店费用运气、三类装备供给、四类对手与转型节奏联合扰动。',
  utilityFormula: 'U=基础强度+19×搜卡就绪+14×装备就绪+8×装备方向+9×转型平滑+7×前排+8×对局适配-依赖风险+噪声',
  robustnessFormula: 'R=40%×前25%进入率+20%×前5率+25%×(1-失速率)+15%×尾部归一值',
  decisionFormula: '现场最终分=资产/概率/抗脆弱分+clamp((R-50)/10,-5,+5)',
  failureThreshold: '样本效用<105记为模型失速；不等同真实第八率。',
  ceiling: 'L2.5；未接入真实战绩留出集，不授予L3/L4。',
};

function normalizeName(name) {
  return String(name || '').replace(/[【】\s·:：()（）>→+\-]/g, '').replace(/模型/g, '');
}

function metaTeam(row) {
  return (row.team || []).map(x => typeof x === 'string' ? x : x.name).filter(Boolean);
}

function matchCertificate(row) {
  const names = new Set(metaTeam(row));
  const carry = row.carry || '';
  const augment = row.augment || '';
  const ranked = templates.map(t => {
    const core = t.coreUnits || [];
    const overlap = core.filter(x => names.has(x)).length / Math.max(1, new Set([...core, ...names]).size);
    const tc = mainCarry(t).name;
    const augmentHit = augment && t.mechanic && t.mechanic.requiredAugment === augment ? 1 : 0;
    const nameHit = normalizeName(t.name).includes(normalizeName(row.displayName || row.name)) || normalizeName(row.displayName || row.name).includes(normalizeName(t.name)) ? 1 : 0;
    return { t, score: overlap * 60 + (carry && carry === tc ? 25 : 0) + augmentHit * 35 + nameHit * 50 };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 20) return null;
  return { ...byId.get(best.t.id), matchedRoute: best.t.name, matchScore: round(best.score) };
}

[...(meta.stable || []), ...(meta.conditional || [])].forEach(row => { row.certification = matchCertificate(row); });
(meta.verdicts || []).forEach(group => (group.rows || []).forEach(row => {
  const source = row.augment
    ? (meta.conditional || []).find(x => x.augment === row.augment && x.carry === row.carry)
    : (meta.stable || []).find(x => x.displayName === row.displayName);
  if (source) row.certification = source.certification;
}));
model.metaDiscovery = meta;
model.verdicts = meta.verdicts;

const result = {
  version: stage2.version,
  generated: stage2.generated,
  sampleSize: SAMPLE_SIZE,
  seed: SAMPLE_SEED,
  methodology: stage2.certification,
  certificates,
  limitations: [
    '这是模型不确定性与资源扰动实验，不是真实玩家对局样本。',
    '条件路线在其专属符文和必需棋子已经满足的条件下，与其他条件路线比较。',
    'L3需要独立战斗模拟校准；L4需要未参与调参的真实排位留出集。',
  ],
};

fs.writeFileSync(path.join(ROOT, 'route_certification_results.json'), JSON.stringify(result, null, 1));
fs.writeFileSync(path.join(ROOT, 'stage2_matcher_results.json'), JSON.stringify(stage2, null, 1));
fs.writeFileSync(path.join(ROOT, '可视化', 'stage2-matcher-data.js'), `window.STAGE2_MATCHER=${JSON.stringify(stage2)};`);
fs.writeFileSync(path.join(ROOT, 'meta_discovery_results.json'), JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(ROOT, 'model_results.json'), JSON.stringify(model, null, 1));
fs.writeFileSync(path.join(ROOT, '可视化', 'data.js'), `window.MODEL=${JSON.stringify(model)};`);

const report = [
  '# 版本路线认证实验', '',
  `版本：${result.version}`, '',
  `样本：${SAMPLE_SIZE} 次确定性蒙特卡洛，种子 ${SAMPLE_SEED}。`, '',
  '> 这些是模型扰动样本，不是真实排位。未接入真实留出集前，最高证据等级为 L2.5。', '',
  '## 公式', '',
  `- ${stage2.certification.utilityFormula}`, 
  `- ${stage2.certification.robustnessFormula}`,
  `- ${stage2.certification.decisionFormula}`,
  `- ${stage2.certification.failureThreshold}`, '',
  '## 常规路线稳健度 Top15', '',
  '| 排名 | 路线 | 等级 | 稳健度 | 前25%率 | 失败率 | 后10%均值 | 95%扰动区间 |',
  '|---:|---|---|---:|---:|---:|---:|---|',
  ...certificates.filter(x => x.peerGroup.startsWith('常规')).slice(0, 15).map((x, i) => `| ${i + 1} | ${x.templateName} | ${x.evidenceLevel} | ${x.metrics.robustness}% | ${x.metrics.topQuartileRate}% | ${x.metrics.failureRate}% | ${x.metrics.cvar10} | ${x.metrics.interval95.join('~')} |`), '',
  '## 条件路线稳健度 Top10', '',
  '| 排名 | 路线 | 稳健度 | 前25%率 | 失败率 | 依赖 |',
  '|---:|---|---:|---:|---:|---|',
  ...certificates.filter(x => x.peerGroup.startsWith('条件')).slice(0, 10).map((x, i) => `| ${i + 1} | ${x.templateName} | ${x.metrics.robustness}% | ${x.metrics.topQuartileRate}% | ${x.metrics.failureRate}% | ${x.dependencies.join('；')} |`), '',
  '## 认证边界', '',
  ...result.limitations.map(x => `- ${x}`),
];
fs.writeFileSync(path.join(ROOT, 'reports', '版本路线认证实验.md'), report.join('\n'));

if (certificates.length !== templates.length) throw new Error('路线认证数量与模板数量不一致');
if (certificates.some(x => x.sampleSize !== SAMPLE_SIZE || !Number.isFinite(x.metrics.robustness))) throw new Error('认证指标非法');
if (templates.some(t => !t.certification)) throw new Error('存在未附加认证的路线模板');
if (!meta.stable.some(x => x.certification) || !meta.conditional.some(x => x.certification)) throw new Error('版本结果没有附加认证证据');
console.log(`路线认证完成: ${certificates.length}条路线 × ${SAMPLE_SIZE}样本`);
console.log(`常规#1: ${certificates.find(x => x.peerGroup.startsWith('常规')).templateName}`);
console.log(`条件#1: ${certificates.find(x => x.peerGroup.startsWith('条件')).templateName}`);
console.log('输出: route_certification_results.json, reports/版本路线认证实验.md');
