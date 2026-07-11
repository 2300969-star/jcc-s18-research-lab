// 元阵容求解器：用同一组队算法比较稳定场景与英雄强化反事实场景，并生成版本梯队。
const fs = require('fs');
const path = require('path');
const { currentVersion } = require('./version-context.js');
const optimizer = require('./discover.js');
const { simulate } = require('./model.js');
const { profiles } = require('./mechanic-profiles.js');

const ROOT = __dirname;
const version = currentVersion(ROOT);
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const discovery = read('discovery_results.json');
const model = read('model_results.json');
const equip = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'equip.js'), 'utf8')).data;
const equipByName = {};
Object.values(equip).forEach(item => {
  if (item && item.name && !equipByName[item.name]) equipByName[item.name] = item;
});
const chess = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'chess.js'), 'utf8')).data;
const heroByName = Object.fromEntries(Object.values(chess)
  .filter(x => x && x.showHeroTag === '1')
  .map(x => [x.name, x]));

function pct(value) {
  return Math.round(value * 10) / 10;
}

function tierForRatio(ratio) {
  if (ratio >= 0.88) return 'T0';
  if (ratio >= 0.72) return 'T1';
  return 'T1.5';
}

function stageForHero(name) {
  const unit = optimizer.unitByName[name];
  if (!unit) return null;
  return unit.price <= 3 ? 'mid' : 'late';
}

function primaryTraits(row) {
  return (row.traits || row.acts || []).filter(x => !/^1/.test(x)).slice(0, 3);
}

function candidateName(row, prefix = '模型') {
  const traits = primaryTraits(row).slice(0, 2).join('');
  return `${prefix}·${row.carry}${traits ? `·${traits}` : ''}`;
}

