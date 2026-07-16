"use strict";

const fs = require("fs");
const { simulateBattle, heroByName } = require("../sim/combat-engine.js");
const { resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

require("../../public/odds-data.js");

const ODDS = globalThis.JCC_ODDS;
const SAMPLES = 240;
const BASE_SEED = 20260717;
const AUGMENT = "无情连打";
const ATTACK_SPEED_PER_THIRD = 0.12;
const STAGE_WEIGHTS = { current: 0.15, mid: 0.5, terminal: 0.35 };
const GOLD_BUDGETS = [20, 32, 44];
const CONTESTED_COPIES = [0, 2, 4];
const CURRENT_STATE = {
  level: 4,
  round: "3-2",
  goldBand: "10-19",
  augment: AUGMENT,
  units: [
    { name: "孙悟空", star: 2 },
    { name: "德莱文", star: 1 },
    { name: "贾克斯", star: 1, source: AUGMENT },
    { name: "锐雯", star: 1 },
    { name: "李青", star: 1 },
  ],
  items: ["锁子甲"],
};

const POLICIES = [
  { id: "keep-draven", label: "德莱文继续定线", strategicCarry: "德莱文", currentHolder: "德莱文", terminalCarry: "德莱文" },
  { id: "immediate-jax", label: "贾克斯1星立即接管", strategicCarry: "贾克斯", currentHolder: "贾克斯", terminalCarry: "贾克斯" },
  { id: "bridge-jax", label: "德莱文代持→贾克斯2星接管", strategicCarry: "贾克斯", currentHolder: "德莱文", terminalCarry: "贾克斯" },
  { id: "jax-leona", label: "德莱文代持→贾克斯→蕾欧娜上限", strategicCarry: "贾克斯", currentHolder: "德莱文", terminalCarry: "蕾欧娜" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
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

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map(value => (value - avg) ** 2)));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function profileUnit(template, name) {
  return (template.routeProfile && template.routeProfile.units || []).find(unit => unit.name === name) || null;
}

function targetItems(template, carry) {
  const profile = template.routeProfile || {};
  if (profile.mainCarry && profile.mainCarry.name === carry) return (profile.mainCarry.items || []).slice(0, 3);
  const unit = profileUnit(template, carry);
  return (unit && unit.items || []).slice(0, 3);
}

function phaseNames(template, phase, size, carry) {
  const source = phase === "current" ? template.earlyUnits : phase === "mid" ? template.midUnits : template.coreUnits;
  const names = unique([carry, ...(source || []), ...((template.routeProfile && template.routeProfile.units) || []).map(unit => unit.name)])
    .filter(name => heroByName[name]);
  return names.slice(0, size);
}

function boardFromTemplate(template, phase, carry, star, itemCount, mechanic, size) {
  const names = phaseNames(template, phase, size, carry);
  return names.map(name => {
    const unit = profileUnit(template, name) || { name, role: "utility", traits: [], items: [] };
    const isCarry = name === carry;
    const price = Number((heroByName[name] || {}).price || 1);
    return {
      name,
      role: isCarry ? "mainCarry" : unit.role || "utility",
      star: isCarry ? star : clamp(Number(unit.starTarget || (price <= 2 ? 2 : 1)), 1, 2),
      items: isCarry ? targetItems(template, carry).slice(0, itemCount) : (phase === "terminal" ? (unit.items || []).slice(0, 2) : []),
      traits: unit.traits || [],
      mechanic: name === "贾克斯" ? mechanic : null,
    };
  });
}

function currentBoard(holder, jaxTemplate, dravenTemplate, mechanic) {
  const names = ["孙悟空", "德莱文", "贾克斯", "锐雯"];
  return names.map(name => {
    const state = CURRENT_STATE.units.find(unit => unit.name === name) || { star: 1 };
    const unit = profileUnit(jaxTemplate, name) || profileUnit(dravenTemplate, name) || { traits: [] };
    return {
      name,
      role: name === holder ? "mainCarry" : (name === "孙悟空" || name === "锐雯" ? "frontline" : "utility"),
      star: state.star,
      items: name === "孙悟空" ? ["锁子甲"] : [],
      traits: unit.traits || [],
      mechanic: name === "贾克斯" ? mechanic : null,
    };
  });
}

function starForCopies(copies) {
  if (copies >= 9) return 3;
  if (copies >= 3) return 2;
  return 1;
}

function rollForUnit({ price, level, startingCopies, budget, contestedCopies, seed }) {
  const rng = seeded(seed);
  let copies = startingCopies;
  let gold = budget;
  let shops = 0;
  const freeShops = 4;
  while ((shops < freeShops || gold >= 2) && copies < 9 && shops < 40) {
    if (shops >= freeShops) gold -= 2;
    shops++;
    for (let slot = 0; slot < 5 && copies < 9; slot++) {
      const remaining = Math.max(0, Number(ODDS.poolCopies[price]) - contestedCopies - copies);
      const base = Number(ODDS.shopOdds[level][price - 1] || 0) / 100 / Number(ODDS.unitCounts[price] || 1);
      const hitChance = base * remaining / Math.max(1, Number(ODDS.poolCopies[price]));
      if (rng() < hitChance && gold >= price) {
        gold -= price;
        copies++;
      }
    }
  }
  return { copies, star: starForCopies(copies), goldLeft: gold, shops };
}

function pairedBattle(leftBoard, rightBoard, seed) {
  const direct = simulateBattle(leftBoard, rightBoard, { seed });
  const swapped = simulateBattle(rightBoard, leftBoard, { seed });
  return {
    margin: (direct.margin - swapped.margin) / 2,
    win: ((direct.winner === 0 ? 1 : direct.winner === -1 ? 0.5 : 0)
      + (swapped.winner === 1 ? 1 : swapped.winner === -1 ? 0.5 : 0)) / 2,
    coverage: (direct.leftCoverage + swapped.rightCoverage) / 2,
    battles: 2,
  };
}

function opponentPool(templates, excludedIds) {
  const candidates = templates
    .filter(template => template.routeProfile && !excludedIds.has(template.id))
    // The experiment must not inherit last run's virtualBattle result. That would
    // make the opponent sample depend on stale generated output and break rerun
    // reproducibility. strengthPrior is built from the current version profile.
    .sort((a, b) => Number(b.strengthPrior || 0) - Number(a.strengthPrior || 0)
      || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
  const selected = [];
  const sourceCounts = {};
  for (const template of candidates) {
    const source = template.source || "unknown";
    if ((sourceCounts[source] || 0) >= 4) continue;
    selected.push(template);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    if (selected.length >= 14) break;
  }
  return selected;
}

function opponentBoard(template, phase) {
  const carry = template.routeProfile.mainCarry || {};
  const size = phase === "current" ? 4 : phase === "mid" ? 6 : 9;
  const star = phase === "current" ? 1 : Number(carry.starTarget || 2) >= 3 && phase === "terminal" ? 3 : 2;
  const itemCount = phase === "current" ? 0 : phase === "mid" ? 1 : 3;
  return boardFromTemplate(template, phase, carry.name, star, itemCount, null, size);
}

function policyBoards(policy, context) {
  const mechanic = { requiredAugment: AUGMENT, attackSpeedPerThird: ATTACK_SPEED_PER_THIRD };
  const current = currentBoard(policy.currentHolder, context.jaxTemplate, context.dravenTemplate, mechanic);
  const target = policy.strategicCarry === "德莱文" ? context.dravenRoll : context.jaxRoll;
  const midHolder = policy.id === "immediate-jax" || policy.id === "bridge-jax" || policy.id === "jax-leona"
    ? (policy.id === "immediate-jax" || target.star >= 2 ? "贾克斯" : "德莱文")
    : "德莱文";
  const midTemplate = midHolder === "贾克斯" ? context.jaxTemplate : context.dravenTemplate;
  const midStar = midHolder === "贾克斯" ? context.jaxRoll.star : context.dravenRoll.star;
  const mid = boardFromTemplate(midTemplate, "mid", midHolder, midStar, context.itemCount, mechanic, 6);

  let terminalCarry = policy.terminalCarry;
  let terminalTemplate = terminalCarry === "德莱文" ? context.dravenTemplate : context.jaxTemplate;
  let terminalStar = terminalCarry === "德莱文" ? context.dravenTerminal.star : context.jaxTerminal.star;
  if (terminalCarry === "蕾欧娜" && context.leonaTerminal.star < 2) {
    terminalCarry = "贾克斯";
    terminalStar = context.jaxTerminal.star;
  }
  const terminal = boardFromTemplate(terminalTemplate, "terminal", terminalCarry, terminalStar, 3, mechanic, 9);
  if (terminalCarry === "蕾欧娜") {
    const leona = terminal.find(unit => unit.name === "蕾欧娜");
    if (leona) {
      leona.role = "mainCarry";
      leona.items = ["朔极之矛", "水银", "鬼索的狂暴之刃"];
      leona.star = 2;
    }
  }
  return { current, mid, terminal, midHolder, terminalCarry };
}

function policySample(policy, sampleIndex, templates) {
  const budget = GOLD_BUDGETS[sampleIndex % GOLD_BUDGETS.length];
  const contested = CONTESTED_COPIES[Math.floor(sampleIndex / GOLD_BUDGETS.length) % CONTESTED_COPIES.length];
  const itemCount = 1 + (Math.floor(sampleIndex / 9) % 2);
  const baseRollSeed = (BASE_SEED ^ Math.imul(sampleIndex + 1, 2654435761)) >>> 0;
  const jaxRoll = rollForUnit({ price: 3, level: 6, startingCopies: 1, budget, contestedCopies: contested, seed: baseRollSeed });
  const dravenRoll = rollForUnit({ price: 2, level: 6, startingCopies: 1, budget, contestedCopies: contested, seed: baseRollSeed });
  const jaxTerminal = rollForUnit({ price: 3, level: 7, startingCopies: jaxRoll.copies, budget: 40, contestedCopies: contested, seed: baseRollSeed ^ 0x9e3779b9 });
  const dravenTerminal = rollForUnit({ price: 2, level: 7, startingCopies: dravenRoll.copies, budget: 40, contestedCopies: contested, seed: baseRollSeed ^ 0x9e3779b9 });
  const leonaTerminal = rollForUnit({ price: 5, level: 9, startingCopies: 0, budget: 45, contestedCopies: 0, seed: baseRollSeed ^ 0x85ebca6b });
  const context = { ...templates, jaxRoll, dravenRoll, jaxTerminal, dravenTerminal, leonaTerminal, itemCount };
  const boards = policyBoards(policy, context);
  const opponent = templates.opponents[sampleIndex % templates.opponents.length];
  const current = pairedBattle(boards.current, opponentBoard(opponent, "current"), baseRollSeed ^ 11);
  const mid = pairedBattle(boards.mid, opponentBoard(opponent, "mid"), baseRollSeed ^ 23);
  const terminal = pairedBattle(boards.terminal, opponentBoard(opponent, "terminal"), baseRollSeed ^ 37);
  const weightedMargin = STAGE_WEIGHTS.current * current.margin + STAGE_WEIGHTS.mid * mid.margin + STAGE_WEIGHTS.terminal * terminal.margin;
  const weightedWin = STAGE_WEIGHTS.current * current.win + STAGE_WEIGHTS.mid * mid.win + STAGE_WEIGHTS.terminal * terminal.win;
  const targetRoll = policy.strategicCarry === "德莱文" ? dravenTerminal : jaxTerminal;
  const goldEfficiency = clamp(targetRoll.goldLeft / Math.max(1, 40), -1, 1);
  const utility = 100 * (0.58 * weightedWin + 0.37 * (weightedMargin + 1) / 2 + 0.05 * (goldEfficiency + 1) / 2);
  return {
    utility,
    weightedMargin,
    weightedWin,
    coverage: mean([current.coverage, mid.coverage, terminal.coverage]),
    battles: current.battles + mid.battles + terminal.battles,
    jaxMidStar: jaxRoll.star,
    jaxTerminalStar: jaxTerminal.star,
    dravenTerminalStar: dravenTerminal.star,
    leonaTerminalStar: leonaTerminal.star,
    midHolder: boards.midHolder,
    terminalCarry: boards.terminalCarry,
    budget,
    contested,
  };
}

function summarizePolicy(policy, samples) {
  const utilities = samples.map(sample => sample.utility);
  const margins = samples.map(sample => sample.weightedMargin);
  return {
    id: policy.id,
    label: policy.label,
    strategicCarry: policy.strategicCarry,
    currentHolder: policy.currentHolder,
    terminalCarry: policy.terminalCarry,
    samples: samples.length,
    battles: samples.reduce((sum, sample) => sum + sample.battles, 0),
    utility: round(mean(utilities)),
    interval90: [round(quantile(utilities, 0.05)), round(quantile(utilities, 0.95))],
    cvar10: round(lowerCvar(utilities)),
    winIndex: round(mean(samples.map(sample => sample.weightedWin)) * 100),
    meanMargin: round(mean(margins), 3),
    coverage: round(mean(samples.map(sample => sample.coverage)) * 100),
    jax2ByMidPct: round(samples.filter(sample => sample.jaxMidStar >= 2).length / samples.length * 100),
    jax3TerminalPct: round(samples.filter(sample => sample.jaxTerminalStar >= 3).length / samples.length * 100),
    draven3TerminalPct: round(samples.filter(sample => sample.dravenTerminalStar >= 3).length / samples.length * 100),
    leona2TerminalPct: round(samples.filter(sample => sample.leonaTerminalStar >= 2).length / samples.length * 100),
  };
}

function pairedInference(candidateSamples, baselineSamples) {
  const deltas = candidateSamples.map((sample, index) => sample.utility - baselineSamples[index].utility);
  const delta = mean(deltas);
  const se = standardDeviation(deltas) / Math.sqrt(Math.max(1, deltas.length));
  return {
    meanDelta: round(delta),
    standardError: round(se, 3),
    lcb95: round(delta - 1.645 * se),
    probabilityPositive: round(deltas.filter(value => value > 0).length / deltas.length * 100),
  };
}

function stratifiedInference(candidateSamples, baselineSamples, predicate) {
  const candidate = [];
  const baseline = [];
  candidateSamples.forEach((sample, index) => {
    if (!predicate(sample, baselineSamples[index])) return;
    candidate.push(sample);
    baseline.push(baselineSamples[index]);
  });
  return { sampleCount: candidate.length, ...pairedInference(candidate, baseline) };
}

function mechanismAblation(jaxTemplate, opponents) {
  const plain = [];
  const enhanced = [];
  const base = boardFromTemplate(jaxTemplate, "mid", "贾克斯", 2, 3, null, 6);
  const augmented = boardFromTemplate(jaxTemplate, "mid", "贾克斯", 2, 3, { requiredAugment: AUGMENT, attackSpeedPerThird: ATTACK_SPEED_PER_THIRD }, 6);
  for (let index = 0; index < opponents.length * 8; index++) {
    const opponent = opponentBoard(opponents[index % opponents.length], "mid");
    const seed = (BASE_SEED ^ Math.imul(index + 1, 2246822519)) >>> 0;
    plain.push(pairedBattle(base, opponent, seed).margin);
    enhanced.push(pairedBattle(augmented, opponent, seed).margin);
  }
  const inference = pairedInference(enhanced.map(utility => ({ utility: utility * 100 })), plain.map(utility => ({ utility: utility * 100 })));
  return {
    samples: plain.length,
    battles: plain.length * 4,
    plainMeanMargin: round(mean(plain), 3),
    augmentedMeanMargin: round(mean(enhanced), 3),
    ...inference,
  };
}

function report(result) {
  const lines = [
    "# 英雄强化条件化转型实验",
    "",
    `生成时间：${result.generated}`,
    "",
    "## 研究问题",
    "",
    "在4级3-2已选无情连打后，应继续德莱文终局，还是转入贾克斯战略线？德莱文是否可以只做临时装备架？",
    "",
    "## 输入与方法",
    "",
    `- 现场：${result.scenario.round}，${result.scenario.level}级，${result.scenario.goldBand}金，${result.scenario.units.map(unit => `${unit.name}${unit.star}星`).join("、")}，${result.scenario.items.join("、")}。`,
    `- 机制：${AUGMENT}每第三次攻击叠加${ATTACK_SPEED_PER_THIRD * 100}%攻速；使用事件战斗引擎，不是阵容名加分。`,
    `- 运营扰动：D牌预算 ${GOLD_BUDGETS.join("/")}金，同行占牌 ${CONTESTED_COPIES.join("/")}张，中期主C装备完成度1-2件。`,
    `- 对手：${result.opponents.count}套，来源 ${Object.entries(result.opponents.sources).map(([source, count]) => `${source}:${count}`).join("、")}。`,
    `- 效用：${result.formula}`,
    "",
    "## 无情连打机制消融",
    "",
    `- 无强化平均血量优势 ${result.mechanismAblation.plainMeanMargin}，有强化 ${result.mechanismAblation.augmentedMeanMargin}。`,
    `- 配对边际 ${result.mechanismAblation.meanDelta}分，95%单侧置信下界 ${result.mechanismAblation.lcb95}分，正向样本 ${result.mechanismAblation.probabilityPositive}%。`,
    "",
    "## 策略排名",
    "",
    "| 排名 | 策略 | 效用 | CVaR10 | 胜率指数 | 覆盖率 | 对德莱文基线LCB |",
    "|---:|---|---:|---:|---:|---:|---:|",
  ];
  result.rankings.forEach((row, index) => {
    const delta = result.comparisons[row.id];
    lines.push(`| ${index + 1} | ${row.label} | ${row.utility} | ${row.cvar10} | ${row.winIndex}% | ${row.coverage}% | ${delta ? delta.lcb95 : "-"} |`);
  });
  lines.push("", "## 决策蒸馏", "");
  lines.push(`- 当前执行：${result.decision.currentHolder}；贾克斯1星立即接管LCB ${result.stateInference.jaxOneImmediate.lcb95}，${result.decision.currentSwitchCertified ? "通过" : "不通过"}。`);
  lines.push(`- 战略交接：${result.decision.handoffText}；贾克斯2星LCB ${result.stateInference.jaxTwoBridge.lcb95}，${result.decision.handoffCertified ? "通过" : "不通过"}。`);
  lines.push(`- 认证结论：${result.decision.certified ? `已找到${result.decision.strategicCarry}的可执行交接门槛` : "未找到稳健转型门槛"}。`);
  lines.push(`- 后期分支：${result.decision.terminalText}。`);
  lines.push("", "## 边界", "");
  lines.push("- 官方数值只作为英雄、装备、商店概率和强化机制的边界条件；官方推荐阵容不是监督标签。");
  lines.push("- 对手池同时包含官方、算法生成、机制求解和自研路线，来源单一的结论不予蒸馏。");
  lines.push("- 这是从当前状态开始的策略评估，不是终局木桩分的别名。");
  return lines.join("\n");
}

function run() {
  const matcher = JSON.parse(fs.readFileSync(resultPath("stage2_matcher_results.json"), "utf8"));
  const jaxTemplate = matcher.templates.find(template => template.name.includes("无情连打贾克斯"));
  const dravenTemplate = matcher.templates.find(template => template.name.includes("超级机甲德莱文"));
  assert(jaxTemplate && dravenTemplate, "实验需要贾克斯与德莱文基准模板");
  const augmentRow = (jaxTemplate.heroAugmentPlan && jaxTemplate.heroAugmentPlan.options || []).find(row => row.name === AUGMENT);
  assert(augmentRow && /12%攻击速度/.test(augmentRow.desc), "无情连打原始数值必须是每第三击叠加12%攻速");
  const opponents = opponentPool(matcher.templates, new Set([jaxTemplate.id, dravenTemplate.id]));
  assert(opponents.length >= 8, "条件化实验对手池不得少于8套");
  assert(new Set(opponents.map(template => template.source)).size >= 3, "对手池必须同时包含至少3种数据来源");
  const templates = { jaxTemplate, dravenTemplate, opponents };
  const samplesByPolicy = Object.fromEntries(POLICIES.map(policy => [policy.id, []]));
  for (let sample = 0; sample < SAMPLES; sample++) {
    POLICIES.forEach(policy => samplesByPolicy[policy.id].push(policySample(policy, sample, templates)));
  }
  const summaries = POLICIES.map(policy => summarizePolicy(policy, samplesByPolicy[policy.id]));
  const baseline = samplesByPolicy["keep-draven"];
  const comparisons = {};
  POLICIES.filter(policy => policy.id !== "keep-draven").forEach(policy => {
    comparisons[policy.id] = pairedInference(samplesByPolicy[policy.id], baseline);
  });
  const rankings = summaries.slice().sort((a, b) => b.utility - a.utility || b.cvar10 - a.cvar10 || a.id.localeCompare(b.id));
  const bridge = summaries.find(row => row.id === "bridge-jax");
  const immediate = summaries.find(row => row.id === "immediate-jax");
  const leona = summaries.find(row => row.id === "jax-leona");
  const bridgeInference = comparisons["bridge-jax"];
  const stateInference = {
    jaxOneImmediate: stratifiedInference(samplesByPolicy["immediate-jax"], baseline, sample => sample.jaxMidStar < 2),
    jaxTwoBridge: stratifiedInference(samplesByPolicy["bridge-jax"], baseline, sample => sample.jaxMidStar >= 2),
    jaxThreeTerminal: stratifiedInference(samplesByPolicy["bridge-jax"], baseline, sample => sample.jaxTerminalStar >= 3),
    leonaVsJaxTerminal: pairedInference(samplesByPolicy["jax-leona"], samplesByPolicy["bridge-jax"]),
  };
  const currentCertified = stateInference.jaxOneImmediate.lcb95 > 0;
  const handoffCertified = stateInference.jaxTwoBridge.lcb95 > 0;
  const certified = currentCertified || handoffCertified;
  const result = {
    generated: new Date().toISOString(),
    experiment: "augment-conditioned-transition-v1",
    scenario: CURRENT_STATE,
    mechanism: {
      name: AUGMENT,
      description: augmentRow.desc,
      attackSpeedPerThird: ATTACK_SPEED_PER_THIRD,
      source: "data/hex.js raw mechanic",
    },
    formula: "100×[0.58×加权胜率 + 0.37×标准化血量优势 + 0.05×剩余经济]；阶段权重=当前0.15/中期0.50/终局0.35",
    samples: SAMPLES,
    battles: summaries.reduce((sum, row) => sum + row.battles, 0),
    opponentPolicy: "当前版本路线强度先验排序，名称稳定仲裁，每种来源最多4套；不读取旧虚拟实战产物",
    opponents: {
      count: opponents.length,
      sources: opponents.reduce((map, template) => ({ ...map, [template.source]: (map[template.source] || 0) + 1 }), {}),
      names: opponents.map(template => template.name),
    },
    perturbations: { goldBudgets: GOLD_BUDGETS, contestedCopies: CONTESTED_COPIES, midCarryItemCounts: [1, 2] },
    mechanismAblation: mechanismAblation(jaxTemplate, opponents),
    rankings,
    comparisons,
    stateInference,
    decision: {
      augment: AUGMENT,
      baselineCarry: "德莱文",
      strategicCarry: "贾克斯",
      policyId: currentCertified ? "immediate-jax" : "bridge-jax",
      certified,
      currentSwitchCertified: currentCertified,
      handoffCertified,
      currentHolder: currentCertified ? "贾克斯" : "德莱文",
      handoff: { unit: "贾克斯", starGte: 2 },
      handoffText: currentCertified
        ? "贾克斯达到2星后优势扩大，继续持有输出装与至尊机甲"
        : "贾克斯达到2星后接管输出装与至尊机甲",
      terminalPolicyId: stateInference.leonaVsJaxTerminal.lcb95 > 0 ? "jax-leona" : "bridge-jax",
      terminalText: stateInference.leonaVsJaxTerminal.lcb95 > 0
        ? `上9且蕾欧娜2星三件后转上限（相对贾克斯LCB ${stateInference.leonaVsJaxTerminal.lcb95}）`
        : `贾克斯保留终局；蕾欧娜转核未过稳健门槛（LCB ${stateInference.leonaVsJaxTerminal.lcb95}）`,
      inference: currentCertified ? stateInference.jaxOneImmediate : stateInference.jaxTwoBridge,
      stateInference,
      sampleSupport: round((currentCertified ? stateInference.jaxOneImmediate : stateInference.jaxTwoBridge).probabilityPositive),
      comparedPolicies: POLICIES.map(policy => policy.id),
    },
  };
  assert(result.mechanismAblation.meanDelta > 0 && result.mechanismAblation.lcb95 > 0, "无情连打机制消融必须稳健为正");
  assert(result.rankings.every(row => Number.isFinite(row.utility) && Number.isFinite(row.cvar10)), "策略实验不得输出非有限数");
  assert(result.battles >= 5000, "策略实验战斗样本不得少于5000场");
  ensureOutputDirs();
  fs.writeFileSync(resultPath("augment_transition_results.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(reportPath("英雄强化条件化转型实验.md"), report(result));
  fs.writeFileSync(publicPath("augment-transition-data.js"), `window.AUGMENT_TRANSITION=${JSON.stringify(result)};`);
  console.log(`英雄强化条件化实验完成：${result.battles}场，对手${opponents.length}套`);
  result.rankings.forEach((row, index) => console.log(`${index + 1}. ${row.label}: ${row.utility} (CVaR ${row.cvar10})`));
  console.log(`贾克斯1星立即接管：LCB95 ${stateInference.jaxOneImmediate.lcb95}，认证=${currentCertified}`);
  console.log(`贾克斯2星桥接：LCB95 ${stateInference.jaxTwoBridge.lcb95}，认证=${handoffCertified}`);
  return result;
}

if (require.main === module) run();

module.exports = { run, rollForUnit, pairedInference, policySample, mechanismAblation };
