"use strict";

// 比赛模式纵向验收：把每条路线展开为连续等级状态，检查前瞻、转型、确定性与动作可执行性。
// 这里不训练也不修改推荐分；它只把 matcher-core 当作待测策略，输出可复现的失败样本。
const fs = require("fs");
const MatcherCore = require("../../public/matcher-core.js");
const { resultPath, reportPath, ensureOutputDirs } = require("../lib/project-paths");

require("../../public/odds-data.js");
const oddsData = globalThis.JCC_ODDS;

const CHECKPOINTS = Object.freeze([
  { level: 3, stage: "2-5", gold: 10, health: 95, itemCount: 1 },
  { level: 5, stage: "3-2", gold: 30, health: 80, itemCount: 2 },
  { level: 6, stage: "3-5", gold: 25, health: 70, itemCount: 1, completed: true },
  { level: 7, stage: "4-1", gold: 20, health: 60, itemCount: 1, completed: true },
  { level: 8, stage: "4-5", gold: 30, health: 45, itemCount: 2, completed: true },
  { level: 9, stage: "5-5", gold: 40, health: 35, itemCount: 3, completed: true },
]);

const MAX_EXECUTION_CHANGES = 3;
const MAX_ACTIONS = 3;
const ROBUST_TERMINAL_FLOOR = 60;
const MIN_CERTIFIED_UPGRADE = 8;

function uniq(rows) {
  return [...new Set((rows || []).filter(Boolean))];
}

function routeId(row) {
  return row && row.template && (row.template.id || row.template.name) || "";
}

function stageKey(level) {
  return level <= 5 ? "1-5" : level <= 7 ? "6-7" : "8-9";
}

function stageFor(template, level) {
  const key = stageKey(level);
  return ((template.routeProfile && template.routeProfile.stages) || []).find(stage => stage.key === key) || null;
}

function itemSignals(template, stage, checkpoint) {
  const assignments = (stage && stage.itemAssignments || []).filter(row => row && row.name);
  const mainCarry = stage && stage.roles && (stage.roles.executionCarry || stage.roles.itemHolder)
    || template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name
    || "";
  if (checkpoint.completed) {
    const preferred = assignments.filter(row => !mainCarry || row.holder === mainCarry);
    return (preferred.length ? preferred : assignments).slice(0, checkpoint.itemCount).map(row => ({
      kind: "items",
      value: row.name,
      holder: row.holder || mainCarry,
      equipped: true,
    }));
  }
  const components = uniq([
    ...assignments.flatMap(row => row.components || []),
    ...((template.routeProfile && template.routeProfile.items) || []).flatMap(row => row.components || []),
    ...(template.componentPrefs || []),
  ]);
  return components.slice(0, checkpoint.itemCount).map(value => ({ kind: "items", value }));
}

function unitSignals(stage, checkpoint) {
  const executionCarry = stage && stage.roles && (stage.roles.executionCarry || stage.roles.strategicCarry);
  const frontline = stage && stage.roles && stage.roles.frontlineAnchor;
  const units = (stage && stage.units || []).slice().sort((a, b) => {
    const priority = unit => unit.name === executionCarry ? 0 : unit.name === frontline ? 1 : unit.role === "frontline" ? 2 : 3;
    return priority(a) - priority(b);
  }).slice(0, checkpoint.level);
  return units.map((unit, index) => {
    const target = Number(unit.starTarget) || 2;
    const star = checkpoint.level >= 8 && target >= 3 ? 3 : index < Math.min(3, units.length) ? 2 : 1;
    return { kind: "units", value: unit.name, star, location: "board" };
  });
}

function trajectorySignals(template, checkpoint) {
  const stage = stageFor(template, checkpoint.level);
  const signals = [
    { kind: "levels", level: checkpoint.level },
    { kind: "stage", value: checkpoint.stage },
    { kind: "gold", value: checkpoint.gold },
    { kind: "health", value: checkpoint.health },
    ...unitSignals(stage, checkpoint),
    ...itemSignals(template, stage, checkpoint),
  ];
  if (checkpoint.level >= 5 && template.mechanic && template.mechanic.requiredAugment) {
    signals.push({ kind: "augments", value: template.mechanic.requiredAugment });
  }
  return signals;
}

function selectedFor(signals, template) {
  const selected = MatcherCore.selectedFromSignals(signals);
  if (template.mechanic && template.mechanic.requiredAugment) selected.heroAugmentRound = "3-2";
  return selected;
}

function decisionFingerprint(rows) {
  const d = rows.decision || {};
  return [d.currentId, d.strategicId, d.committedId, d.executionId, d.status,
    d.forecast && d.forecast.targetId, d.forecast && d.forecast.warning && d.forecast.warning.severity,
    d.forecast && d.forecast.action].join("|");
}

