"use strict";

// 滚动前瞻实验：同一条路线分别在前/中/后期做成对战斗，再构建跨路线转移图。
// 输出只提供确定性先验；比赛模式仍用当前手牌、金币、血量实时求动作，不读取网络数据。
const fs = require("fs");
const { simulateBattle, heroByName } = require("../sim/combat-engine.js");
const { resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

const BASE_SEED = 20260718;
const SEEDS_PER_PAIR = 2;
const MAX_BATTLE_SECONDS = 25;
const STAGES = [
  { key: "1-5", label: "前期", next: "6-7" },
  { key: "6-7", label: "中期", next: "8-9" },
  { key: "8-9", label: "后期", next: null },
];
const COMBAT_WEIGHTS = Object.freeze({ winRate: 0.5, meanMargin: 0.3, cvar10: 0.2 });
const TRANSITION_WEIGHTS = Object.freeze({ units: 0.5, components: 0.25, traits: 0.15, direction: 0.1 });
const TOP_PIVOTS = 5;

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

function uniq(rows) {
  return [...new Set((rows || []).filter(Boolean))];
}

function jaccard(left, right) {
  const a = new Set(left || []), b = new Set(right || []);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter(value => b.has(value)).length / union.size;
}

function routeStage(template, key) {
  return ((template.routeProfile && template.routeProfile.stages) || []).find(stage => stage.key === key) || null;
}

function stageBoard(template, key, options = {}) {
  const stage = routeStage(template, key);
  if (!stage) return [];
  const boardByName = new Map((stage.board || []).map(unit => [unit.name, unit]));
  const assignmentByHolder = new Map();
  (stage.itemAssignments || []).forEach(item => {
    if (!assignmentByHolder.has(item.holder)) assignmentByHolder.set(item.holder, []);
    assignmentByHolder.get(item.holder).push(item);
  });
  const executionCarry = stage.roles && stage.roles.executionCarry
    || stage.carry && stage.carry.execution
    || template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name;
  const mechanicTargets = new Set(template.mechanic && (
    template.mechanic.targetUnits && template.mechanic.targetUnits.length
      ? template.mechanic.targetUnits
      : (template.mechanic.requiredUnits || []).slice(0, 1)
  ) || []);
  return (stage.units || []).map(unit => {
    const board = boardByName.get(unit.name) || {};
    const hero = heroByName[unit.name] || {};
    const items = (assignmentByHolder.get(unit.name) || [])
      .sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0))
      .map(item => item.name)
      .slice(0, 3);
    const isCarry = unit.name === executionCarry;
    const terminalStar = clamp(Number(unit.starTarget) || (isCarry && Number(hero.price) <= 3 ? 3 : 2), 1, 3);
    // 前期不把终局追三当作已经完成；中期仅允许低费主C进入追三完成态。
    const star = key === "1-5"
      ? Math.min(2, terminalStar)
      : key === "6-7" && Number(hero.price) >= 3
        ? Math.min(2, terminalStar)
        : terminalStar;
    return {
      name: unit.name,
      role: isCarry ? "mainCarry" : unit.role || (Number(board.row) <= 2 ? "frontline" : "utility"),
      star,
      items,
      traits: unit.traits || [],
      // 英雄强化属于指定棋子，不等于路线战略主C。条件前排与输出位
      // 分离时，机制必须留在强化英雄身上。
      mechanic: options.includeMechanic === false || !mechanicTargets.has(unit.name)
        ? null
        : template.mechanic || null,
    };
  }).filter(unit => heroByName[unit.name]);
}

function schedule(templates) {
  const pairs = [];
  for (let left = 0; left < templates.length; left++) {
    for (let right = left + 1; right < templates.length; right++) pairs.push([templates[left], templates[right]]);
  }
  return pairs;
}

