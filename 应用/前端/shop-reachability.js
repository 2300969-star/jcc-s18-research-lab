(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ShopReachability = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_TRIALS = 720;
  const REROLL_COST = 2;
  const SHOP_SLOTS = 5;
  const CACHE_LIMIT = 1200;
  const cache = new Map();

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const stableText = value => String(value == null ? "" : value);
  const targetKey = target => `${target.name}|${target.cost}|${target.targetCopies}`;

  function hashSeed(value) {
    let h = 2166136261;
    const text = stableText(value);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0 || 1;
  }

  function rng(seed) {
    let state = Number(seed) >>> 0 || 1;
    return function random() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function sampleIndex(weights, random) {
    const total = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total <= 0) return -1;
    let cursor = random() * total;
    for (let i = 0; i < weights.length; i++) {
      cursor -= Math.max(0, Number(weights[i]) || 0);
      if (cursor < 0) return i;
    }
    return weights.length - 1;
  }

  function normalizedTargets(targets) {
    const byName = new Map();
    (targets || []).filter(row => row && row.name).forEach(row => {
      const current = byName.get(row.name);
      const normalized = {
        name: row.name,
        cost: clamp(Number(row.cost) || 1, 1, 5),
        ownedCopies: Math.max(0, Number(row.ownedCopies) || 0),
        targetCopies: Math.max(1, Number(row.targetCopies) || 1),
        priority: Math.max(1, Number(row.priority) || 1),
        role: row.role || "unit",
      };
      if (!current || normalized.targetCopies > current.targetCopies) byName.set(row.name, normalized);
    });
    return [...byName.values()].sort((a, b) => b.priority - a.priority || a.cost - b.cost || a.name.localeCompare(b.name, "zh-CN"));
  }

  function percentile(sorted, ratio) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
  }

  function simulatePackage(input) {
    const oddsData = input && input.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const poolCopies = oddsData.poolCopies || {};
    const targets = normalizedTargets(input && input.targets);
    const level = clamp(Number(input && input.level) || 6, 1, 9);
    const effectiveLevel = clamp(level + (Number(input && input.shopLevelOffset) || 0), 1, 10);
    const gold = Math.max(0, Number(input && input.gold) || 0);
    const trials = Math.max(60, Number(input && input.trials) || DEFAULT_TRIALS);
    const freeRerolls = Math.max(0, Number(input && input.freeRerolls) || 0);
    const copyCredits = input && input.copyCredits || {};
    const knownOwnedByCost = input && input.knownOwnedByCost || {};
    const signature = JSON.stringify({
      id: input && input.id,
      targets: targets.map(targetKey),
      owned: targets.map(row => row.ownedCopies),
      level,
      effectiveLevel,
      gold,
      freeRerolls,
      copyCredits,
      knownOwnedByCost,
    });
    const baseSeed = Number(input && input.seed) || hashSeed(signature);
    const cacheKey = `${oddsData.version || "odds"}|${trials}|${baseSeed}|${signature}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const completeFlags = [];
    const targetComplete = Object.fromEntries(targets.map(row => [row.name, 0]));
    const remainingTotals = [];
    const rerollsUsed = [];
    const targetRemainingSamples = Object.fromEntries(targets.map(row => [row.name, []]));

    for (let trial = 0; trial < trials; trial++) {
      const random = rng((baseSeed + Math.imul(trial + 1, 2654435761)) >>> 0);
      let wallet = gold;
      let free = freeRerolls;
      let rerolls = 0;
      const owned = Object.fromEntries(targets.map(row => [row.name, Math.min(row.targetCopies, row.ownedCopies + Math.max(0, Number(copyCredits[row.name]) || 0))]));
      const persistentTargetPool = Object.fromEntries(targets.map(row => [row.name, Math.max(0, (Number(poolCopies[row.cost]) || 0) - owned[row.name])]));

      const complete = () => targets.every(row => owned[row.name] >= row.targetCopies);
      while (!complete() && (free > 0 || wallet >= REROLL_COST)) {
        if (free > 0) free--;
        else wallet -= REROLL_COST;
        rerolls++;
        const tempTargetPool = { ...persistentTargetPool };
        const tempTotalPool = {};
        for (let cost = 1; cost <= 5; cost++) {
          const total = (Number(unitCounts[cost]) || 0) * (Number(poolCopies[cost]) || 0);
          tempTotalPool[cost] = Math.max(1, total - Math.max(0, Number(knownOwnedByCost[cost]) || 0));
        }
        for (let slot = 0; slot < SHOP_SLOTS; slot++) {
          const tierIndex = sampleIndex(shopOdds[effectiveLevel] || [], random);
          if (tierIndex < 0) continue;
          const cost = tierIndex + 1;
          const eligible = targets.filter(row => row.cost === cost && owned[row.name] < row.targetCopies && tempTargetPool[row.name] > 0);
          const targetWeights = eligible.map(row => tempTargetPool[row.name]);
          const targetWeight = targetWeights.reduce((sum, value) => sum + value, 0);
          const totalPool = Math.max(targetWeight, tempTotalPool[cost]);
          const hitTarget = random() < targetWeight / totalPool;
          if (!hitTarget) {
            tempTotalPool[cost] = Math.max(1, tempTotalPool[cost] - 1);
            continue;
          }
          const pickedIndex = sampleIndex(targetWeights, random);
          const picked = eligible[pickedIndex];
          if (!picked) continue;
          tempTargetPool[picked.name]--;
          tempTotalPool[cost] = Math.max(1, tempTotalPool[cost] - 1);
          if (wallet >= cost) {
            wallet -= cost;
            owned[picked.name]++;
            persistentTargetPool[picked.name] = Math.max(0, persistentTargetPool[picked.name] - 1);
          }
        }
      }

      const done = complete();
      completeFlags.push(done ? 1 : 0);
      rerollsUsed.push(rerolls);
      let remaining = 0;
      targets.forEach(row => {
        const gap = Math.max(0, row.targetCopies - owned[row.name]);
        remaining += gap;
        targetRemainingSamples[row.name].push(gap);
        if (gap === 0) targetComplete[row.name]++;
      });
      remainingTotals.push(remaining);
    }

    const completionRate = completeFlags.reduce((sum, value) => sum + value, 0) / trials;
    const targetRates = targets.map(row => ({
      name: row.name,
      role: row.role,
      cost: row.cost,
      ownedCopies: row.ownedCopies,
      targetCopies: row.targetCopies,
      need: Math.max(0, row.targetCopies - row.ownedCopies - Math.max(0, Number(copyCredits[row.name]) || 0)),
      cardValueGold: Math.max(0, row.targetCopies - row.ownedCopies - Math.max(0, Number(copyCredits[row.name]) || 0)) * row.cost,
      completionRate: targetComplete[row.name] / trials,
      medianRemaining: percentile([...targetRemainingSamples[row.name]].sort((a, b) => a - b), 0.5),
    })).sort((a, b) => a.completionRate - b.completionRate || b.need - a.need || a.name.localeCompare(b.name, "zh-CN"));
    const sortedRemaining = [...remainingTotals].sort((a, b) => a - b);
    const sortedRerolls = [...rerollsUsed].sort((a, b) => a - b);
    const cardValueGold = targetRates.reduce((sum, row) => sum + row.cardValueGold, 0);
    const result = {
      id: input && input.id || "package",
      label: input && input.label || "关键包",
      level,
      effectiveLevel,
      gold,
      budgetSource: input && input.budgetSource || "input",
      trials,
      completionRate,
      completionPct: Math.round(completionRate * 1000) / 10,
      targets: targetRates,
      bottleneck: targetRates[0] || null,
      cardValueGold,
      medianRemaining: percentile(sortedRemaining, 0.5),
      p90Remaining: percentile(sortedRemaining, 0.9),
      medianRerolls: percentile(sortedRerolls, 0.5),
      assumptions: {
        poolCopies: oddsData.evidence && oddsData.evidence.poolCopies || "unknown",
        opponents: "unknown-not-subtracted",
        mechanismProgress: input && input.mechanismProgress || "confirmed-only",
      },
    };
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, result);
    return result;
  }

  function runTests() {
    const oddsData = {
      shopOdds: { 4: [55, 30, 15, 0, 0], 8: [16, 20, 35, 25, 4], 9: [9, 15, 30, 30, 16] },
      unitCounts: { 1: 13, 2: 13, 3: 14, 4: 13, 5: 8 },
      poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
      evidence: { poolCopies: "unverified-prior" },
    };
    const target = [{ name: "贾克斯", cost: 3, ownedCopies: 3, targetCopies: 9, priority: 5, role: "mainCarry" }];
    const a = simulatePackage({ id: "jax", targets: target, level: 8, gold: 50, oddsData, trials: 360, seed: 7 });
    const b = simulatePackage({ id: "jax", targets: target, level: 8, gold: 50, oddsData, trials: 360, seed: 7 });
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("同一状态必须得到相同联合模拟结果");
    if (a.cardValueGold !== 18) throw new Error(`缺6张3费牌值应为18金，实际${a.cardValueGold}`);
    const poor = simulatePackage({ id: "poor", targets: target, level: 4, gold: 20, oddsData, trials: 360, seed: 7 });
    const rich = simulatePackage({ id: "rich", targets: target, level: 8, gold: 80, oddsData, trials: 360, seed: 7 });
    if (!(rich.completionRate > poor.completionRate)) throw new Error("更高等级与预算应提高关键包完成率");
    const impossible = simulatePackage({ id: "five", targets: [{ name: "蕾欧娜", cost: 5, ownedCopies: 0, targetCopies: 1 }], level: 4, gold: 100, oddsData, trials: 120, seed: 8 });
    if (impossible.completionRate !== 0 || impossible.cardValueGold !== 5) throw new Error("0概率目标应为0%但牌值仍为面值");
    const text = JSON.stringify([a, poor, rich, impossible]);
    if (/Infinity|NaN|999/.test(text)) throw new Error("联合模拟不得产生坏数字哨兵");
    console.log("shop-reachability assertions passed");
  }

  const api = { DEFAULT_TRIALS, REROLL_COST, SHOP_SLOTS, hashSeed, simulatePackage, runTests };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
