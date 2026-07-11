// 元阵容求解器：用同一组队算法比较稳定场景与英雄强化反事实场景，并生成版本梯队。
const fs = require('fs');
const path = require('path');
const { currentVersion } = require('./version-context.js');
const optimizer = require('./discover.js');
const { profiles } = require('./mechanic-profiles.js');

const ROOT = __dirname;
const version = currentVersion(ROOT);
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const discovery = read('discovery_results.json');
const model = read('model_results.json');
const equip = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'equip.js'), 'utf8')).data;
const equipByName = Object.fromEntries(Object.values(equip).filter(Boolean).map(x => [x.name, x]));

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
console.log(`元阵容求解完成: ${result.version}`);
console.log(`强化覆盖: ${result.coverage.simulated}/${result.coverage.heroAugments}`);
console.log(`姐妹金克丝: ${sisters.baselineScore} -> ${sisters.score} (+${sisters.upliftPct}%)`);
console.log(`自动阵容: ${sisters.team.map(x => x.name).join('、')}`);
console.log('输出: meta_discovery_results.json, reports/元阵容自动求解.md, model_results.json');