function unavailableNamesInAction(action, level, unitPrices) {
  const odds = oddsData.shopOdds[level] || [];
  const demandsNow = /立即留|适合现在追|现在追|开始找/.test(String(action || ""))
    && !/先升|级前不找|再找|后再转/.test(String(action || ""));
  if (!demandsNow) return [];
  return Object.entries(unitPrices).filter(([name, cost]) => Number(odds[Number(cost) - 1] || 0) === 0
    && String(action || "").includes(name)).map(([name]) => name);
}

function evaluateCheckpoint(stage2, template, checkpoint, opts) {
  const signals = trajectorySignals(template, checkpoint);
  const selected = selectedFor(signals, template);
  const reversed = selectedFor(signals.slice().reverse(), template);
  const ranked = MatcherCore.rank(stage2.templates, selected, stage2.weights, 12, opts);
  const reranked = MatcherCore.rank(stage2.templates, reversed, stage2.weights, 12, opts);
  const operational = MatcherCore.operationalRow(ranked);
  const actions = operational ? MatcherCore.actionLines(operational.template, selected, operational).slice(0, MAX_ACTIONS) : [];
  const text = JSON.stringify({ ranked: ranked.map(row => ({ id: routeId(row), finalScore: row.finalScore })), decision: ranked.decision, actions });
  const impossible = uniq(actions.flatMap(action => unavailableNamesInAction(action, checkpoint.level, opts.unitPrices)));
  return {
    level: checkpoint.level,
    stage: checkpoint.stage,
    currentId: ranked.decision && ranked.decision.currentId || "",
    strategicId: ranked.decision && ranked.decision.strategicId || "",
    committedId: ranked.decision && ranked.decision.committedId || "",
    executionId: ranked.decision && ranked.decision.executionId || "",
    status: ranked.decision && ranked.decision.status || "",
    deterministic: decisionFingerprint(ranked) === decisionFingerprint(reranked),
    warning: ranked.decision && ranked.decision.forecast && ranked.decision.forecast.warning || null,
    targetId: ranked.decision && ranked.decision.forecast && ranked.decision.forecast.targetId || "",
    actions,
    impossibleTargets: impossible,
    finite: !/Infinity|NaN|999/.test(text),
    top3: ranked.slice(0, 3).map(row => ({ id: routeId(row), name: row.template.name, score: row.finalScore })),
  };
}

function oscillations(ids) {
  let count = 0;
  for (let i = 2; i < ids.length; i++) if (ids[i] === ids[i - 2] && ids[i] !== ids[i - 1]) count++;
  return count;
}

function routeFamily(stage2, id) {
  const template = stage2.templates.find(row => row.id === id);
  return template && (template.family || template.routeProfile && template.routeProfile.family) || id;
}

function lateStressScore(stage2, id) {
  const template = stage2.templates.find(row => row.id === id);
  const metric = template && template.forwardPlan && template.forwardPlan.stages && template.forwardPlan.stages["8-9"];
  return Number(metric && (metric.stressAdjustedScore ?? metric.calibratedScore)) || 0;
}

function auditTrajectory(stage2, template, opts) {
  const checkpoints = CHECKPOINTS.map(checkpoint => evaluateCheckpoint(stage2, template, checkpoint, opts));
  const executions = checkpoints.map(row => row.executionId);
  const executionFamilies = executions.map(id => routeFamily(stage2, id));
  const changes = executionFamilies.slice(1).filter((id, index) => id !== executionFamilies[index]).length;
  const firstRisk = checkpoints.find(row => row.warning && row.warning.risky);
  const falseCeiling = Boolean(template.forwardPlan && template.forwardPlan.falseCeiling);
  const earlyDecision = checkpoints.find(row => row.level === 5) || checkpoints.find(row => row.level <= 6) || checkpoints[0];
  const executionLateScore = lateStressScore(stage2, earlyDecision.executionId);
  const targetLateScore = lateStressScore(stage2, earlyDecision.targetId);
  const certifiedUpgrade = targetLateScore >= executionLateScore + MIN_CERTIFIED_UPGRADE;
  const alreadyRobust = executionLateScore >= ROBUST_TERMINAL_FLOOR;
  const failures = [];
  if (checkpoints.some(row => !row.deterministic)) failures.push("输入顺序改变执行结论");
  if (checkpoints.filter(row => row.level <= 3).some(row => row.committedId)) failures.push("1-3级提前定线");
  if (checkpoints.some(row => !row.finite)) failures.push("界面出现无穷/哨兵数值");
  if (checkpoints.some(row => row.impossibleTargets.length)) failures.push("动作要求D当前等级零概率棋子");
  if (changes > MAX_EXECUTION_CHANGES) failures.push(`执行路线变动${changes}次`);
  if (oscillations(executionFamilies)) failures.push("执行体系往返振荡");
  if (falseCeiling && (!firstRisk || firstRisk.level > 6)) failures.push("低上限路线预警过晚");
  if (falseCeiling && !certifiedUpgrade && !alreadyRobust) failures.push("前瞻目标没有形成可验证的上限提升");
  return {
    templateId: template.id,
    name: template.name,
    mechanic: template.mechanic && template.mechanic.requiredAugment || "",
    falseCeiling,
    executionChanges: changes,
    oscillations: oscillations(executionFamilies),
    executionFamilies,
    firstRiskLevel: firstRisk && firstRisk.level || null,
    foresight: {
      checkpointLevel: earlyDecision.level,
      executionId: earlyDecision.executionId,
      targetId: earlyDecision.targetId,
      executionLateScore,
      targetLateScore,
      gain: Math.round((targetLateScore - executionLateScore) * 10) / 10,
      certifiedUpgrade,
      alreadyRobust,
    },
    failures,
    checkpoints,
  };
}