function summarizeStage(template, outcomes, coverage, unsupported, battleCount) {
  const wins = outcomes.filter(value => value > 0.01).length;
  const draws = outcomes.filter(value => Math.abs(value) <= 0.01).length;
  const winRate = (wins + draws * 0.5) / Math.max(1, outcomes.length) * 100;
  const meanMargin = outcomes.reduce((sum, value) => sum + value, 0) / Math.max(1, outcomes.length);
  const cvar10 = lowerCvar(outcomes);
  const rawScore = 100 * (
    COMBAT_WEIGHTS.winRate * winRate / 100
    + COMBAT_WEIGHTS.meanMargin * (meanMargin + 1) / 2
    + COMBAT_WEIGHTS.cvar10 * (cvar10 + 1) / 2
  );
  const coverageRate = coverage.reduce((sum, value) => sum + value, 0) / Math.max(1, coverage.length);
  // 未覆盖机制向50分收缩，防止未知技能被当成确定优势。
  const calibrated = 50 + (clamp(rawScore, 0, 100) - 50) * coverageRate;
  return {
    templateId: template.id,
    templateName: template.name,
    board: stageBoard(template, battleCount.stageKey).map(unit => ({ name: unit.name, star: unit.star, items: unit.items, role: unit.role })),
    battles: outcomes.length,
    winRate: round(winRate),
    meanMargin: round(meanMargin, 3),
    cvar10: round(cvar10, 3),
    interval90: [round(quantile(outcomes, 0.05), 3), round(quantile(outcomes, 0.95), 3)],
    rawScore: round(clamp(rawScore, 0, 100)),
    calibratedScore: round(clamp(calibrated, 0, 100)),
    coverage: round(coverageRate * 100),
    unsupported: [...unsupported].sort().slice(0, 12),
  };
}

function simulateStage(templates, stageKey) {
  const boards = new Map(templates.map(template => [template.id, stageBoard(template, stageKey)]));
  const outcomes = new Map(templates.map(template => [template.id, []]));
  const coverages = new Map(templates.map(template => [template.id, []]));
  const unsupported = new Map(templates.map(template => [template.id, new Set()]));
  const versus = [];
  let battles = 0;
  for (const [leftTemplate, rightTemplate] of schedule(templates)) {
    const leftBoard = boards.get(leftTemplate.id), rightBoard = boards.get(rightTemplate.id);
    if (!leftBoard.length || !rightBoard.length) continue;
    const margins = [];
    for (let sample = 0; sample < SEEDS_PER_PAIR; sample++) {
      const seed = (BASE_SEED ^ hash(stageKey) ^ hash(leftTemplate.id) ^ Math.imul(hash(rightTemplate.id), 31) ^ Math.imul(sample + 1, 2654435761)) >>> 0;
      const direct = simulateBattle(leftBoard, rightBoard, { seed, maxSeconds: MAX_BATTLE_SECONDS });
      const swapped = simulateBattle(rightBoard, leftBoard, { seed, maxSeconds: MAX_BATTLE_SECONDS });
      const pair = [direct.margin, -swapped.margin];
      outcomes.get(leftTemplate.id).push(...pair);
      outcomes.get(rightTemplate.id).push(...pair.map(value => -value));
      coverages.get(leftTemplate.id).push(direct.leftCoverage, swapped.rightCoverage);
      coverages.get(rightTemplate.id).push(direct.rightCoverage, swapped.leftCoverage);
      direct.leftUnsupported.forEach(value => unsupported.get(leftTemplate.id).add(value));
      swapped.rightUnsupported.forEach(value => unsupported.get(leftTemplate.id).add(value));
      direct.rightUnsupported.forEach(value => unsupported.get(rightTemplate.id).add(value));
      swapped.leftUnsupported.forEach(value => unsupported.get(rightTemplate.id).add(value));
      margins.push(...pair);
      battles += 2;
    }
    versus.push({
      left: leftTemplate.id,
      right: rightTemplate.id,
      leftWinRate: round((margins.filter(value => value > 0.01).length + margins.filter(value => Math.abs(value) <= 0.01).length * 0.5) / margins.length * 100),
    });
  }
  const rankings = templates.map(template => summarizeStage(template, outcomes.get(template.id), coverages.get(template.id), unsupported.get(template.id), { stageKey }))
    .sort((a, b) => b.calibratedScore - a.calibratedScore || b.winRate - a.winRate || a.templateName.localeCompare(b.templateName, "zh-Hans-CN"));
  rankings.forEach((row, index) => {
    row.rank = index + 1;
    row.percentile = round(100 * (1 - index / Math.max(1, rankings.length - 1)));
  });
  return { stageKey, battles, rankings, versus };
}

function routeItems(template) {
  const profile = template.routeProfile || {};
  return (profile.itemAssignments || profile.items || []).flatMap(item => item.components || []);
}

