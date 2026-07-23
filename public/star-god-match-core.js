(function (root, factory) {
  const StarCore = typeof module === "object" && module.exports
    ? require("./star-god-core.js")
    : root.StarGodCore;
  const api = factory(StarCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StarGodMatchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (StarCore) {
  "use strict";

  // Live ranking is an asset-role model. No input order, previous winner, or
  // unobserved shop probability is allowed to alter the result.
  const MODEL = Object.freeze({
    version: "star-match-asset-role-v1",
    carryUnit: 28,
    stageUnit: 11,
    finalCoreUnit: 7,
    offRouteTraitFill: 2.5,
    carryItem: 18,
    tankItem: 10,
    routeItem: 6,
    carryComponent: 6.5,
    immediateCraftRatio: 0.8,
    blessingUtilityScale: 0.62,
    officialBlessingPrior: 3,
    researchPriorMax: 20,
    continuityMax: 10,
    missingFacePenalty: 0.85,
    lowInformationSignals: 2,
    closeRace: 6,
    starMultiplier: Object.freeze({ 1: 1, 2: 1.5, 3: 2.5 }),
  });

  const ALIASES = Object.freeze({
    女枪: "厄运小姐",
    龙王: "奥瑞利安·索尔",
    索尔: "奥瑞利安·索尔",
    EZ: "伊泽瑞尔",
    ez: "伊泽瑞尔",
    剑圣: "易",
    机器人: "布里茨",
    铁男: "莫德凯撒",
    大虫子: "科加斯",
    龙龟: "拉莫斯",
    腕豪: "瑟提",
    轮子妈: "希维尔",
    女警: "凯特琳",
    石头人: "墨菲特",
    鳄鱼: "雷克顿",
    剑魔: "亚托克斯",
  });

  function round(value, digits = 1) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
  }

  function uniq(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function normalizeUnit(unit) {
    if (typeof unit === "string") return { name: unit, star: 1 };
    return {
      name: String(unit?.name || unit?.value || ""),
      star: clamp(Number(unit?.star) || 1, 1, 3),
    };
  }

  function starCopies(star) {
    return Number(star) >= 3 ? 9 : Number(star) >= 2 ? 3 : 1;
  }

  function createState(overrides = {}) {
    return {
      level: 3,
      round: "2-1",
      hp: 100,
      gold: 10,
      units: [],
      items: [],
      blessings: [],
      offeredGodIds: [],
      componentDirection: "flexible",
      ...overrides,
      units: (overrides.units || []).map(normalizeUnit).filter(unit => unit.name),
      items: [...(overrides.items || [])].filter(Boolean),
      blessings: uniq(overrides.blessings || []),
      offeredGodIds: uniq((overrides.offeredGodIds || []).map(Number)),
    };
  }

  function stageWeights(level) {
    const lv = clamp(Number(level) || 1, 1, 10);
    const earlyRaw = 1 - sigmoid((lv - 4.6) * 1.55);
    const finalRaw = sigmoid((lv - 7.25) * 1.45);
    const middleRaw = Math.max(0.05, 1 - earlyRaw - finalRaw);
    const total = earlyRaw + middleRaw + finalRaw;
    return {
      early: round(earlyRaw / total, 4),
      middle: round(middleRaw / total, 4),
      final: round(finalRaw / total, 4),
    };
  }

  function targetStage(level) {
    if (Number(level) <= 4) return "early";
    if (Number(level) <= 7) return "middle";
    return "final";
  }

  function itemMaps(catalog) {
    const byName = new Map((catalog.items || []).map(item => [item.name, item]));
    const byId = new Map((catalog.items || []).map(item => [String(item.id), item]));
    return { byName, byId };
  }

  function componentsForItem(itemName, catalog) {
    const maps = itemMaps(catalog);
    const item = maps.byName.get(itemName);
    if (!item) return [];
    return (item.synthesis || []).map(id => maps.byId.get(String(id))).filter(row => row?.type === "基础装备").map(row => row.name);
  }

  function multiset(values) {
    return (values || []).reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
  }

  function canCraft(components, owned) {
    const need = multiset(components);
    const have = multiset(owned);
    for (const [name, count] of need) if ((have.get(name) || 0) < count) return false;
    return need.size > 0;
  }

  function routeItemSets(route) {
    const carryItems = [...(route.carry?.items || [])];
    const tankItems = [...(route.primaryTank?.items || [])];
    const allItems = [
      ...carryItems,
      ...tankItems,
      ...(route.secondaryCarries || []).flatMap(row => row.items || []),
    ];
    return { carryItems, tankItems, allItems };
  }

  function unitRoleScore(route, state, weights) {
    let score = 0;
    const evidence = [];
    const early = new Set(route.stages.early.map(row => row.name));
    const middle = new Set(route.stages.middle.map(row => row.name));
    const final = new Set(route.stages.final.map(row => row.name));
    for (const unit of state.units) {
      const multiplier = MODEL.starMultiplier[unit.star] || 1;
      if (unit.name === route.carry.name) {
        const value = MODEL.carryUnit * multiplier;
        score += value;
        evidence.push(`主C${unit.name}本体在手（${unit.star}星）+${round(value)}`);
        continue;
      }
      const stageAffinity = (early.has(unit.name) ? weights.early : 0)
        + (middle.has(unit.name) ? weights.middle : 0)
        + (final.has(unit.name) ? weights.final : 0);
      if (stageAffinity > 0) {
        const value = (MODEL.stageUnit * stageAffinity + (final.has(unit.name) ? MODEL.finalCoreUnit * weights.final : 0)) * multiplier;
        score += value;
        evidence.push(`${unit.name}命中阶段棋盘+${round(value)}`);
      }
    }
    return { score: round(score), evidence };
  }

  function itemRoleScore(route, state, catalog) {
    const sets = routeItemSets(route);
    let score = 0;
    const evidence = [];
    const ownedComponents = state.items.filter(name => catalog.items.some(item => item.name === name && item.type === "基础装备"));
    const ownedCompleted = multiset(state.items.filter(name => catalog.items.some(item => item.name === name && item.type !== "基础装备")));
    const carryNeed = multiset(sets.carryItems);
    const tankNeed = multiset(sets.tankItems);
    const routeNeed = multiset(sets.allItems);
    function consume(need, name) {
      const count = need.get(name) || 0;
      if (!count) return false;
      need.set(name, count - 1);
      return true;
    }
    for (const itemName of state.items) {
      if (consume(carryNeed, itemName)) {
        score += MODEL.carryItem;
        evidence.push(`主C核心装${itemName}+${MODEL.carryItem}`);
      } else if (consume(tankNeed, itemName)) {
        score += MODEL.tankItem;
        evidence.push(`主坦装备${itemName}+${MODEL.tankItem}`);
      } else if (consume(routeNeed, itemName)) {
        score += MODEL.routeItem;
        evidence.push(`路线装备${itemName}+${MODEL.routeItem}`);
      } else if ((route.carry.components || []).includes(itemName)) {
        score += MODEL.carryComponent;
        evidence.push(`主C散件${itemName}+${MODEL.carryComponent}`);
      }
    }
    const availableComponents = multiset(ownedComponents);
    for (const itemName of route.carry.items || []) {
      const completedCount = ownedCompleted.get(itemName) || 0;
      if (completedCount > 0) {
        ownedCompleted.set(itemName, completedCount - 1);
        continue;
      }
      const components = componentsForItem(itemName, catalog);
      const need = multiset(components);
      const craftable = need.size > 0 && [...need].every(([name, count]) => (availableComponents.get(name) || 0) >= count);
      if (craftable) {
        for (const [name, count] of need) availableComponents.set(name, (availableComponents.get(name) || 0) - count);
        const value = MODEL.carryItem * MODEL.immediateCraftRatio;
        score += value;
        evidence.push(`${components.join("+")}→${itemName}可立即合成+${round(value)}`);
      }
    }
    return { score: round(score), evidence };
  }

  function blessingMechanismAlignment(blessing, route, state) {
    const mechanism = blessing.mechanism;
    const avgCost = route.stages.final.reduce((sum, row) => sum + Number(row.cost || 0), 0) / Math.max(1, route.stages.final.length);
    const carryNeedsThree = route.carry.targetStar === 3;
    const itemGap = Math.max(0, 3 - state.items.filter(name => (route.carry.items || []).includes(name)).length);
    if (mechanism === "item") return 1 + itemGap * 0.14;
    if (mechanism === "unit-shop") return carryNeedsThree ? 1.28 : 0.96;
    if (mechanism === "economy" || mechanism === "delayed" || mechanism === "quest") return 0.85 + avgCost / 5 * 0.35;
    if (mechanism === "combat" || mechanism === "painted-hex") return 1.08;
    return 1;
  }

  function blessingRoleScore(route, state, catalog) {
    let score = 0;
    const evidence = [];
    for (const blessingId of state.blessings) {
      const blessing = catalog.blessings.find(row => String(row.id) === String(blessingId) || row.name === blessingId);
      if (!blessing) continue;
      const utility = StarCore.evaluateBlessing(blessing, StarCore.createState({
        stage: blessing.stage,
        round: `${blessing.stage}-4`,
        level: state.level,
        hp: state.hp,
        gold: state.gold,
        componentDirection: route.carry.direction || state.componentDirection,
      }));
      const alignment = blessingMechanismAlignment(blessing, route, state);
      const officialHint = (route.recommendedGods || []).some(row =>
        Number(row.stage) === Number(blessing.stage)
        && Number(row.godId) === Number(blessing.godId)
        && (row.blessingIds || []).map(String).includes(String(blessing.id))
      ) ? MODEL.officialBlessingPrior : 0;
      const value = utility.total * MODEL.blessingUtilityScale * alignment + officialHint;
      score += value;
      evidence.push(`${blessing.name}×${round(alignment, 2)}+${round(value)}${officialHint ? "（官方样本仅作小先验）" : ""}`);
    }
    return { score: round(score), evidence };
  }

  function currentCopies(state, name) {
    const unit = state.units.find(row => row.name === name);
    return unit ? starCopies(unit.star) : 0;
  }

  function gapProfile(route, state, stage) {
    const rows = route.stages[stage] || [];
    const gaps = [];
    let faceValue = 0;
    for (const row of rows) {
      const target = row.name === route.carry.name && stage === "final" ? (route.carry.targetStar === 3 ? 9 : 3) : 1;
      const owned = currentCopies(state, row.name);
      const missing = Math.max(0, target - owned);
      if (!missing) continue;
      const value = missing * Number(row.cost || 0);
      faceValue += value;
      gaps.push({ name: row.name, cost: row.cost, missing, faceValue: value, targetStar: row.name === route.carry.name ? route.carry.targetStar : 1 });
    }
    return { gaps, faceValue: round(faceValue) };
  }

  function normalizeResearchPrior(route, bounds) {
    if (bounds.max <= bounds.min) return MODEL.researchPriorMax / 2;
    return (route.researchScore - bounds.min) / (bounds.max - bounds.min) * MODEL.researchPriorMax;
  }

  function scoreRoute(route, stateInput, catalog, bounds) {
    const state = createState(stateInput);
    const weights = stageWeights(state.level);
    const stage = targetStage(state.level);
    const units = unitRoleScore(route, state, weights);
    const items = itemRoleScore(route, state, catalog);
    const blessings = blessingRoleScore(route, state, catalog);
    const gaps = gapProfile(route, state, stage);
    const prior = normalizeResearchPrior(route, bounds);
    const continuity = Number(route.continuity || 0) * MODEL.continuityMax;
    const gapPenalty = gaps.faceValue * MODEL.missingFacePenalty;
    const finalScore = round(units.score + items.score + blessings.score + prior + continuity - gapPenalty);
    return {
      ...route,
      finalScore,
      stageStrength: round(units.score + items.score + blessings.score + prior + continuity),
      parts: {
        units: units.score,
        items: items.score,
        blessings: blessings.score,
        researchPrior: round(prior),
        continuity: round(continuity),
        gapPenalty: round(gapPenalty),
      },
      evidence: [...units.evidence, ...items.evidence, ...blessings.evidence],
      weights,
      targetStage: stage,
      gap: gaps,
    };
  }

  function decisionMode(state, rows) {
    const signalCount = state.units.length + state.items.length + state.blessings.length;
    if (state.level <= 3 || signalCount < MODEL.lowInformationSignals) {
      return {
        kind: "observe",
        label: "继续观察",
        reason: "信息不足或等级≤3，只给过渡与上限参考，不锁终局。",
      };
    }
    const lead = rows.length > 1 ? rows[0].finalScore - rows[1].finalScore : 99;
    if (lead < MODEL.closeRace) {
      return {
        kind: "flex",
        label: "双线保留",
        reason: `前两路线仅差${round(lead)}分，先保留共用棋子与散件。`,
      };
    }
    return {
      kind: "execute",
      label: "当前首选",
      reason: `当前资产使首选领先${round(lead)}分；新信号录入后仍从零重算。`,
    };
  }

  function nextActions(top, state) {
    if (!top) return [];
    const stageRows = top.stages[top.targetStage] || [];
    const owned = new Set(state.units.map(row => row.name));
    const keep = stageRows.filter(row => owned.has(row.name)).map(row => row.name);
    const missing = top.gap.gaps.slice().sort((a, b) => a.faceValue - b.faceValue);
    const actions = [];
    if (keep.length) actions.push(`保留：${keep.slice(0, 5).join("、")}`);
    else actions.push(`当前先用${top.stages.early.slice(0, 5).map(row => row.name).join("、")}过渡`);
    const missingItem = (top.carry.items || []).find(name => !state.items.includes(name));
    if (missingItem) actions.push(`装备：为${top.carry.name}优先做${missingItem}`);
    if (missing.length) {
      const target = missing[0];
      actions.push(`下一张关键牌：${target.name}${target.missing > 1 ? `还缺${target.missing}张` : ""}，卡面价值${target.faceValue}金`);
    }
    const operation = String(top.operation || "").split(/[。；\n]/).map(text => text.trim()).find(Boolean);
    if (operation) actions.push(`运营：${operation}`);
    return actions.slice(0, 3);
  }

  function switchRadar(rows, state) {
    const current = rows[0];
    if (!current) return [];
    return rows.slice(1, 6).map(route => {
      const triggers = [];
      if (!state.units.some(unit => unit.name === route.carry.name)) triggers.push(`看到${route.carry.name}`);
      const missingItem = (route.carry.items || []).find(name => !state.items.includes(name));
      if (missingItem) triggers.push(`合出${missingItem}`);
      const bestBlessing = (route.recommendedGods || []).flatMap(row => row.blessingIds || [])[0];
      if (bestBlessing && !state.blessings.map(String).includes(String(bestBlessing))) triggers.push("眼前赐福命中路线");
      return {
        id: route.id,
        name: route.name,
        carry: route.carry.name,
        score: route.finalScore,
        deficit: round(current.finalScore - route.finalScore),
        triggers: triggers.slice(0, 2),
      };
    });
  }

  function rankRoutes(routeData, stateInput, catalog) {
    const state = createState(stateInput);
    const routes = routeData.routes || [];
    const scores = routes.map(route => Number(route.researchScore || 0));
    const bounds = { min: Math.min(...scores), max: Math.max(...scores) };
    const rows = routes.map(route => scoreRoute(route, state, catalog, bounds))
      .sort((a, b) => b.finalScore - a.finalScore || b.researchScore - a.researchScore || a.name.localeCompare(b.name, "zh-CN"));
    const mode = decisionMode(state, rows);
    return {
      state,
      mode,
      rows,
      top: rows[0] || null,
      actions: nextActions(rows[0], state),
      radar: switchRadar(rows, state),
    };
  }

  function parseStar(text) {
    const match = String(text || "").match(/([一二两三123])星/);
    if (!match) return 1;
    return ({ 一: 1, 二: 2, 两: 2, 三: 3, 1: 1, 2: 2, 3: 3 })[match[1]] || 1;
  }

  function parseSignals(text, catalog) {
    const source = String(text || "").trim();
    const normalized = Object.entries(ALIASES).reduce((value, [alias, name]) => value.replaceAll(alias, name), source);
    const units = [];
    const items = [];
    const blessings = [];
    const heroNames = (catalog.heroes || []).map(row => row.name).sort((a, b) => b.length - a.length);
    const itemNames = (catalog.items || []).map(row => row.name).sort((a, b) => b.length - a.length);
    const blessingNames = (catalog.blessings || []).map(row => row.name).sort((a, b) => b.length - a.length);
    for (const name of heroNames) {
      const index = normalized.indexOf(name);
      if (index < 0) continue;
      const window = normalized.slice(Math.max(0, index - 3), index + name.length + 3);
      units.push({ name, star: parseStar(window) });
    }
    for (const name of itemNames) {
      const count = normalized.split(name).length - 1;
      for (let index = 0; index < count; index += 1) items.push(name);
    }
    for (const name of blessingNames) if (normalized.includes(name)) {
      const blessing = catalog.blessings.find(row => row.name === name);
      if (blessing) blessings.push(blessing.id);
    }
    return {
      units: uniq(units.map(row => `${row.name}|${row.star}`)).map(value => {
        const [name, star] = value.split("|");
        return { name, star: Number(star) };
      }),
      items,
      blessings: uniq(blessings),
    };
  }

  function assertCore(routeData, catalog) {
    const state = createState({
      level: 7,
      hp: 68,
      gold: 32,
      units: [{ name: "厄运小姐", star: 2 }, { name: "茂凯", star: 2 }],
      items: ["朔极之矛", "暴风之剑", "拳套"],
    });
    const first = rankRoutes(routeData, state, catalog);
    const second = rankRoutes(routeData, state, catalog);
    if (JSON.stringify(first.rows.map(row => [row.id, row.finalScore])) !== JSON.stringify(second.rows.map(row => [row.id, row.finalScore]))) {
      throw new Error("同一最终状态必须得到同一排序");
    }
    if (!first.rows.slice(0, 5).some(row => row.carry.name === "厄运小姐")) throw new Error("女枪本体与朔极之矛未推动女枪路线");
    const low = rankRoutes(routeData, { level: 2, units: [{ name: "潘森", star: 1 }] }, catalog);
    if (low.mode.kind !== "observe") throw new Error("1-3级不得硬定终局");
    const route = routeData.routes.find(row => (row.recommendedGods || []).some(god => god.blessingIds?.length));
    const hint = route.recommendedGods.find(god => god.blessingIds?.length);
    const base = scoreRoute(route, createState({ level: 6 }), catalog, { min: 0, max: 400 });
    const blessed = scoreRoute(route, createState({ level: 6, blessings: [hint.blessingIds[0]] }), catalog, { min: 0, max: 400 });
    if (!(blessed.finalScore > base.finalScore)) throw new Error("实际赐福没有进入阵容重算");
    const parsed = parseSignals("两星女枪拿了朔极之矛", catalog);
    if (parsed.units[0]?.name !== "厄运小姐" || parsed.units[0]?.star !== 2 || !parsed.items.includes("朔极之矛")) {
      throw new Error("星神比赛输入解析失败");
    }
    const duplicates = parseSignals("反曲之弓反曲之弓", catalog);
    if (duplicates.items.filter(name => name === "反曲之弓").length !== 2) throw new Error("重复散件被错误去重");
    const invalid = first.rows.some(row => !Number.isFinite(row.finalScore) || /Infinity|NaN|999/.test(JSON.stringify(row)));
    if (invalid) throw new Error("路线输出含非法数值");
    return true;
  }

  function assertFixtures(routeData, catalog, fixtureData) {
    const outcomes = [];
    for (const fixture of fixtureData.hands || []) {
      const result = rankRoutes(routeData, fixture.state, catalog);
      const expectation = fixture.expect || {};
      if (expectation.mode && result.mode.kind !== expectation.mode) {
        throw new Error(`${fixture.id}: 期望模式${expectation.mode}，实际${result.mode.kind}`);
      }
      if (expectation.topCarry) {
        const within = Math.max(1, Number(expectation.topCarryWithin) || 1);
        const matched = result.rows.slice(0, within).some(row => row.carry.name === expectation.topCarry);
        if (!matched) {
          const actual = result.rows.slice(0, within).map(row => row.carry.name).join("、");
          throw new Error(`${fixture.id}: 前${within}主C应含${expectation.topCarry}，实际${actual}`);
        }
      }
      const topEvidence = result.top?.evidence || [];
      for (const fragment of expectation.evidenceIncludes || []) {
        if (!topEvidence.some(line => line.includes(fragment))) {
          throw new Error(`${fixture.id}: 首选证据缺少“${fragment}”`);
        }
      }
      outcomes.push({
        id: fixture.id,
        mode: result.mode.kind,
        top: result.top?.name || "",
        carry: result.top?.carry?.name || "",
        score: result.top?.finalScore ?? null,
      });
    }
    return outcomes;
  }

  return {
    MODEL,
    ALIASES,
    createState,
    stageWeights,
    targetStage,
    componentsForItem,
    scoreRoute,
    rankRoutes,
    parseSignals,
    assertCore,
    assertFixtures,
  };
});

if (typeof module === "object" && module.exports && require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const routeData = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/results/star-god-lineup-model.json"), "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/star-god/17.7/catalog.json"), "utf8"));
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/star-god-hands.json"), "utf8"));
  module.exports.assertCore(routeData, catalog);
  const outcomes = module.exports.assertFixtures(routeData, catalog, fixtures);
  console.log(`star-god-match-core assertions passed (${outcomes.length} fixtures)`);
}
