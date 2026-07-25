"use strict";

// 全路线机制压力审计：不依赖排位样本，用同一棋盘在中/后期承受
// 重伤破抗、护盾压力、切后与爆发控制等反事实场景，识别模拟器偏爱。
const fs = require("fs");
const { simulateBattle } = require("../sim/combat-engine.js");
const { stageBoard } = require("./forward-planning-lab.js");
const { resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

const BASE_SEED = 20260719;
const SEEDS = 2;
const OPPONENTS = 8;
const STAGES = ["6-7", "8-9"];
const STRESS_PENALTY_RATIO = 0.65;
const SCENARIOS = Object.freeze([
  { key: "neutral", label: "中性对局", modifiers: {} },
  { key: "anti-sustain", label: "重伤持续压制", modifiers: { woundOnDamage: true, damageAmpPct: 5 } },
  { key: "penetration", label: "双抗击碎", modifiers: { armorShredPct: 0.3, mrShredPct: 0.3 } },
  { key: "shield-break", label: "护盾压力", modifiers: { shieldDamageMultiplier: 1.5 } },
  { key: "backline", label: "后排切入", modifiers: { backlineAccess: true, damageAmpPct: 5 } },
  { key: "burst-control", label: "爆发控制", modifiers: { damageAmpPct: 15, controlDurationMultiplier: 1.35 } },
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function hash(text) {
  let value = 2166136261;
  for (const ch of String(text || "")) {
    value ^= ch.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function lowerCvar(values, alpha = 0.1) {
  const rows = values.slice().sort((a, b) => a - b);
  const count = Math.max(1, Math.ceil(rows.length * alpha));
  return rows.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
}

function score(values) {
  const wins = values.filter(value => value > 0.01).length;
  const draws = values.filter(value => Math.abs(value) <= 0.01).length;
  const winRate = (wins + draws * 0.5) / Math.max(1, values.length) * 100;
  const meanMargin = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const cvar10 = lowerCvar(values);
  const robust = 100 * (0.5 * winRate / 100 + 0.3 * (meanMargin + 1) / 2 + 0.2 * (cvar10 + 1) / 2);
  return { battles: values.length, winRate: round(winRate), meanMargin: round(meanMargin, 3), cvar10: round(cvar10, 3), score: round(clamp(robust, 0, 100)) };
}

function routeDirection(template) {
  const items = ((template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.items) || []).join("|");
  const physical = (items.match(/鬼索|火炮|轻语|无尽|锐利|泰坦|飓风|汲取/g) || []).length;
  const magic = (items.match(/蓝霸|珠光|帽|电刃|朔极|离子|大天使/g) || []).length;
  return physical > magic ? "physical" : magic > physical ? "magic" : "mixed";
}

function metric(template, stageKey) {
  return Number(template.forwardPlan && template.forwardPlan.stages && template.forwardPlan.stages[stageKey]
    && template.forwardPlan.stages[stageKey].calibratedScore) || 50;
}

function representativeOpponents(templates, stageKey) {
  const rows = templates.filter(template => !template.mechanic && stageBoard(template, stageKey).length)
    .sort((a, b) => metric(b, stageKey) - metric(a, stageKey) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const picked = [];
  const keys = new Set();
  for (const template of rows) {
    const key = `${routeDirection(template)}|${template.family || "unknown"}`;
    if (keys.has(key)) continue;
    keys.add(key);
    picked.push(template);
    if (picked.length >= OPPONENTS) return picked;
  }
  for (const template of rows) {
    if (!picked.includes(template)) picked.push(template);
    if (picked.length >= OPPONENTS) break;
  }
  return picked;
}

function pairedMargins(routeBoard, opponentBoard, scenario, identity) {
  const outcomes = [];
  for (let sample = 0; sample < SEEDS; sample += 1) {
    const seed = (BASE_SEED ^ hash(identity) ^ Math.imul(sample + 1, 2654435761)) >>> 0;
    const direct = simulateBattle(routeBoard, opponentBoard, { seed, maxSeconds: 25, rightModifiers: scenario.modifiers });
    const swapped = simulateBattle(opponentBoard, routeBoard, { seed, maxSeconds: 25, leftModifiers: scenario.modifiers });
    outcomes.push(direct.margin, -swapped.margin);
  }
  return outcomes;
}

function evaluateBoard(template, stageKey, opponents, includeMechanic) {
  const board = stageBoard(template, stageKey, { includeMechanic });
  return Object.fromEntries(SCENARIOS.map(scenario => {
    const outcomes = opponents.flatMap(opponent => pairedMargins(
      board,
      stageBoard(opponent, stageKey),
      scenario,
      `${template.id}|${opponent.id}|${stageKey}|${scenario.key}|${includeMechanic}`,
    ));
    return [scenario.key, { label: scenario.label, ...score(outcomes) }];
  }));
}

function auditStage(template, stageKey, opponents) {
  const on = evaluateBoard(template, stageKey, opponents, true);
  const stresses = SCENARIOS.filter(row => row.key !== "neutral").map(row => on[row.key]);
  const stressMean = stresses.reduce((sum, row) => sum + row.score, 0) / stresses.length;
  const worst = SCENARIOS.filter(row => row.key !== "neutral")
    .map(row => ({ key: row.key, label: row.label, ...on[row.key] }))
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, "zh-Hans-CN"))[0];
  const stressComposite = 0.6 * stressMean + 0.4 * worst.score;
  const stressPenalty = Math.max(0, on.neutral.score - stressComposite);
  const original = metric(template, stageKey);
  const stressAdjustedScore = clamp(original - stressPenalty * STRESS_PENALTY_RATIO, 0, 100);
  let mechanicCounterfactual = null;
  if (template.mechanic) {
    const off = evaluateBoard(template, stageKey, opponents, false);
    const offStressMean = SCENARIOS.filter(row => row.key !== "neutral")
      .reduce((sum, row) => sum + off[row.key].score, 0) / (SCENARIOS.length - 1);
    mechanicCounterfactual = {
      targetUnits: template.mechanic.targetUnits || (template.mechanic.requiredUnits || []).slice(0, 1),
      neutralUplift: round(on.neutral.score - off.neutral.score),
      stressUplift: round(stressMean - offStressMean),
      offNeutralScore: off.neutral.score,
    };
  }
  const overfitRisk = stressPenalty >= 15
    || Boolean(mechanicCounterfactual && mechanicCounterfactual.neutralUplift - mechanicCounterfactual.stressUplift >= 10);
  return {
    originalScore: round(original),
    neutral: on.neutral,
    scenarios: on,
    stressMean: round(stressMean),
    stressComposite: round(stressComposite),
    stressPenalty: round(stressPenalty),
    stressAdjustedScore: round(stressAdjustedScore),
    calibrationFactor: round(original > 0 ? stressAdjustedScore / original : 1, 3),
    worstCounter: { key: worst.key, label: worst.label, score: worst.score },
    mechanicCounterfactual,
    overfitRisk,
  };
}

function report(result) {
  const lines = [
    "# 比赛模式机制过拟合审计", "",
    `路线：${result.routeCount}；条件路线：${result.mechanicRouteCount}；虚拟战斗：${result.totalBattles}。`, "",
    "## 压力算子", "",
    ...SCENARIOS.map(row => `- ${row.label}：${JSON.stringify(row.modifiers)}`), "",
    "## 过拟合风险 Top20", "",
    "| 路线 | 阶段 | 原分 | 压力校准 | 惩罚 | 最差反制 | 机制中性/压力增益 |", "|---|---|---:|---:|---:|---|---|",
    ...result.findings.overfit.slice(0, 20).map(row => {
      const cf = row.metric.mechanicCounterfactual;
      return `| ${row.name} | ${row.stage} | ${row.metric.originalScore} | ${row.metric.stressAdjustedScore} | ${row.metric.stressPenalty} | ${row.metric.worstCounter.label} | ${cf ? `${cf.neutralUplift}/${cf.stressUplift}` : "-"} |`;
    }), "",
    "## 金钟罩李青专项", "",
    ...result.findings.leeSin.map(row => `- ${row.name} ${row.stage}：原分${row.metric.originalScore}，压力校准${row.metric.stressAdjustedScore}；最差反制${row.metric.worstCounter.label}；机制目标${(row.metric.mechanicCounterfactual && row.metric.mechanicCounterfactual.targetUnits || []).join("+") || "无"}。`), "",
    "## 结论边界", "",
    "- 压力算子用于测灵敏度，不冒充真实排位胜率。",
    "- 任何路线只能因反制脆弱而降权，不能靠压力实验凭空加分。",
    "- 机制强化与路线主C分离；强化目标由数据契约给出。", "",
  ];
  return lines.join("\n");
}

function assertResult(result, stage2) {
  if (result.routeCount < 60 || result.totalBattles < 20000) throw new Error("机制压力实验覆盖不足");
  const rows = result.routes.flatMap(route => STAGES.map(stage => route.stages[stage]));
  if (rows.some(row => !Number.isFinite(row.stressAdjustedScore) || row.stressAdjustedScore > row.originalScore + 1e-9)) {
    throw new Error("压力校准只能降权且必须为有限数");
  }
  const lee = stage2.templates.find(template => template.id === "official-1589");
  const leeBoard = lee && stageBoard(lee, "8-9");
  const leeUnit = leeBoard && leeBoard.find(unit => unit.name === "李青");
  if (!leeUnit || leeUnit.star !== 3 || !leeUnit.mechanic || leeUnit.mechanic.requiredAugment !== "净化之金钟罩") {
    throw new Error("金钟罩数据契约仍错误：三星/强化目标未落到李青");
  }
  const sona = leeBoard.find(unit => unit.name === "娑娜");
  if (sona && sona.mechanic) throw new Error("强化机制不得错误挂到路线主C娑娜");
}

function main() {
  const stage2 = JSON.parse(fs.readFileSync(resultPath("stage2_matcher_results.json"), "utf8"));
  const templates = (stage2.templates || []).filter(template => STAGES.every(stage => stageBoard(template, stage).length));
  const opponents = Object.fromEntries(STAGES.map(stage => [stage, representativeOpponents(templates, stage)]));
  const routes = templates.map(template => ({
    templateId: template.id,
    name: template.name,
    mechanic: template.mechanic && template.mechanic.requiredAugment || "",
    stages: Object.fromEntries(STAGES.map(stage => [stage, auditStage(template, stage, opponents[stage])])),
  }));
  const totalBattles = routes.reduce((sum, route) => sum + STAGES.reduce((stageSum, stage) => {
    const base = Object.values(route.stages[stage].scenarios).reduce((n, row) => n + row.battles, 0);
    return stageSum + base + (route.mechanic ? base : 0);
  }, 0), 0);
  const flattened = routes.flatMap(route => STAGES.map(stage => ({ ...route, stage, metric: route.stages[stage] })));
  const result = {
    generated: new Date().toISOString(),
    seed: BASE_SEED,
    routeCount: routes.length,
    mechanicRouteCount: routes.filter(route => route.mechanic).length,
    totalBattles,
    scenarios: SCENARIOS,
    routes,
    findings: {
      overfit: flattened.filter(row => row.metric.overfitRisk)
        .sort((a, b) => b.metric.stressPenalty - a.metric.stressPenalty || a.name.localeCompare(b.name, "zh-Hans-CN")),
      leeSin: flattened.filter(row => /李青|金钟罩/.test(row.name)),
    },
  };
  const byId = new Map(routes.map(route => [route.templateId, route]));
  stage2.templates.forEach(template => {
    const audit = byId.get(template.id);
    if (!audit) return;
    template.mechanismAudit = audit;
    STAGES.forEach(stage => {
      if (template.forwardPlan && template.forwardPlan.stages && template.forwardPlan.stages[stage]) {
        Object.assign(template.forwardPlan.stages[stage], {
          stressAdjustedScore: audit.stages[stage].stressAdjustedScore,
          stressPenalty: audit.stages[stage].stressPenalty,
          worstCounter: audit.stages[stage].worstCounter,
        });
      }
    });
    const late = audit.stages["8-9"];
    if (template.virtualBattle) template.virtualBattle.stressRobustScore = late.stressAdjustedScore;
  });
  stage2.mechanismAudit = {
    generated: result.generated,
    totalBattles: result.totalBattles,
    routeCount: result.routeCount,
    overfitCount: result.findings.overfit.length,
  };
  assertResult(result, stage2);
  ensureOutputDirs();
  fs.writeFileSync(resultPath("mechanism_overfit_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(publicPath("mechanism-overfit-data.js"), `window.MECHANISM_OVERFIT=${JSON.stringify(result)};`);
  fs.writeFileSync(reportPath("比赛模式机制过拟合审计.md"), report(result));
  fs.writeFileSync(resultPath("stage2_matcher_results.json"), JSON.stringify(stage2, null, 1));
  fs.writeFileSync(publicPath("stage2-matcher-data.js"), `window.STAGE2_MATCHER=${JSON.stringify(stage2)};`);
  console.log(`机制压力审计完成：${result.routeCount}条路线，${result.totalBattles}场，过拟合风险${result.findings.overfit.length}条`);
  console.table(result.findings.overfit.slice(0, 12).map(row => ({ route: row.name, stage: row.stage, original: row.metric.originalScore, adjusted: row.metric.stressAdjustedScore, penalty: row.metric.stressPenalty, counter: row.metric.worstCounter.label })));
}

module.exports = { SCENARIOS, representativeOpponents, evaluateBoard, auditStage, assertResult };
if (require.main === module) main();