function routeTraits(template) {
  return ((template.routeProfile && template.routeProfile.activeTraits) || []).map(row => row.name || row.label).filter(Boolean);
}

function routeDirection(template) {
  const items = ((template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.items) || []).join("|");
  const physical = (items.match(/鬼索|火炮|轻语|无尽|锐利|泰坦|飓风|汲取/g) || []).length;
  const magic = (items.match(/蓝霸|珠光|帽|电刃|朔极|离子/g) || []).length;
  return physical > magic ? "physical" : magic > physical ? "magic" : "mixed";
}

function transitionCompatibility(from, to, fromStageKey, toStageKey) {
  const fromUnits = stageBoard(from, fromStageKey).map(unit => unit.name);
  const toUnits = stageBoard(to, toStageKey).map(unit => unit.name);
  const unitOverlap = jaccard(fromUnits, toUnits);
  const itemOverlap = jaccard(routeItems(from), routeItems(to));
  const traitOverlap = jaccard(routeTraits(from), routeTraits(to));
  const direction = routeDirection(from) === routeDirection(to) ? 1 : routeDirection(from) === "mixed" || routeDirection(to) === "mixed" ? 0.5 : 0;
  const compatibility = TRANSITION_WEIGHTS.units * unitOverlap
    + TRANSITION_WEIGHTS.components * itemOverlap
    + TRANSITION_WEIGHTS.traits * traitOverlap
    + TRANSITION_WEIGHTS.direction * direction;
  return {
    compatibility: round(compatibility, 3),
    transitionCost: round((1 - compatibility) * 100),
    unitOverlap: round(unitOverlap, 3),
    itemOverlap: round(itemOverlap, 3),
    traitOverlap: round(traitOverlap, 3),
  };
}

function mainCarryInfo(template) {
  const main = template.routeProfile && template.routeProfile.mainCarry || {};
  const hero = heroByName[main.name] || {};
  const cost = Number(hero.price) || 3;
  const starTarget = Number(main.starTarget) || (cost <= 3 ? 3 : 2);
  const deadline = starTarget >= 3
    ? ({ 1: "3-1", 2: "3-5", 3: "4-1" }[cost] || "4-2")
    : ({ 4: "4-2", 5: "5-1" }[cost] || "4-1");
  return { name: main.name || "主C", cost, starTarget, deadline };
}

function compactStageMetric(metric) {
  return {
    rank: metric.rank,
    percentile: metric.percentile,
    battles: metric.battles,
    winRate: metric.winRate,
    meanMargin: metric.meanMargin,
    cvar10: metric.cvar10,
    interval90: metric.interval90,
    calibratedScore: metric.calibratedScore,
    coverage: metric.coverage,
    unsupported: metric.unsupported,
  };
}

function buildProfiles(templates, stageResults) {
  const metricByStage = Object.fromEntries(STAGES.map(stage => [stage.key, new Map(stageResults[stage.key].rankings.map(row => [row.templateId, row]))]));
  return templates.map(template => {
    const metrics = Object.fromEntries(STAGES.map(stage => [stage.key, metricByStage[stage.key].get(template.id)]));
    const early = metrics["1-5"], mid = metrics["6-7"], late = metrics["8-9"];
    const falseCeiling = Boolean(
      (early.percentile >= 65 && late.percentile <= 45)
      || early.calibratedScore >= late.calibratedScore + 12
    );
    const steepDrop = Math.min(mid.calibratedScore - early.calibratedScore, late.calibratedScore - mid.calibratedScore) <= -10;
    const mainCarry = mainCarryInfo(template);
    const pivots = {};
    for (const stage of STAGES.filter(row => row.next)) {
      const targetMetrics = metricByStage[stage.next];
      const sourceAugment = template.mechanic && template.mechanic.requiredAugment || "";
      const rows = templates.filter(target => {
        if (target.id === template.id) return false;
        const targetAugment = target.mechanic && target.mechanic.requiredAugment || "";
        return !targetAugment || targetAugment === sourceAugment;
      }).map(target => {
        const transition = transitionCompatibility(template, target, stage.key, stage.next);
        const targetMetric = targetMetrics.get(target.id);
        const targetLate = metricByStage["8-9"].get(target.id);
        const optionValue = targetMetric.calibratedScore * 0.55 + targetLate.calibratedScore * 0.45 - transition.transitionCost * 0.28;
        return {
          targetId: target.id,
          targetName: target.name,
          targetCarry: mainCarryInfo(target).name,
          requiredAugment: target.mechanic && target.mechanic.requiredAugment || "",
          ...transition,
          targetStageScore: targetMetric.calibratedScore,
          targetLateScore: targetLate.calibratedScore,
          optionValue: round(optionValue),
        };
      }).sort((a, b) => b.optionValue - a.optionValue || b.compatibility - a.compatibility || a.targetName.localeCompare(b.targetName, "zh-Hans-CN"));
      const seenCarry = new Set();
      pivots[stage.key] = rows.filter(row => {
        if (seenCarry.has(row.targetCarry)) return false;
        seenCarry.add(row.targetCarry);
        return true;
      }).slice(0, TOP_PIVOTS);
    }
    return {
      templateId: template.id,
      templateName: template.name,
      mainCarry,
      stages: Object.fromEntries(STAGES.map(stage => [stage.key, compactStageMetric(metrics[stage.key])])),
      earlyToMid: round(mid.calibratedScore - early.calibratedScore),
      midToLate: round(late.calibratedScore - mid.calibratedScore),
      falseCeiling,
      steepDrop,
      warningStage: falseCeiling ? "3-5" : steepDrop ? "4-1" : mainCarry.deadline,
      pivots,
    };
  });
}

