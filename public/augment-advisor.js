(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AugmentAdvisor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERIFIED_MECHANICS = {
    "高端购物": {
      effect: "商店按比当前等级高1级的概率刷新，并立刻获得3金币。",
      fit: "准备升人口并搜索高费核心牌时更容易兑现。",
      required: ["board", "economy", "stage"],
    },
    "光明圣物": {
      effect: "从5件光明武器中选1件，并获得装备拆卸器。",
      fit: "主C或主坦已经明确、且五选一能补关键装备时更容易兑现。",
      required: ["board", "items"],
    },
    "升级咯！": {
      effect: "立刻获得6经验；购买经验时额外获得2经验，并可升至10级。",
      fit: "经济允许持续购买经验、且阵容能从高人口或高费卡获益时更容易兑现。",
      required: ["board", "economy", "stage"],
    },
  };

  const CONTEXT_LABELS = {
    board: "当前棋盘/主C",
    items: "已有装备",
    economy: "金币",
    stage: "当前回合",
    health: "血量",
  };

  function signalKind(row) {
    return String(row && (row.kind || row.type) || "");
  }

  function assessContext(signals) {
    const rows = signals || [];
    const unitCount = rows.filter(row => signalKind(row) === "units").length;
    const itemCount = rows.filter(row => signalKind(row) === "items").length;
    const kinds = new Set(rows.map(signalKind));
    const known = {
      board: unitCount >= 3 || kinds.has("board") || kinds.has("traits"),
      items: itemCount >= 2 || kinds.has("itemState"),
      economy: kinds.has("gold") || kinds.has("economyState"),
      stage: kinds.has("stage") || kinds.has("rounds"),
      health: kinds.has("health"),
    };
    return { known, unitCount, itemCount };
  }

  function genericMechanic(option) {
    const cats = (option && option.cats) || [];
    if (cats.includes("经济")) return {
      effect: "经济类符文；当前尚无经过验证的专属反事实算子。",
      fit: "需要结合金币、经验、回合和目标人口判断兑现速度。",
      required: ["board", "economy", "stage"],
    };
    if (cats.includes("装备")) return {
      effect: "装备类符文；当前尚无经过验证的专属反事实算子。",
      fit: "需要结合主C、前排和已有散件判断装备收益。",
      required: ["board", "items"],
    };
    return {
      effect: "该符文尚未建立经过验证的专属反事实模型。",
      fit: "需要结合当前棋盘、装备和经营目标判断。",
      required: ["board", "items", "economy", "stage"],
    };
  }

  function describeOption(name, option, context, routeHits, marginal) {
    const mechanic = VERIFIED_MECHANICS[name] || genericMechanic(option);
    const missing = mechanic.required.filter(key => !context.known[key]);
    return {
      name,
      effect: mechanic.effect,
      fit: mechanic.fit,
      missing,
      missingLabels: missing.map(key => CONTEXT_LABELS[key]),
      routeHits: Number(routeHits) || 0,
      marginal: Number.isFinite(Number(marginal)) ? Number(marginal) : null,
      verifiedMechanic: Boolean(VERIFIED_MECHANICS[name]),
    };
  }

  function chooseRecommendation(rows, context, opts) {
    const options = opts || {};
    if (!options.counterfactualValidated) return { recommended: null, reason: "counterfactual-unvalidated" };
    if ((rows || []).some(row => row.missing && row.missing.length)) return { recommended: null, reason: "context-incomplete" };
    const ranked = [...(rows || [])].filter(row => Number.isFinite(row.marginal)).sort((a, b) => b.marginal - a.marginal);
    if (ranked.length < 2) return { recommended: null, reason: "insufficient-options" };
    const gap = ranked[0].marginal - ranked[1].marginal;
    if (gap < (Number(options.minGap) || 2)) return { recommended: null, reason: "score-gap-too-small", gap };
    return { recommended: ranked[0].name, reason: "validated", gap };
  }

  function buildComparison(options, signals, config) {
    const context = assessContext(signals);
    const rows = (options || []).map(row => describeOption(
      row.name,
      row.option,
      context,
      row.routeHits,
      row.marginal
    ));
    const decision = chooseRecommendation(rows, context, config);
    const missing = [...new Set(rows.flatMap(row => row.missingLabels))];
    return { context, rows, missing, ...decision };
  }

  function runTests() {
    const empty = buildComparison([
      { name: "高端购物", routeHits: 13, marginal: 0 },
      { name: "光明圣物", routeHits: 4, marginal: 0 },
      { name: "升级咯！", routeHits: 12, marginal: 0 },
    ], [], { counterfactualValidated: false });
    if (empty.recommended !== null) throw new Error("信息不足时不得推荐符文");
    if (!empty.missing.includes("金币") || !empty.missing.includes("已有装备")) throw new Error("缺失信息提示不完整");
    if (empty.rows[0].marginal !== 0) throw new Error("路线增量必须保留为增量而非绝对分");

    const completeSignals = [
      { kind: "units", value: "安妮" }, { kind: "units", value: "波比" }, { kind: "units", value: "娑娜" },
      { kind: "items", value: "无用大棒" }, { kind: "items", value: "女神之泪" },
      { kind: "gold", value: 50 }, { kind: "stage", value: "3-2" },
    ];
    const tied = buildComparison([
      { name: "高端购物", marginal: 4 }, { name: "升级咯！", marginal: 4 },
    ], completeSignals, { counterfactualValidated: true, minGap: 2 });
    if (tied.recommended !== null || tied.reason !== "score-gap-too-small") throw new Error("边际相同时不得默认第一张最佳");

    const unvalidated = buildComparison([
      { name: "高端购物", marginal: 8 }, { name: "升级咯！", marginal: 2 },
    ], completeSignals, { counterfactualValidated: false });
    if (unvalidated.recommended !== null) throw new Error("未验证的反事实模型不得标记最佳");
  }

  const api = { VERIFIED_MECHANICS, assessContext, describeOption, chooseRecommendation, buildComparison };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
