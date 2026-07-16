"use strict";

// Compiles every model-supported hero augment route into deterministic holder
// and carry handoff rules. It consumes model outputs; it never injects a lineup.
const fs = require("fs");
const { simulateBattle, heroByName } = require("../sim/combat-engine.js");
const { simulate, equip } = require("../core/model.js");
const { profiles } = require("../core/mechanic-profiles.js");
const { resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

const BASE_SEED = 20260718;
const REPEATS_PER_OPPONENT = 4;
const MIN_UPLIFT_PCT = 5;
const MIN_PROFILE_CONFIDENCE = 0.6;
const MIN_ROUTE_SAMPLES = 5000;
const MAX_FAILURE_RATE = 5;
const MIN_ROUTE_ROBUSTNESS = 40;
const MIN_COVERAGE = 90;
const ONE_SIDED_Z95 = 1.645;
const itemIdByName = Object.fromEntries(Object.values(equip).filter(item => item && item.name).map(item => [item.name, item.id]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(Number(value || 0) * p) / p;
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map(value => (value - avg) ** 2)));
}

function inference(values, battles, coverage) {
  const avg = mean(values);
  const se = standardDeviation(values) / Math.sqrt(Math.max(1, values.length));
  return {
    sampleCount: values.length,
    battles,
    meanDelta: round(avg),
    standardError: round(se, 3),
    lcb95: round(avg - ONE_SIDED_Z95 * se),
    probabilityPositive: round(values.filter(value => value > 0).length / Math.max(1, values.length) * 100),
    coverage: round(coverage, 1),
  };
}

function phaseNames(template, key, size) {
  const source = key === "early" ? template.earlyUnits : key === "mid" ? template.midUnits : template.coreUnits;
  const profile = template.routeProfile || {};
  return uniq([...(source || []), ...(profile.units || []).map(unit => unit.name)]).slice(0, size);
}