function report(result) {
  const lines = [
    "# 比赛模式滚动前瞻实验", "",
    `版本：${result.version}`, "",
    `路线：${result.templateCount}；阶段战斗：${result.totalBattles}；每个对位双向×${SEEDS_PER_PAIR}种子。`, "",
    "## 决策公式", "",
    "`Q(a|s)=即时战力+γ×下一阶段战力+γ²×终局上限-转型成本-尾部风险+选择权价值`", "",
    "战斗分对未覆盖机制按覆盖率向50分收缩；转型成本由棋子、散件、羁绊和输出方向重合率共同决定。", "",
  ];
  for (const stage of STAGES) {
    lines.push(`## ${stage.label}虚拟战斗 Top12`, "", "| 排名 | 路线 | 校准分 | 胜率 | CVaR10 | 覆盖率 |", "|---:|---|---:|---:|---:|---:|",
      ...result.stageResults[stage.key].rankings.slice(0, 12).map(row => `| ${row.rank} | ${row.templateName} | ${row.calibratedScore} | ${row.winRate}% | ${row.cvar10} | ${row.coverage}% |`), "");
  }
  lines.push("## 高开低走预警", "", "| 路线 | 前期分/百分位 | 中期分 | 后期分/百分位 | 预警回合 |", "|---|---:|---:|---:|---|",
    ...result.findings.falseCeilings.slice(0, 20).map(row => `| ${row.templateName} | ${row.stages["1-5"].calibratedScore}/${row.stages["1-5"].percentile}% | ${row.stages["6-7"].calibratedScore} | ${row.stages["8-9"].calibratedScore}/${row.stages["8-9"].percentile}% | ${row.warningStage} |`), "",
    "## 模型边界", "",
    ...result.limitations.map(value => `- ${value}`), "");
  return lines.join("\n");
}

function assertResult(result) {
  if (result.templateCount < 60) throw new Error("前瞻实验路线覆盖不足60条");
  if (result.totalBattles < 20000) throw new Error("前瞻实验阶段战斗不足20000场");
  for (const stage of STAGES) {
    const rows = result.stageResults[stage.key].rankings;
    if (rows.length !== result.templateCount) throw new Error(`${stage.label}路线未全量参赛`);
    if (rows.some(row => !Number.isFinite(row.calibratedScore) || !Number.isFinite(row.cvar10))) throw new Error(`${stage.label}出现非法数值`);
    if (rows.some(row => row.coverage < 0 || row.coverage > 100)) throw new Error(`${stage.label}覆盖率越界`);
  }
  if (!result.profiles.some(profile => profile.falseCeiling)) throw new Error("未识别出任何高开低走路线，阶段模型失效");
  if (result.profiles.some(profile => STAGES.some(stage => !profile.stages[stage.key]))) throw new Error("路线缺阶段战斗指标");
  if (result.profiles.some(profile => Object.values(profile.pivots).some(rows => rows.some(row => !Number.isFinite(row.transitionCost))))) throw new Error("转型图出现非法成本");
}

