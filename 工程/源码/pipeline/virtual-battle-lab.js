"use strict";

const fs = require("fs");
const { simulateBattle, heroByName } = require("../sim/combat-engine.js");
const { resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

const BASE_SEED = 20260713;
const SEEDS_PER_SIDE = 6;
const TOP_MATRIX_SIZE = 12;
const SCORE_WEIGHTS = { winRate: 0.55, meanMargin: 0.25, cvar10: 0.2 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function quantile(values, q) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index), hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function lowerCvar(values, alpha = 0.1) {
  const sorted = values.slice().sort((a, b) => a - b);
  const count = Math.max(1, Math.ceil(sorted.length * alpha));
  return sorted.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
}

function profileUnit(template, name) {
  return (template.routeProfile && template.routeProfile.units || []).find(unit => unit.name === name) || { name, items: [], role: "utility", traits: [] };
}

function battleBoard(template) {
  const profile = template.routeProfile || {};
  const carry = profile.mainCarry || { name: (template.carryUnits || [])[0], starTarget: 2, items: (template.completedPrefs || []).slice(0, 3) };
  const names = [];
  const add = name => { if (name && heroByName[name] && !names.includes(name)) names.push(name); };
  (template.coreUnits || []).forEach(add);
  add(carry.name);
  const candidates = (profile.units || []).slice().sort((a, b) => {
    const role = { mainCarry: 0, frontline: 1, subCarry: 2, utility: 3 };
    return (role[a.role] ?? 4) - (role[b.role] ?? 4) || Number((heroByName[b.name] || {}).price || 0) - Number((heroByName[a.name] || {}).price || 0);
  });
  candidates.forEach(unit => { if (names.length < 8) add(unit.name); });
  const finalNames = names.slice(0, Math.max(7, Math.min(9, names.length)));
  return finalNames.map(name => {
    const source = profileUnit(template, name);
    const hero = heroByName[name];
    const isCarry = name === carry.name;
    const defaultStar = isCarry ? Number(carry.starTarget || 2) : Number(hero.price) >= 4 ? 2 : 2;
    return {
      name,
      role: isCarry ? "mainCarry" : source.role || "utility",
      star: clamp(Number(source.starTarget || defaultStar), 1, 3),
      items: (isCarry ? carry.items : source.items || []).slice(0, 3),
      traits: source.traits || [],
      mechanic: isCarry ? template.mechanic || null : null,
    };
  });
}

function pairKey(a, b) {
  return [a, b].sort().join("||");
}

function schedule(templates) {
  const pairs = [];
  for (let left = 0; left < templates.length; left++) {
    for (let right = left + 1; right < templates.length; right++) pairs.push([templates[left], templates[right]]);
  }
  return pairs;
}

function summarize(template, outcomes, coverage, unsupported) {
  const wins = outcomes.filter(value => value > 0.01).length;
  const draws = outcomes.filter(value => Math.abs(value) <= 0.01).length;
  const winRate = (wins + draws * 0.5) / Math.max(1, outcomes.length) * 100;
  const meanMargin = outcomes.reduce((sum, value) => sum + value, 0) / Math.max(1, outcomes.length);
  const cvar10 = lowerCvar(outcomes, 0.1);
  const score = 100 * (
    SCORE_WEIGHTS.winRate * winRate / 100
    + SCORE_WEIGHTS.meanMargin * (meanMargin + 1) / 2
    + SCORE_WEIGHTS.cvar10 * (cvar10 + 1) / 2
  );
  return {
    templateId: template.id,
    name: template.name,
    source: template.source,
    carry: template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name,
    board: battleBoard(template).map(unit => ({ name: unit.name, star: unit.star, items: unit.items, role: unit.role })),
    battles: outcomes.length,
    winRate: round(winRate),
    meanMargin: round(meanMargin, 3),
    interval90: [round(quantile(outcomes, 0.05), 3), round(quantile(outcomes, 0.95), 3)],
    cvar10: round(cvar10, 3),
    robustScore: round(clamp(score, 0, 100)),
    coverage: round(coverage.reduce((sum, value) => sum + value, 0) / Math.max(1, coverage.length) * 100),
    unsupported: [...unsupported].slice(0, 12),
  };
}

function simulateTournament(templates) {
  const boards = new Map(templates.map(template => [template.id, battleBoard(template)]));
  const outcomes = new Map(templates.map(template => [template.id, []]));
  const coverages = new Map(templates.map(template => [template.id, []]));
  const unsupported = new Map(templates.map(template => [template.id, new Set()]));
  const versus = new Map();
  let totalBattles = 0;
  let leftWins = 0;
  let rightWins = 0;

  for (const [leftTemplate, rightTemplate] of schedule(templates)) {
    const leftBoard = boards.get(leftTemplate.id);
    const rightBoard = boards.get(rightTemplate.id);
    const pairMargins = [];
    for (let sample = 0; sample < SEEDS_PER_SIDE; sample++) {
      const seed = (BASE_SEED ^ hash(leftTemplate.id) ^ Math.imul(hash(rightTemplate.id), 31) ^ Math.imul(sample + 1, 2654435761)) >>> 0;
      const direct = simulateBattle(leftBoard, rightBoard, { seed });
      const swapped = simulateBattle(rightBoard, leftBoard, { seed });
      const margins = [direct.margin, -swapped.margin];
      outcomes.get(leftTemplate.id).push(...margins);
      outcomes.get(rightTemplate.id).push(...margins.map(value => -value));
      coverages.get(leftTemplate.id).push(direct.leftCoverage, swapped.rightCoverage);
      coverages.get(rightTemplate.id).push(direct.rightCoverage, swapped.leftCoverage);
      direct.leftUnsupported.forEach(value => unsupported.get(leftTemplate.id).add(value));
      swapped.rightUnsupported.forEach(value => unsupported.get(leftTemplate.id).add(value));
      direct.rightUnsupported.forEach(value => unsupported.get(rightTemplate.id).add(value));
      swapped.leftUnsupported.forEach(value => unsupported.get(rightTemplate.id).add(value));
      pairMargins.push(...margins);
      totalBattles += 2;
      if (direct.winner === 0) leftWins++; else if (direct.winner === 1) rightWins++;
      if (swapped.winner === 0) leftWins++; else if (swapped.winner === 1) rightWins++;
    }
    versus.set(pairKey(leftTemplate.id, rightTemplate.id), {
      left: leftTemplate.id,
      right: rightTemplate.id,
      leftWinRate: round((pairMargins.filter(value => value > 0.01).length + pairMargins.filter(value => Math.abs(value) <= 0.01).length * 0.5) / pairMargins.length * 100),
    });
  }

  const rankings = templates.map(template => summarize(template, outcomes.get(template.id), coverages.get(template.id), unsupported.get(template.id)))
    .sort((a, b) => b.robustScore - a.robustScore || b.winRate - a.winRate || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const top = rankings.slice(0, TOP_MATRIX_SIZE);
  const matrix = top.map(row => ({
    id: row.templateId,
    name: row.name,
    cells: top.map(column => {
      if (row.templateId === column.templateId) return null;
      const pair = versus.get(pairKey(row.templateId, column.templateId));
      if (!pair) return null;
      return pair.left === row.templateId ? pair.leftWinRate : round(100 - pair.leftWinRate);
    }),
  }));
  return {
    generated: new Date().toISOString(),
    engine: {
      name: "JCC event twin v1",
      seed: BASE_SEED,
      stepSeconds: 0.1,
      maxBattleSeconds: 35,
      seedsPerSide: SEEDS_PER_SIDE,
      scoreFormula: "100*(0.55*winRate + 0.25*normalizedMeanMargin + 0.20*normalizedCVaR10)",
      officialInputsOnly: true,
    },
    templateCount: templates.length,
    matchupCount: schedule(templates).length,
    totalBattles,
    sideBias: round((leftWins - rightWins) / Math.max(1, leftWins + rightWins) * 100, 2),
    averageCoverage: round(rankings.reduce((sum, row) => sum + row.coverage, 0) / Math.max(1, rankings.length)),
    rankings,
    matrix: { labels: top.map(row => row.name), rows: matrix },
    limitations: [
      "技能文本采用结构化解析；无法解析的特殊机制进入unsupported并降低覆盖率",
      "当前版本模拟战斗回合，不模拟整局玩家运营和八人血量淘汰",
      "站位由角色生成并进行左右换边，尚未做逐对手站位搜索",
    ],
  };
}

function report(result) {
  const lines = [
    "# 虚拟实战数字孪生 v1",
    "",
    `生成时间：${result.generated}`,
    `阵容：${result.templateCount}；对位：${result.matchupCount}；成对战斗：${result.totalBattles}；左右偏差：${result.sideBias}%`,
    `平均机制覆盖率：${result.averageCoverage}%`,
    "",
    "## 稳健排名",
    "",
    "| 排名 | 阵容 | 虚拟胜率 | 均值血量差 | CVaR10 | 稳健分 | 覆盖率 |",
    "|---:|---|---:|---:|---:|---:|---:|",
    ...result.rankings.map((row, index) => `| ${index + 1} | ${row.name} | ${row.winRate}% | ${row.meanMargin} | ${row.cvar10} | ${row.robustScore} | ${row.coverage}% |`),
    "",
    "## 公式",
    "",
    `\`${result.engine.scoreFormula}\``,
    "",
    "每个对位使用同一个随机种子交换左右方重跑，消除先手与站位方向偏差。CVaR10 是最差10%虚拟战斗的平均血量差。",
    "",
    "## 边界",
    "",
    ...result.limitations.map(value => `- ${value}`),
    "",
  ];
  return lines.join("\n");
}

function attachToMatcher(stage2, result) {
  const byId = new Map(result.rankings.map(row => [row.templateId, {
    templateId: row.templateId,
    battles: row.battles,
    winRate: row.winRate,
    meanMargin: row.meanMargin,
    interval90: row.interval90,
    cvar10: row.cvar10,
    robustScore: row.robustScore,
    coverage: row.coverage,
    unsupported: row.unsupported,
  }]));
  stage2.templates.forEach(template => { template.virtualBattle = byId.get(template.id) || null; });
  stage2.virtualBattle = {
    generated: result.generated,
    totalBattles: result.totalBattles,
    averageCoverage: result.averageCoverage,
    engine: result.engine,
  };
  return stage2;
}

function assertResult(result) {
  if (result.totalBattles < 1000) throw new Error("虚拟实战样本不足1000场");
  if (result.rankings.length !== result.templateCount) throw new Error("每条路线都必须进入虚拟实战");
  if (result.averageCoverage < 60) throw new Error("平均机制覆盖率低于60%");
  if (Math.abs(result.sideBias) > 8) throw new Error("左右方偏差过大");
  if (result.rankings.some(row => !Number.isFinite(row.robustScore) || !Number.isFinite(row.cvar10))) throw new Error("虚拟实战结果出现非有限数");
  for (let index = 1; index < result.rankings.length; index++) {
    if (result.rankings[index - 1].robustScore < result.rankings[index].robustScore) throw new Error("虚拟实战排序非单调");
  }
}

function main() {
  const stage2 = JSON.parse(fs.readFileSync(resultPath("stage2_matcher_results.json"), "utf8"));
  const templates = (stage2.templates || []).filter(template => template.routeProfile && template.routeProfile.mainCarry);
  const result = simulateTournament(templates);
  assertResult(result);
  attachToMatcher(stage2, result);
  ensureOutputDirs();
  fs.writeFileSync(resultPath("virtual_battle_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(reportPath("虚拟实战数字孪生.md"), report(result));
  fs.writeFileSync(publicPath("virtual-battle-data.js"), `window.VIRTUAL_BATTLE=${JSON.stringify(result)};`);
  fs.writeFileSync(resultPath("stage2_matcher_results.json"), JSON.stringify(stage2, null, 1));
  fs.writeFileSync(publicPath("stage2-matcher-data.js"), `window.STAGE2_MATCHER=${JSON.stringify(stage2)};`);
  console.log(`虚拟实战完成：${result.templateCount}阵容 ${result.matchupCount}对位 ${result.totalBattles}场，覆盖率${result.averageCoverage}%`);
  console.table(result.rankings.slice(0, 10).map((row, index) => ({ rank: index + 1, name: row.name, winRate: row.winRate, cvar10: row.cvar10, robust: row.robustScore, coverage: row.coverage })));
}

module.exports = { battleBoard, simulateTournament, attachToMatcher, assertResult };
if (require.main === module) main();