function opponentPool(templates, excludedId) {
  const rows = templates
    .filter(template => template.id !== excludedId && template.routeProfile)
    .sort((a, b) => Number(b.strengthPrior || 0) - Number(a.strengthPrior || 0)
      || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
  const selected = [];
  const sources = {};
  for (const template of rows) {
    const source = template.source || "unknown";
    if ((sources[source] || 0) >= 4) continue;
    selected.push(template);
    sources[source] = (sources[source] || 0) + 1;
    if (selected.length >= 12) break;
  }
  return selected;
}

function inferredStar(name, stageKey, carry) {
  const price = Number((heroByName[name] || {}).price || 1);
  if (stageKey === "late") return carry && price <= 3 ? 3 : 2;
  if (stageKey === "mid") return price <= 3 ? 2 : 1;
  return price <= 2 ? 2 : 1;
}

function normalizedRole(row) {
  if (row.carry || /主C/.test(row.role || "")) return "mainCarry";
  if (/坦|控制|战士/.test(row.role || "")) return "frontline";
  return "utility";
}

function opponentBoard(template, stageKey, size) {
  const profile = template.routeProfile || {};
  const carry = profile.mainCarry || {};
  const unitByName = new Map((profile.units || []).map(unit => [unit.name, unit]));
  return phaseNames(template, stageKey, size).map(name => {
    const unit = unitByName.get(name) || {};
    const isCarry = name === carry.name;
    return {
      name,
      star: inferredStar(name, stageKey, isCarry),
      role: isCarry ? "mainCarry" : unit.role || "utility",
      items: isCarry ? (carry.items || []).slice(0, 3) : (stageKey === "late" ? (unit.items || []).slice(0, 2) : []),
      traits: unit.traits || [],
    };
  });
}

function pairedMargin(leftBoard, rightBoard, seed) {
  const direct = simulateBattle(leftBoard, rightBoard, { seed });
  const swapped = simulateBattle(rightBoard, leftBoard, { seed });
  return {
    margin: (direct.margin - swapped.margin) / 2,
    coverage: (direct.leftCoverage + swapped.rightCoverage) / 2,
    battles: 2,
  };
}

function profileMechanic(profile) {
  if (profile.augment === "姐妹") return { requiredAugment: "姐妹" };
  return { requiredAugment: profile.augment, genericNumeric: true, events: profile.events || [] };
}

function policyBoard(stage, target, holder, targetStar, targetItems, profile, unitTraits) {
  return (stage.board || []).map(row => {
    const isTarget = row.name === target;
    const isHolder = row.name === holder;
    const preserveTankItems = /坦|控制/.test(row.role || "") && !row.carry && !isTarget && !isHolder;
    return {
      name: row.name,
      star: isTarget ? targetStar : inferredStar(row.name, stage.key, isHolder),
      role: isHolder ? "mainCarry" : normalizedRole(row),
      items: isHolder ? targetItems.slice(0, 3) : (preserveTankItems ? (row.items || []).slice(0, 3) : []),
      traits: unitTraits[row.name] || [],
      mechanic: isTarget ? profileMechanic(profile) : null,
      bonus: isTarget && profile.augment !== "姐妹" && !(profile.events || []).length ? profile.carryBonus || {} : {},
    };
  });
}

function holderValue(name, stageKey, targetItems) {
  const hero = heroByName[name];
  if (!hero) return -Infinity;
  const star = inferredStar(name, stageKey, true);
  const itemIds = (targetItems || []).map(item => itemIdByName[item]).filter(Boolean).slice(0, 3);
  const result = simulate(hero.id, itemIds, star);
  if (!result) return -Infinity;
  const survivalFactor = Math.min(1.22, 0.82 + Number(hero.attackRange || 1) * 0.08 + Number(hero.initHP || 0) / 9000);
  return Number(result.dps || 0) * survivalFactor;
}

function alternateHolder(stage, target, targetItems) {
  const named = (stage.board || []).filter(row => row.name !== target);
  const ranked = named.map(row => ({ name: row.name, value: holderValue(row.name, stage.key, targetItems) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh-CN"));
  return ranked[0] && ranked[0].name || target;
}

function evaluateStar({ template, stage, target, targetStar, targetItems, baselineHolder, profile, opponents, unitTraits }) {
  const targetBoard = policyBoard(stage, target, target, targetStar, targetItems, profile, unitTraits);
  const baselineBoard = policyBoard(stage, target, baselineHolder, targetStar, targetItems, profile, unitTraits);
  const deltas = [];
  const coverages = [];
  let battles = 0;
  opponents.forEach((opponent, opponentIndex) => {
    const enemy = opponentBoard(opponent, stage.key, Math.max(4, stage.board.length));
    for (let repeat = 0; repeat < REPEATS_PER_OPPONENT; repeat++) {
      const seed = (BASE_SEED ^ Math.imul(opponentIndex + 1, 2654435761) ^ Math.imul(repeat + 1, 2246822519)
        ^ Math.imul(targetStar + 1, 3266489917)) >>> 0;
      const targetRun = pairedMargin(targetBoard, enemy, seed);
      const baselineRun = pairedMargin(baselineBoard, enemy, seed);
      deltas.push((targetRun.margin - baselineRun.margin) * 100);
      coverages.push((targetRun.coverage + baselineRun.coverage) / 2 * 100);
      battles += targetRun.battles + baselineRun.battles;
    }
  });
  return inference(deltas, battles, mean(coverages));
}

function routeGate(row, template, profile) {
  const cert = template.certification || {};
  const metrics = cert.metrics || {};
  const checks = {
    numericMechanic: Boolean(profile && profile.supported),
    uplift: Number(row.upliftPct) >= MIN_UPLIFT_PCT,
    profileConfidence: Number(row.confidence) >= MIN_PROFILE_CONFIDENCE,
    routeSamples: Number(cert.sampleSize) >= MIN_ROUTE_SAMPLES,
    failureRate: Number(metrics.failureRate) <= MAX_FAILURE_RATE,
    robustness: Number(metrics.robustness) >= MIN_ROUTE_ROBUSTNESS,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

function stageWindows(stages) {
  return stages.map((stage, index) => ({
    ...stage,
    levelMin: index === 0 ? 1 : Number(stages[index - 1].level) + 1,
    levelMax: index === stages.length - 1 ? 9 : Number(stage.level),
  }));
}

function compileStage({ row, template, stage, profile, opponents, unitTraits }) {
  const target = row.carry;
  const targetPresent = (stage.team || []).includes(target);
  const holder = stage.carry === target ? alternateHolder(stage, target, row.carryItems || []) : stage.carry;
  const goalStar = Number(template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.starTarget) || 2;
  const gate = routeGate(row, template, profile);
  if (!targetPresent) {
    return {
      key: stage.key,
      label: stage.label,
      levelMin: stage.levelMin,
      levelMax: stage.levelMax,
      baselineHolder: stage.carry,
      targetPresent: false,
      targetStarThreshold: null,
      certified: false,
      gate,
      inferenceByStar: [],
      text: `${stage.levelMax}级前${target}不在阶段棋盘，继续${stage.carry}代持`,
    };
  }
  const inferenceByStar = [];
  for (let star = 1; star <= goalStar; star++) {
    inferenceByStar.push({
      star,
      ...evaluateStar({ template, stage, target, targetStar: star, targetItems: row.carryItems || [], baselineHolder: holder, profile, opponents, unitTraits }),
    });
  }
  const threshold = inferenceByStar.find(result => gate.pass && result.coverage >= MIN_COVERAGE && result.lcb95 > 0) || null;
  return {
    key: stage.key,
    label: stage.label,
    levelMin: stage.levelMin,
    levelMax: stage.levelMax,
    baselineHolder: holder,
    targetPresent: true,
    targetStarThreshold: threshold && threshold.star || null,
    certified: Boolean(threshold),
    gate,
    inferenceByStar,
    inference: threshold,
    text: threshold
      ? `${target}${threshold.star}星转核通过：相对${holder} LCB ${threshold.lcb95}`
      : `${target}转核未过稳健门槛，继续${holder}代持`,
  };
}

function rulesForStages(planStages, target, requiredUnits) {
  const rules = [];
  planStages.forEach(stage => {
    const range = { levelGte: stage.levelMin, levelLte: stage.levelMax };
    if (stage.certified) {
      rules.push({
        when: { ...range, unit: target, starGte: stage.targetStarThreshold, hasUnits: requiredUnits },
        holder: target,
        fromCarry: stage.baselineHolder,
        certified: true,
        stageKey: stage.key,
        inference: stage.inference,
        text: stage.text,
      });
    }
    rules.push({
      when: range,
      holder: stage.baselineHolder,
      fromCarry: stage.baselineHolder,
      certified: false,
      stageKey: stage.key,
      inference: stage.inference || stage.inferenceByStar[stage.inferenceByStar.length - 1] || null,
      text: stage.text,
    });
  });
  return rules;
}

function compileGenericPlan(row, template, profile, matcher) {
  const presentation = row.presentation;
  const opponents = opponentPool(matcher.templates, template.id);
  const unitTraits = Object.fromEntries((matcher.options.unitSearch || []).map(unit => [unit.name, unit.traits || []]));
  const stages = stageWindows(presentation.stages || []).map(stage => compileStage({ row, template, stage, profile, opponents, unitTraits }));
  const requiredUnits = uniq([...(row.requiredUnits || []), row.carry]);
  const certifiedStages = stages.filter(stage => stage.certified);
  return {
    id: `${row.augment}|${row.carry}`,
    source: "generic-policy-compiler",
    experiment: "all-hero-augment-policy-v1",
    augment: row.augment,
    baselineCarry: stages[0] && stages[0].baselineHolder || row.carry,
    strategicCarry: row.carry,
    currentHolder: stages[0] && stages[0].baselineHolder || row.carry,
    requiredUnits,
    certified: certifiedStages.length > 0,
    modelCoverage: {
      profileConfidence: row.confidence,
      counterfactualUpliftPct: row.upliftPct,
      routeSamples: Number(template.certification && template.certification.sampleSize) || 0,
      routeRobustness: Number(template.certification && template.certification.metrics && template.certification.metrics.robustness) || 0,
      opponents: opponents.length,
      opponentSources: opponents.reduce((map, opponent) => ({ ...map, [opponent.source || "unknown"]: (map[opponent.source || "unknown"] || 0) + 1 }), {}),
    },
    evidenceCount: stages.reduce((sum, stage) => sum + stage.inferenceByStar.reduce((n, result) => n + Number(result.battles || 0), 0), 0)
      + Number(template.certification && template.certification.sampleSize || 0),
    evidenceUnit: "模型样本/配对战斗",
    stages,
    holderRules: rulesForStages(stages, row.carry, requiredUnits),
    handoff: certifiedStages.length ? { unit: row.carry, starGte: Math.min(...certifiedStages.map(stage => stage.targetStarThreshold)) } : null,
    handoffText: certifiedStages.length
      ? certifiedStages.map(stage => `${stage.levelMin}-${stage.levelMax}级：${stage.text}`).join("；")
      : `尚无${row.carry}稳健交接点`,
    terminalText: stages[stages.length - 1] && stages[stages.length - 1].text || "终局继续观察",
  };
}

function specialJaxPlan(result) {
  const decision = result && result.decision;
  if (!decision) return null;
  return {
    id: `${decision.augment}|${decision.strategicCarry}`,
    source: "augment-conditioned-transition-lab",
    experiment: result.experiment,
    augment: decision.augment,
    baselineCarry: decision.baselineCarry,
    strategicCarry: decision.strategicCarry,
    currentHolder: decision.currentHolder,
    requiredUnits: [decision.strategicCarry],
    certified: Boolean(decision.certified),
    modelCoverage: { opponents: result.opponents.count, opponentSources: result.opponents.sources, mechanismAblation: result.mechanismAblation },
    evidenceCount: Number(result.battles) || 0,
    evidenceUnit: "条件化战斗",
    currentInference: decision.stateInference.jaxOneImmediate,
    handoffInference: decision.stateInference.jaxTwoBridge,
    handoff: decision.handoff,
    handoffText: decision.handoffText,
    terminalText: decision.terminalText,
    stages: [],
    holderRules: [
      { when: { unit: decision.handoff.unit, starGte: decision.handoff.starGte }, holder: decision.strategicCarry, fromCarry: decision.baselineCarry, certified: decision.handoffCertified, stageKey: "handoff", inference: decision.stateInference.jaxTwoBridge, text: `贾克斯${decision.handoff.starGte}星优势扩大（LCB ${decision.stateInference.jaxTwoBridge.lcb95}）` },
      { when: { hasUnit: decision.currentHolder }, holder: decision.currentHolder, fromCarry: decision.baselineCarry, certified: decision.currentSwitchCertified, stageKey: "current", inference: decision.stateInference.jaxOneImmediate, text: `无情连打立即转贾克斯（LCB ${decision.stateInference.jaxOneImmediate.lcb95}）` },
      { holder: decision.currentHolder, fromCarry: decision.baselineCarry, certified: decision.currentSwitchCertified, stageKey: "current", inference: decision.stateInference.jaxOneImmediate, text: `无情连打立即转贾克斯（LCB ${decision.stateInference.jaxOneImmediate.lcb95}）` },
    ],
  };
}

function report(result) {
  const lines = [
    "# 全英雄强化策略编译报告",
    "",
    `生成时间：${result.generated}`,
    "",
    `- 英雄强化目录：${result.coverage.catalog}条；可数值化：${result.coverage.numericProfiles}条。`,
    `- 条件路线：${result.coverage.conditionalRows}条；编译决策：${result.plans.length}条；至少一个阶段通过：${result.plans.filter(plan => plan.certified).length}条。`,
    `- 硬门槛：反事实提升≥${MIN_UPLIFT_PCT}%，机制置信≥${MIN_PROFILE_CONFIDENCE}，路线样本≥${MIN_ROUTE_SAMPLES}，失效率≤${MAX_FAILURE_RATE}%，战斗覆盖≥${MIN_COVERAGE}%，且交接LCB>0。`,
    "",
    "| 强化 | 战略主C | 认证 | 阶段交接 |",
    "|---|---|---:|---|",
  ];
  result.plans.forEach(plan => {
    const stageText = plan.stages.length ? plan.stages.map(stage => `${stage.label}:${stage.text}`).join("；") : plan.handoffText;
    lines.push(`| ${plan.augment} | ${plan.strategicCarry} | ${plan.certified ? "通过" : "观察"} | ${stageText} |`);
  });
  lines.push("", "## 方法边界", "", "- 官方数据只提供英雄、装备与强化机制参数；路线、持装者与交接点由本地模型产生。", "- 控制、改变技能目标、击杀归属等尚未数值化的机制不会获得自动转核认证。");
  return lines.join("\n");
}

function run() {
  const matcher = JSON.parse(fs.readFileSync(resultPath("stage2_matcher_results.json"), "utf8"));
  const meta = JSON.parse(fs.readFileSync(resultPath("meta_discovery_results.json"), "utf8"));
  const special = JSON.parse(fs.readFileSync(resultPath("augment_transition_results.json"), "utf8"));
  const profileByName = new Map(profiles.map(profile => [profile.augment, profile]));
  const templateByKey = new Map(matcher.templates
    .filter(template => template.mechanic && template.mechanic.requiredAugment)
    .map(template => [`${template.mechanic.requiredAugment}|${template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name}`, template]));
  const genericPlans = (meta.conditional || []).map(row => {
    const template = templateByKey.get(`${row.augment}|${row.carry}`);
    const profile = profileByName.get(row.augment);
    return template && profile && row.presentation ? compileGenericPlan(row, template, profile, matcher) : null;
  }).filter(Boolean);
  const specialPlan = specialJaxPlan(special);
  const planMap = new Map(genericPlans.map(plan => [plan.id, plan]));
  if (specialPlan) planMap.set(specialPlan.id, specialPlan);
  const plans = [...planMap.values()].sort((a, b) => Number(b.certified) - Number(a.certified) || a.augment.localeCompare(b.augment, "zh-CN"));
  const result = {
    generated: new Date().toISOString(),
    experiment: "strategy-policy-compiler-v1",
    constants: { MIN_UPLIFT_PCT, MIN_PROFILE_CONFIDENCE, MIN_ROUTE_SAMPLES, MAX_FAILURE_RATE, MIN_ROUTE_ROBUSTNESS, MIN_COVERAGE, ONE_SIDED_Z95 },
    coverage: {
      catalog: matcher.options.heroAugments.length,
      numericProfiles: profiles.filter(profile => profile.supported).length,
      conditionalRows: (meta.conditional || []).length,
      compiled: plans.length,
      certified: plans.filter(plan => plan.certified).length,
    },
    plans,
    uncompiled: (meta.conditional || []).filter(row => !planMap.has(`${row.augment}|${row.carry}`)).map(row => ({ augment: row.augment, carry: row.carry, reason: "未进入当前认证路线模板" })),
  };
  assert(result.coverage.catalog === 122, "策略编译器必须对齐122条英雄强化目录");
  assert(plans.length >= 8, `通用编译结果过少：${plans.length}`);
  assert(plans.some(plan => plan.augment === "姐妹") && plans.some(plan => plan.augment === "无情连打"), "通用策略必须同时覆盖姐妹与无情连打");
  assert(plans.flatMap(plan => plan.holderRules).filter(rule => rule.certified).every(rule => rule.inference && rule.inference.lcb95 > 0), "认证交接规则必须有正的LCB");
  assert(plans.filter(plan => plan.source === "generic-policy-compiler").every(plan => plan.modelCoverage.opponents >= 8), "通用策略对手池不得少于8套");
  ensureOutputDirs();
  fs.writeFileSync(resultPath("strategy_policy_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(publicPath("strategy-policy-data.js"), `window.STRATEGY_POLICY=${JSON.stringify(result)};`);
  fs.writeFileSync(reportPath("全英雄强化策略编译报告.md"), report(result));
  console.log(`策略编译完成：${plans.length}条，认证${plans.filter(plan => plan.certified).length}条`);
  plans.forEach(plan => console.log(`${plan.certified ? "PASS" : "WATCH"} ${plan.augment}·${plan.strategicCarry}: ${plan.handoffText}`));
  return result;
}

if (require.main === module) run();

module.exports = { run, compileGenericPlan, compileStage, evaluateStar, routeGate, inference };