function stableCandidates() {
  const conditionalNames = profiles.map(x => x.augment).filter(x => x && x.length >= 3);
  const official = ((model.teamsearch && model.teamsearch.officialScored) || []).map(row => ({
    ...row,
    source: 'official',
    displayName: row.name,
  })).filter(row => !conditionalNames.some(name => row.name.includes(name)));
  const generated = ((model.teamsearch && model.teamsearch.topTeams) || []).map(row => ({
    ...row,
    source: 'solver',
    displayName: candidateName(row),
  }));
  const seen = new Set();
  return [...official, ...generated]
    .sort((a, b) => b.score - a.score)
    .filter(row => {
      const key = `${row.carry}|${(row.team || []).map(x => x.name).sort().join(',') || row.displayName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function conditionalCandidates() {
  const rows = [];
  const supported = profiles.filter(profile => profile.supported && profile.targets.length);
  for (const profile of supported) {
    for (const target of profile.targets) {
      const stage = stageForHero(target);
      if (!stage) continue;
      const required = profile.requiredUnits.filter(name => name !== target);
      const baseline = optimizer.optimizeScenario(stage, target, required, { id: `baseline-${profile.id}` })[0];
      const scenario = optimizer.optimizeScenario(stage, target, required, profile)[0];
      if (!baseline || !scenario) continue;
      const uplift = scenario.score - baseline.score;
      const upliftPct = baseline.score > 0 ? uplift / baseline.score * 100 : 0;
      const stageScores = (discovery.carryAtlas[stage] || []).map(x => x.score).sort((a, b) => b - a);
      const stageTop = stageScores[0] || scenario.score;
      const ratio = scenario.score / stageTop;
      rows.push({
        augment: profile.augment,
        carry: target,
        stage,
        level: scenario.level,
        score: scenario.score,
        baselineScore: baseline.score,
        uplift,
        upliftPct: pct(upliftPct),
        stageRatio: pct(ratio),
        confidence: profile.confidence,
        basis: profile.basis,
        requiredUnits: profile.requiredUnits,
        team: scenario.team,
        traits: scenario.traits,
        carryItems: scenario.carryItems,
        carryDps: scenario.carryDps,
        frontEHP: scenario.frontEHP,
        tankDetail: scenario.tankDetail,
      });
    }
  }
  return rows
    .filter(row => row.uplift > 0)
    .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence) || b.uplift - a.uplift);
}

function componentsFor(items) {
  return [...new Set((items || []).flatMap(name => {
    const item = equipByName[name];
    return [item && equip[item.synthesis1], item && equip[item.synthesis2]].filter(Boolean).map(x => x.name);
  }))];
}

function itemView(name) {
  const item = equipByName[name];
  if (!item) return { name, picture: '', components: [] };
  const localPicture = picture => picture ? `assets/equip/${path.basename(new URL(picture).pathname)}` : '';
  const components = [equip[item.synthesis1], equip[item.synthesis2]]
    .filter(Boolean)
    .map(x => ({ name: x.name, picture: localPicture(x.picture) }));
  return { name, picture: localPicture(item.picture), components };
}

function teamNames(row) {
  return (row && row.team || []).map(x => typeof x === 'string' ? x : x.name).filter(Boolean);
}

function activeTraitLabels(names) {
  const units = names.map(name => optimizer.unitByName[name]).filter(Boolean);
  return optimizer.activeTraits(units)
    .sort((a, b) => b.need - a.need || b.tier - a.tier)
    .map(x => `${x.need}${x.name}`);
}

function bestItemHolder(names, itemNames, preferred) {
  const ids = itemNames.map(name => equipByName[name] && equipByName[name].id).filter(Boolean);
  const rows = names.map(name => {
    const unit = optimizer.unitByName[name];
    if (!unit) return null;
    const star = unit.price <= 2 ? 2 : 1;
    try {
      const result = simulate(unit.id, ids, star);
      const range = Number((heroByName[name] || {}).attackRange || 1);
      const survivalFactor = Math.min(1.22, 0.82 + range * 0.08 + Number(unit.hp || 0) / 9000);
      return { name, dps: Math.round(result.dps), value: result.dps * survivalFactor + (name === preferred ? 25 : 0) };
    } catch (_) {
      return null;
    }
  }).filter(Boolean).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return rows[0] || { name: preferred || names[0], dps: 0, value: 0 };
}

function bridgeCandidate(stage, finalRow) {
  const rows = discovery.carryAtlas[stage] || [];
  const finalNames = new Set(teamNames(finalRow));
  const targetItems = finalRow.carryItems || [];
  const maxScore = Math.max(...rows.map(x => x.score), 1);
  return rows.map(row => {
    const names = teamNames(row);
    const holder = bestItemHolder(names, targetItems, row.carry);
    const overlap = names.filter(name => finalNames.has(name)).length;
    const itemFit = Math.min(1, Math.log1p(holder.dps) / 7);
    const transitionScore = row.score / maxScore * 50
      + overlap / Math.max(1, names.length) * 27
      + itemFit * 18
      + (row.carry === finalRow.carry ? 5 : 0);
    return { row, holder, transitionScore };
  }).sort((a, b) => b.transitionScore - a.transitionScore || b.row.score - a.row.score)[0];
}

function traitProgress(beforeNames, afterNames) {
  const before = new Map(activeTraitLabels(beforeNames).map(label => [label.replace(/^\d+/, ''), Number(label.match(/^\d+/)[0])]));
  return activeTraitLabels(afterNames).reduce((sum, label) => {
    const name = label.replace(/^\d+/, '');
    const count = Number(label.match(/^\d+/)[0]);
    return sum + Math.max(0, count - (before.get(name) || 0));
  }, 0);
}

function expandLateTeam(row) {
  const names = teamNames(row);
  const targetSize = Math.max(8, names.length);
  const expanded = names.slice();
  while (expanded.length < targetSize) {
    const pick = optimizer.units.filter(unit => !expanded.includes(unit.name)).map(unit => {
      const next = [...expanded, unit.name];
      const progress = traitProgress(expanded, next);
      const control = /晕眩|击飞|恐惧|嘲讽|缴械/.test(String((heroByName[unit.name] || {}).skillDesc || '')) ? 8 : 0;
      const defense = Number(unit.hp || 0) * (1 + (Number(unit.armor || 0) + Number(unit.mr || 0)) / 200) / 320;
      return { unit, value: progress * 20 + control + defense + unit.price * 1.5 };
    }).sort((a, b) => b.value - a.value || a.unit.name.localeCompare(b.unit.name, 'zh-Hans-CN'))[0];
    if (!pick) break;
    expanded.push(pick.unit.name);
  }
  return expanded;
}

function heroRole(name, carry, tankOrder) {
  if (name === carry) return '主C';
  const tankIndex = tankOrder.indexOf(name);
  if (tankIndex === 0) return '主坦';
  if (tankIndex === 1) return '副坦';
  const hero = heroByName[name] || {};
  if (Number(hero.attackRange || 1) <= 2 && /晕眩|击飞|恐惧|嘲讽|缴械/.test(String(hero.skillDesc || ''))) return '控制';
  return Number(hero.attackRange || 1) >= 3 ? '后排输出' : '战士';
}

function positionBoard(names, carry, items, tankDetail) {
  const tankOrder = (tankDetail || []).map(x => x.hero).filter(name => names.includes(name) && name !== carry);
  const used = new Set();
  const slots = {
    '主坦': [[1, 4], [1, 3], [1, 5]],
    '副坦': [[1, 2], [1, 6], [2, 3], [2, 5]],
    '控制': [[1, 3], [1, 5], [2, 2], [2, 6], [1, 1], [1, 7]],
    '战士': [[2, 4], [2, 3], [2, 5], [1, 2], [1, 6], [2, 1], [2, 7]],
    '后排输出': [[4, 2], [4, 6], [4, 3], [4, 5], [3, 2], [3, 6]],
    '主C': [[4, 4], [4, 5], [4, 3], [3, 4], [2, 4]],
  };
  const fallback = [];
  for (let row = 1; row <= 4; row++) for (let col = 1; col <= 7; col++) fallback.push([row, col]);
  const order = names.slice().sort((a, b) => {
    const weight = role => ({ '主坦': 0, '副坦': 1, '控制': 2, '主C': 3, '战士': 4, '后排输出': 5 }[role] ?? 9);
    return weight(heroRole(a, carry, tankOrder)) - weight(heroRole(b, carry, tankOrder));
  });
  return order.map(name => {
    const hero = heroByName[name] || {};
    const role = heroRole(name, carry, tankOrder);
    let preferred = slots[role] || fallback;
    if (role === '主C' && Number(hero.attackRange || 1) <= 1) preferred = [[2, 4], [2, 3], [2, 5], [1, 4]];
    const pos = [...preferred, ...fallback].find(([row, col]) => !used.has(`${row}-${col}`));
    used.add(`${pos[0]}-${pos[1]}`);
    const tank = (tankDetail || []).find(x => x.hero === name);
    const unitItems = name === carry ? items : tank ? (tank.items || []) : [];
    return {
      name,
      price: Number(hero.price || (optimizer.unitByName[name] || {}).price || 0),
      row: pos[0],
      col: pos[1],
      role,
      carry: name === carry,
      items: unitItems,
    };
  });
}

function stageView(key, label, level, row, carry, names, targetItems, method) {
  const holder = carry || bestItemHolder(names, targetItems, row && row.carry).name;
  const tanks = row && row.tankDetail || [];
  return {
    key,
    label,
    level,
    carry: holder,
    score: row && row.score || 0,
    method,
    team: names,
    traits: activeTraitLabels(names),
    board: positionBoard(names, holder, targetItems, tanks),
  };
}

function operationPlan(stages, finalRow) {
  const components = componentsFor(finalRow.carryItems || []);
  const carryUnit = optimizer.unitByName[finalRow.carry];
  const price = carryUnit ? carryUnit.price : 4;
  const rollLevel = price <= 1 ? 5 : price === 2 ? 6 : price === 3 ? 7 : price === 4 ? 8 : 9;
  const targetCopies = price <= 3 ? 9 : 3;
  const shopOdds = ((discovery.shopModel || {}).odds || {})[rollLevel] || [0, 0, 0, 0, 0];
  const costOdds = Number(shopOdds[price - 1] || 0) / 100;
  const unitCount = Number((((discovery.shopModel || {}).unitCounts || {})[price]) || 1);
  const slotProbability = costOdds / unitCount;
  const shopProbability = 1 - Math.pow(1 - slotProbability, 5);
  const expectedGold = slotProbability > 0 ? Math.round(targetCopies / (slotProbability * 5) * 2) : 0;
  const dPlan = `${rollLevel}级${price}费槽${Math.round(costOdds * 100)}%，单次商店见${finalRow.carry}约${pct(shopProbability * 100)}%，从0张到${targetCopies}张理论期望约${expectedGold}金`;
  const [early, mid, late] = stages;
  const handoff = (from, to, targetTeam, phase) => {
    if (from === to) return `${phase}继续由${to}持装`;
    if (targetTeam.includes(from)) return `${phase}先留一只无装${from}，再卖持装${from}把三件套转给${to}`;
    return `${phase}卖掉持装${from}，把三件套转给${to}`;
  };
  const change1 = handoff(early.carry, mid.carry, mid.team, '中期');
  const change2 = handoff(mid.carry, late.carry, late.team, '成型后');
  return [
    `2阶段：优先拿${components.join('、') || '目标装散件'}，${early.level}人口由${early.carry}带目标装打工。`,
    `3/4阶段：${change1}；只保留终局重合牌，按模型承接到${mid.team.join('、')}。`,
    `成型：${change2}，终局围绕${finalRow.carry}；${dPlan}（独立抽样近似，未扣同行与牌库）。`,
    `止损：目标三件差两件以上或关键主C两轮搜不到，沿当前装备承载者切换到同方向次优路线。`,
  ];
}

function buildPresentation(row) {
  if (!teamNames(row).length || !(row.carryItems || []).length) return null;
  const targetItems = row.carryItems;
  const earlyBridge = bridgeCandidate('early', row);
  const midBridge = row.stage === 'mid'
    ? { row, holder: bestItemHolder(teamNames(row), targetItems, row.carry), transitionScore: 100 }
    : bridgeCandidate('mid', row);
  if (!earlyBridge || !midBridge) return null;
  const earlyNames = teamNames(earlyBridge.row);
  const midNames = teamNames(midBridge.row);
  const lateNames = expandLateTeam(row);
  const early = stageView('early', '前期', 5, earlyBridge.row, earlyBridge.holder.name, earlyNames, targetItems,
    `阶段战力${earlyBridge.row.score}，转型相容度${Math.round(earlyBridge.transitionScore)}`);
  const mid = stageView('mid', '中期', 7, midBridge.row, midBridge.holder.name, midNames, targetItems,
    `阶段战力${midBridge.row.score}，转型相容度${Math.round(midBridge.transitionScore)}`);
  const late = stageView('late', '后期', Math.max(8, lateNames.length), row, row.carry, lateNames, targetItems,
    `终局模型总分${row.score}，主C模拟${row.carryDps || 0}/秒`);
  const stages = [early, mid, late];
  return {
    stages,
    items: targetItems,
    operations: operationPlan(stages, row),
    positioningBasis: '行1靠敌方；主坦按EHP居中承伤，控制分散前置，远程主C按攻击距离沉底并与副输出错侧。',
    derivation: '阶段承载者由目标三件套在当期棋盘逐人重跑输出模型后选出；过渡阵容按阶段战力、终局重合率与持装效率联合排序。',
  };
}

function generatedRoutes(rows) {
  return rows
    .filter(row => row.upliftPct >= 5 && row.stageRatio >= 0.7 && row.confidence >= 0.6)
    .slice(0, 24)
    .map((row, index) => {
      const names = row.team.map(x => x.name);
      const byPrice = row.team.slice().sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'zh-Hans-CN'));
      const earlyUnits = byPrice.filter(x => x.price <= 2).slice(0, 4).map(x => x.name);
      const midUnits = byPrice.filter(x => x.price <= 3).slice(0, Math.min(row.level, 7)).map(x => x.name);
      return {
        id: `meta-${row.augment}-${row.carry}-${index}`,
        source: 'meta-solver',
        quality: row.stageRatio >= 0.9 ? 'S' : 'A',
        name: `${row.augment}${row.carry}机制路线`,
        family: `${row.augment}·${row.carry}`,
        goal: `反事实模拟净提升${row.upliftPct}%` ,
        earlyUnits: [...new Set([...row.requiredUnits, ...earlyUnits])].slice(0, 5),
        midUnits: [...new Set([...row.requiredUnits, ...midUnits])].slice(0, 7),
        coreUnits: names,
        earlyTraits: row.traits.slice(0, 4),
        componentPrefs: componentsFor(row.carryItems),
        completedPrefs: row.carryItems,
        augmentPrefs: [row.augment],
        augmentCats: ['英雄强化'],
        monsterPrefs: [],
        route: [`拿到${row.augment}后锁定${row.requiredUnits.join('+')}`, `${row.level}级围绕${row.carry}完成算法棋盘`, `按来牌替换至${names.join('、')}`],
        boardNote: `算法自动生成；${row.basis}。`,
        officialText: {
          early: `硬门槛：${row.augment}+${row.requiredUnits.join('、')}。`,
          equipment: `${row.carry}模型三件：${row.carryItems.join('、')}。`,
          hex: `无强化${row.baselineScore}分，有强化${row.score}分，净提升${row.upliftPct}%。`,
          enemy: `机制置信度${Math.round(row.confidence * 100)}%；未量化控制、站位和击杀归属误差。`,
        },
        actions: {
          keep: names,
          item: `装备往${row.carryItems.join('、')}靠。`,
          checkpoint: `${row.augment}场景总分${row.score}，比同棋盘基线高${row.upliftPct}%。`,
          stopLoss: `缺${row.augment}或${row.requiredUnits.join('、')}不启动。`,
        },
        role: '机制条件',
        strengthPrior: row.stageRatio,
        mechanic: {
          type: 'meta-counterfactual',
          requiredAugment: row.augment,
          requiredUnits: row.requiredUnits,
          matchBonus: Math.max(12, Math.min(40, Math.round(row.upliftPct))),
          missingPenalty: 80,
          text: `${row.basis}；反事实+${row.upliftPct}%`,
        },
      };
    });
}

function groupStable(rows) {
  const top = rows[0] ? rows[0].score : 1;
  const groups = new Map();
  rows.slice(0, 16).forEach(row => {
    const tier = tierForRatio(row.score / top);
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier).push(row);
  });
  return ['T0', 'T1', 'T1.5'].filter(tier => groups.has(tier)).map(tier => ({
    tier,
    kind: 'stable',
    family: `算法稳定梯队 · ${tier}`,
    comps: groups.get(tier).slice(0, 6).map(row => row.displayName),
    rows: groups.get(tier).slice(0, 6),
    reason: '全队同口径：主C输出 + 副输出 + 前排EHP + 羁绊机制分。',
  }));
}

function groupConditional(rows) {
  const qualified = rows.filter(row => row.upliftPct >= 5 && row.confidence >= 0.6).slice(0, 18);
  const groups = new Map();
  qualified.forEach(row => {
    const tier = row.stageRatio >= 0.9 && row.upliftPct >= 15 ? 'CT0' : row.stageRatio >= 0.75 ? 'CT1' : 'CT1.5';
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier).push(row);
  });
  return ['CT0', 'CT1', 'CT1.5'].filter(tier => groups.has(tier)).map(tier => ({
    tier,
    kind: 'conditional',
    family: `条件强化梯队 · ${tier}`,
    comps: groups.get(tier).slice(0, 8).map(row => `${row.augment}·${row.carry}`),
    rows: groups.get(tier).slice(0, 8),
    reason: '同一棋盘无强化/有强化反事实模拟；只收录净提升≥5%的可量化机制。',
  }));
}

const stable = stableCandidates();
const conditional = conditionalCandidates();
stable.forEach(row => { row.presentation = buildPresentation(row); });
conditional.forEach(row => { row.presentation = buildPresentation(row); });
const itemCatalog = [...new Set([...stable, ...conditional]
  .filter(row => row.presentation)
  .flatMap(row => [
    ...row.presentation.items,
    ...row.presentation.stages.flatMap(stage => stage.board.flatMap(unit => unit.items || [])),
  ]))].map(itemView);
const verdicts = [...groupStable(stable), ...groupConditional(conditional)];
const routes = generatedRoutes(conditional);
const unsupported = profiles.filter(x => !x.supported).map(x => ({ augment: x.augment, desc: x.desc, basis: x.basis }));

const result = {
  version: version.label,
  generated: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  methodology: {
    stable: '官方S级与全英雄束搜索阵容统一按全队战力公式排序。',
    conditional: '英雄强化文本转机制场景，固定硬门槛后重新搜索棋盘和装备，与无强化基线做反事实差分。',
    noAnswerInjection: '强化配置只描述机制方程和必需棋子，不保存成型阵容；阵容由搜索器生成。',
  },
  coverage: {
    heroAugments: profiles.length,
    simulated: profiles.filter(x => x.supported).length,
    unsupported: unsupported.length,
  },
  stable,
  conditional,
  itemCatalog,
  routes,
  unsupported,
  verdicts,
};

model.metaDiscovery = result;
model.verdicts = verdicts;
fs.writeFileSync(path.join(ROOT, 'meta_discovery_results.json'), JSON.stringify(result, null, 1));
fs.writeFileSync(path.join(ROOT, 'model_results.json'), JSON.stringify(model, null, 1));
fs.writeFileSync(path.join(ROOT, '可视化', 'data.js'), `window.MODEL=${JSON.stringify(model)};`);

const report = [
  '# 元阵容自动求解报告', '',
  `数据版本：${result.version}`, '',
  `英雄强化覆盖：${result.coverage.simulated}/${result.coverage.heroAugments}，未量化 ${result.coverage.unsupported}。`, '',
  '## 稳定阵容 Top10', '',
  '| 排名 | 候选 | 总分 | 主C | 主C DPS | 前排EHP |',
  '|---:|---|---:|---|---:|---:|',
  ...stable.slice(0, 10).map((row, i) => `| ${i + 1} | ${row.displayName} | ${row.score} | ${row.carry} | ${row.carryDps} | ${row.frontEHP} |`), '',
  '## 条件强化 Top12', '',
  '| 排名 | 强化·主C | 阶段 | 无强化 | 有强化 | 净提升 | 自动阵容 |',
  '|---:|---|---|---:|---:|---:|---|',
  ...conditional.slice(0, 12).map((row, i) => `| ${i + 1} | ${row.augment}·${row.carry} | ${row.stage} | ${row.baselineScore} | ${row.score} | ${row.upliftPct}% | ${row.team.map(x => x.name).join('、')} |`), '',
  '## 尚未量化', '',
  ...unsupported.map(row => `- ${row.augment}：${row.basis}`),
];
fs.writeFileSync(path.join(ROOT, 'reports', '元阵容自动求解.md'), report.join('\n'));

if (!stable.length || !verdicts.length) throw new Error('元阵容求解结果为空');
for (let i = 1; i < stable.length; i++) {
  if (stable[i - 1].score < stable[i].score) throw new Error('稳定榜未按总分降序');
}
const sisters = conditional.find(x => x.augment === '姐妹' && x.carry === '金克丝');
if (!sisters || !sisters.team.some(x => x.name === '蔚')) throw new Error('姐妹场景没有由硬门槛推导出蔚');
const sistersRoute = routes.find(x => x.name.includes('姐妹金克丝'));
if (!sistersRoute || sistersRoute.coreUnits.join(',') !== sisters.team.map(x => x.name).join(',')) throw new Error('比赛路线必须来自元求解阵容');
const presented = [...stable, ...conditional].filter(row => row.presentation);
for (const row of presented) {
  if (row.presentation.stages.length !== 3 || row.presentation.operations.length < 3) throw new Error('算法阵容缺少阶段棋盘或运营计划');
  for (const stage of row.presentation.stages) {
    const cells = stage.board.map(unit => `${unit.row}-${unit.col}`);
    if (new Set(cells).size !== cells.length) throw new Error(`${row.displayName || row.augment}的${stage.label}站位重叠`);
    if (stage.board.some(unit => unit.row < 1 || unit.row > 4 || unit.col < 1 || unit.col > 7)) throw new Error('算法站位越界');
  }
}
for (const item of itemCatalog) {
  if (!item.picture || !fs.existsSync(path.join(ROOT, '可视化', item.picture))) throw new Error(`缺少本地装备图：${item.name}`);
}
console.log(`元阵容求解完成: ${result.version}`);
console.log(`强化覆盖: ${result.coverage.simulated}/${result.coverage.heroAugments}`);
console.log(`算法展示: ${presented.length}条候选完成三阶段站位/装备/运营推导`);
console.log(`姐妹金克丝: ${sisters.baselineScore} -> ${sisters.score} (+${sisters.upliftPct}%)`);
console.log(`自动阵容: ${sisters.team.map(x => x.name).join('、')}`);
console.log('输出: meta_discovery_results.json, reports/元阵容自动求解.md, model_results.json');