function report(result) {
  const lines = [
    "# 比赛模式纵向可玩性验收",
    "",
    `- 路线：${result.routeCount} 条`,
    `- 状态：${result.checkpointCount} 个`,
    `- 确定性：${result.metrics.determinismRate}%`,
    `- 低级误锁：${result.metrics.earlyCommitFailures} 个`,
    `- 零概率动作：${result.metrics.impossibleActionFailures} 个`,
    `- 高抖动路线：${result.metrics.highChurnRoutes} 条`,
    `- 低上限迟报：${result.metrics.lateWarningRoutes} 条`,
    `- 低上限前瞻有效覆盖：${result.metrics.foresightCoverage}%`,
    "",
    "## 失败样本",
    "",
    "| 路线 | 问题 | 执行链 |",
    "|---|---|---|",
    ...result.findings.failures.slice(0, 30).map(row => `| ${row.name} | ${row.failures.join("；")} | ${row.checkpoints.map(cp => `L${cp.level}:${cp.executionId}`).join(" → ")} |`),
    "",
    "## 结论",
    "",
    "该报告验证的是比赛过程中连续决策是否可玩，不把任何单一路线当作系统正确性的代理。",
  ];
  return lines.join("\n");
}

function main() {
  const stage2 = JSON.parse(fs.readFileSync(resultPath("stage2_matcher_results.json"), "utf8"));
  const unitRows = stage2.options && stage2.options.unitSearch || [];
  const unitPrices = Object.fromEntries(unitRows.map(row => [row.name, row.price]));
  const unitTraits = Object.fromEntries(unitRows.map(row => [row.name, row.traits || []]));
  const opts = {
    oddsData,
    unitPrices,
    unitTraits,
    heroAugments: stage2.options && stage2.options.heroAugments || [],
    antiFragile: true,
    operationalCommitment: true,
  };
  const routes = stage2.templates.map(template => auditTrajectory(stage2, template, opts));
  const checkpoints = routes.flatMap(route => route.checkpoints);
  const failures = routes.filter(route => route.failures.length);
  const result = {
    generated: new Date().toISOString(),
    routeCount: routes.length,
    checkpointCount: checkpoints.length,
    checkpoints: CHECKPOINTS,
    metrics: {
      determinismRate: Math.round(checkpoints.filter(row => row.deterministic).length / Math.max(1, checkpoints.length) * 10000) / 100,
      earlyCommitFailures: checkpoints.filter(row => row.level <= 3 && row.committedId).length,
      impossibleActionFailures: checkpoints.filter(row => row.impossibleTargets.length).length,
      finiteFailures: checkpoints.filter(row => !row.finite).length,
      highChurnRoutes: routes.filter(row => row.executionChanges > MAX_EXECUTION_CHANGES || row.oscillations).length,
      lateWarningRoutes: routes.filter(row => row.falseCeiling && (!row.firstRiskLevel || row.firstRiskLevel > 6)).length,
      falseCeilingRoutes: routes.filter(row => row.falseCeiling).length,
      foresightCoverage: 0,
      failingRoutes: failures.length,
    },
    routes,
    findings: { failures },
  };
  const falseCeilingRoutes = routes.filter(row => row.falseCeiling);
  result.metrics.foresightCoverage = Math.round(falseCeilingRoutes.filter(row => row.foresight.certifiedUpgrade || row.foresight.alreadyRobust).length
    / Math.max(1, falseCeilingRoutes.length) * 10000) / 100;
  if (result.metrics.determinismRate !== 100) throw new Error("纵向验收失败：同一状态未得到同一执行结论");
  if (result.metrics.earlyCommitFailures) throw new Error("纵向验收失败：1-3级出现路线承诺");
  if (result.metrics.finiteFailures) throw new Error("纵向验收失败：UI数据出现999/Infinity/NaN");
  ensureOutputDirs();
  fs.writeFileSync(resultPath("match_playability_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(reportPath("比赛模式纵向可玩性验收.md"), report(result));
  console.log(`纵向可玩性验收：${result.routeCount}条路线，${result.checkpointCount}个状态，失败路线${failures.length}条`);
  console.table(result.metrics);
  console.table(failures.slice(0, 15).map(row => ({ route: row.name, failures: row.failures.join("；"), chain: row.checkpoints.map(cp => `L${cp.level}:${cp.executionId}`).join(" -> ") })));
}

module.exports = { CHECKPOINTS, trajectorySignals, auditTrajectory };
if (require.main === module) main();
