"use strict";

// 六条研究线共用的纯函数：动态策略、尾部风险、有限牌池、Shapley归因和交互效应。
// 这些函数不保存任何阵容答案，也不读取前端状态。

const PLACEMENT_UTILITY = { 1: 1, 2: 0.65, 3: 0.35, 4: 0.1, 5: -0.15, 6: -0.45, 7: -0.8, 8: -1.2 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function mean(values) {
  const rows = (values || []).map(Number).filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
}

function placementUtility(rank) {
  return PLACEMENT_UTILITY[Number(rank)] ?? -1.2;
}

function lowerCvar(values, alpha = 0.1) {
  const rows = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return 0;
  const count = Math.max(1, Math.ceil(rows.length * clamp(alpha, 0.001, 1)));
  return mean(rows.slice(0, count));
}

function robustPolicyScore(values, options = {}) {
  const expected = mean(values);
  const cvar = lowerCvar(values, options.alpha ?? 0.1);
  const riskAversion = clamp(options.riskAversion ?? 0.45, 0, 2);
  return {
    expected,
    cvar,
    downside: expected - cvar,
    score: expected - riskAversion * (expected - cvar),
  };
}

function finitePoolSlotProbability(costOddsPct, copiesRemaining, totalCostCopiesRemaining) {
  if (copiesRemaining <= 0 || totalCostCopiesRemaining <= 0) return 0;
  return clamp(Number(costOddsPct) / 100, 0, 1) * clamp(copiesRemaining / totalCostCopiesRemaining, 0, 1);
}

function binomialAtLeast(trials, probability, need) {
  const n = Math.max(0, Math.floor(Number(trials) || 0));
  const p = clamp(probability, 0, 1);
  const k = Math.max(0, Math.floor(Number(need) || 0));
  if (k <= 0) return 1;
  if (n < k || p <= 0) return 0;
  if (p >= 1) return 1;
  let term = Math.pow(1 - p, n);
  let below = term;
  for (let i = 1; i < k; i += 1) {
    term *= ((n - i + 1) / i) * (p / (1 - p));
    below += term;
  }
  return clamp(1 - below, 0, 1);
}

function transitionPolicyValue(stageRewards, transitionCosts, gamma = 0.96) {
  const rewards = stageRewards || [];
  const costs = transitionCosts || [];
  return rewards.reduce((sum, reward, index) => {
    const edgeCost = index > 0 ? Number(costs[index - 1]) || 0 : 0;
    return sum + Math.pow(gamma, index) * ((Number(reward) || 0) - edgeCost);
  }, 0);
}

function factorial(n) {
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

function subsets(values) {
  const rows = values || [];
  const out = [];
  for (let mask = 0; mask < 2 ** rows.length; mask += 1) {
    const subset = [];
    rows.forEach((value, index) => { if (mask & (1 << index)) subset.push(value); });
    out.push(subset);
  }
  return out;
}

function shapleyValues(players, coalitionValue) {
  const names = [...new Set(players || [])];
  if (names.length > 12) throw new Error("精确Shapley最多支持12个组件，请先按角色聚合");
  const n = names.length;
  const denominator = factorial(n);
  const result = {};
  names.forEach(player => {
    const others = names.filter(name => name !== player);
    result[player] = subsets(others).reduce((sum, coalition) => {
      const weight = factorial(coalition.length) * factorial(n - coalition.length - 1) / denominator;
      return sum + weight * (coalitionValue([...coalition, player]) - coalitionValue(coalition));
    }, 0);
  });
  return result;
}

function pairInteraction(players, first, second, coalitionValue) {
  const names = [...new Set(players || [])];
  if (!names.includes(first) || !names.includes(second) || first === second) throw new Error("交互组件必须是两个不同的有效成员");
  if (names.length > 12) throw new Error("精确交互最多支持12个组件，请先按角色聚合");
  const others = names.filter(name => name !== first && name !== second);
  const denominator = factorial(Math.max(1, names.length - 1));
  return subsets(others).reduce((sum, coalition) => {
    const delta = coalitionValue([...coalition, first, second])
      - coalitionValue([...coalition, first])
      - coalitionValue([...coalition, second])
      + coalitionValue(coalition);
    const weight = factorial(coalition.length) * factorial(names.length - coalition.length - 2) / denominator;
    return sum + weight * delta;
  }, 0);
}

function lineupObjective(metrics, coefficients = {}) {
  const c = {
    combat: 1,
    transition: 0.55,
    flexibility: 0.35,
    gold: 0.04,
    fragility: 0.7,
    ...coefficients,
  };
  return c.combat * (Number(metrics.combat) || 0)
    + c.transition * (Number(metrics.transition) || 0)
    + c.flexibility * (Number(metrics.flexibility) || 0)
    - c.gold * (Number(metrics.goldCost) || 0)
    - c.fragility * (Number(metrics.fragility) || 0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runTests() {
  assert(placementUtility(1) > placementUtility(4) && placementUtility(4) > placementUtility(8), "名次效用必须单调下降");
  const risk = robustPolicyScore([1, 0.8, 0.7, -1], { alpha: 0.25, riskAversion: 0.5 });
  assert(risk.cvar === -1 && risk.score < risk.expected, "CVaR必须惩罚尾部风险");
  assert(Math.abs(finitePoolSlotProbability(30, 9, 90) - 0.03) < 1e-9, "有限牌池单格概率错误");
  assert(binomialAtLeast(10, 0.5, 1) > 0.99 && binomialAtLeast(2, 0.1, 3) === 0, "二项命中概率错误");
  assert(transitionPolicyValue([10, 20], [5], 1) === 25, "转阵路径价值错误");
  const value = coalition => {
    const set = new Set(coalition);
    return (set.has("贾克斯") ? 10 : 0) + (set.has("羊刀") ? 6 : 0) + (set.has("贾克斯") && set.has("羊刀") ? 8 : 0);
  };
  const shapley = shapleyValues(["贾克斯", "羊刀"], value);
  assert(Math.abs(shapley["贾克斯"] - 14) < 1e-9 && Math.abs(shapley["羊刀"] - 10) < 1e-9, "Shapley归因错误");
  assert(Math.abs(pairInteraction(["贾克斯", "羊刀"], "贾克斯", "羊刀", value) - 8) < 1e-9, "二阶交互错误");
  console.log("research-metrics assertions passed");
}

if (require.main === module) runTests();

module.exports = {
  PLACEMENT_UTILITY,
  mean,
  placementUtility,
  lowerCvar,
  robustPolicyScore,
  finitePoolSlotProbability,
  binomialAtLeast,
  transitionPolicyValue,
  shapleyValues,
  pairInteraction,
  lineupObjective,
  runTests,
};