function main() {
  const stage2 = JSON.parse(fs.readFileSync(resultPath("stage2_matcher_results.json"), "utf8"));
  const templates = (stage2.templates || []).filter(template => template.id && STAGES.every(stage => stageBoard(template, stage.key).length));
  const stageResults = Object.fromEntries(STAGES.map(stage => [stage.key, simulateStage(templates, stage.key)]));
  const profiles = buildProfiles(templates, stageResults);
  const profileById = new Map(profiles.map(profile => [profile.templateId, profile]));
  stage2.templates.forEach(template => {
    const plan = profileById.get(template.id) || null;
    template.forwardPlan = plan;
    const late = plan && plan.stages["8-9"];
    template.virtualBattle = late ? {
      templateId: template.id,
      battles: late.battles,
      winRate: late.winRate,
      meanMargin: late.meanMargin,
      interval90: late.interval90,
      cvar10: late.cvar10,
      robustScore: late.calibratedScore,
      coverage: late.coverage,
      unsupported: late.unsupported,
    } : null;
  });
  const falseCeilings = profiles.filter(profile => profile.falseCeiling)
    .sort((a, b) => (b.stages["1-5"].percentile - b.stages["8-9"].percentile) - (a.stages["1-5"].percentile - a.stages["8-9"].percentile));
  const result = {
    version: stage2.version,
    generated: new Date().toISOString(),
    seed: BASE_SEED,
    templateCount: templates.length,
    totalBattles: STAGES.reduce((sum, stage) => sum + stageResults[stage.key].battles, 0),
    methodology: {
      horizon: 2,
      combatFormula: "50%胜率+30%标准化平均血量差+20%最差10%血量差，再按机制覆盖率向50收缩",
      transitionFormula: "50%棋子重合+25%散件重合+15%羁绊重合+10%输出方向一致",
      policyFormula: "Q=即时战力+γ下一阶段+γ²终局-转型成本-CVaR风险+选择权",
      stages: STAGES.map(stage => stage.key),
    },
    stageResults,
    profiles,
    findings: {
      falseCeilings,
      steepDrops: profiles.filter(profile => profile.steepDrop).sort((a, b) => Math.min(a.earlyToMid, a.midToLate) - Math.min(b.earlyToMid, b.midToLate)),
    },
    limitations: [
      "这是自研事件战斗模型，不是真实排位统计；未覆盖机制会自动收缩而不是猜测。",
      "公共牌库竞争和对手持牌尚未进入状态，本轮只计算单玩家资源可达性。",
      "阶段棋盘来自canonical routeProfile；如果模板阶段棋盘错误，前瞻曲线会如实暴露而不会自动修正。",
      "滚动规划每次输入后重新求解，不把上一次推荐当作状态。",
    ],
  };
  assertResult(result);
  stage2.forwardPlanning = {
    generated: result.generated,
    seed: result.seed,
    templateCount: result.templateCount,
    totalBattles: result.totalBattles,
    methodology: result.methodology,
    falseCeilingCount: falseCeilings.length,
  };
  ensureOutputDirs();
  fs.writeFileSync(resultPath("forward_planning_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(publicPath("forward-planning-data.js"), `window.FORWARD_PLANNING=${JSON.stringify(result)};`);
  fs.writeFileSync(resultPath("stage2_matcher_results.json"), JSON.stringify(stage2, null, 1));
  fs.writeFileSync(publicPath("stage2-matcher-data.js"), `window.STAGE2_MATCHER=${JSON.stringify(stage2)};`);
  fs.writeFileSync(reportPath("比赛模式滚动前瞻实验.md"), report(result));
  console.log(`滚动前瞻完成：${result.templateCount}条路线，${result.totalBattles}场阶段战斗，高开低走${falseCeilings.length}条`);
  console.table(falseCeilings.slice(0, 10).map(row => ({
    route: row.templateName,
    early: row.stages["1-5"].calibratedScore,
    mid: row.stages["6-7"].calibratedScore,
    late: row.stages["8-9"].calibratedScore,
    warning: row.warningStage,
  })));
}

module.exports = { stageBoard, simulateStage, transitionCompatibility, buildProfiles, assertResult };
if (require.main === module) main();
