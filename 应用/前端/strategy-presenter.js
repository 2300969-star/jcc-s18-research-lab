(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.StrategyPresenter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function uniq(rows) {
    return [...new Set((rows || []).filter(Boolean).map(String))];
  }

  function stripStar(value) {
    return String(value || "").replace(/[·\s]*\d+星/g, "").trim();
  }

  function normalizeUnit(row) {
    if (typeof row === "string") {
      const match = row.match(/[·\s](\d+)星/);
      return { name: stripStar(row), star: match ? Number(match[1]) : 0, location: "unknown" };
    }
    return {
      name: stripStar(row && (row.name || row.value || row.label)),
      star: Number(row && row.star) || 0,
      location: row && row.location || "unknown",
    };
  }

  function routeCarry(row, contract) {
    return stripStar(contract && contract.facts && contract.facts.carry
      || row && row.template && row.template.routeProfile && row.template.routeProfile.mainCarry && row.template.routeProfile.mainCarry.name
      || row && row.template && row.template.carryUnits && row.template.carryUnits[0]);
  }

  function routeFamily(row, decision) {
    return String(decision && decision.executionFamily
      || row && row.template && (row.template.family || row.template.name)
      || "候选路线");
  }

  function selectedUnitMap(selected) {
    const map = new Map();
    (selected && selected.units || []).map(normalizeUnit).filter(row => row.name).forEach(row => {
      const previous = map.get(row.name);
      if (!previous || row.star > previous.star) map.set(row.name, row);
    });
    return map;
  }

  function knownNumber(value) {
    const number = Number(value);
    return value !== "unknown" && value !== "" && value != null && Number.isFinite(number) ? number : null;
  }

  function stabilizationState(selected) {
    const provided = selected && selected.stabilization;
    if (provided && typeof provided.urgent === "boolean") return provided;
    const health = knownNumber(selected && selected.health);
    const trend = selected && selected.healthTrend || {};
    const recentLoss = Math.max(0, Number(trend.recentLoss) || 0);
    const consecutiveLosses = Math.max(0, Number(trend.consecutiveLosses) || 0);
    const critical = health != null && health <= 20;
    const urgent = critical || health != null && (health <= 35 || health <= 55 && recentLoss >= 15 || health <= 60 && consecutiveLosses >= 2);
    return { urgent, critical, recentLoss, consecutiveLosses, reasons: [] };
  }

  function resourceIntent(selected, severity) {
    const health = knownNumber(selected && selected.health);
    const gold = knownNumber(selected && selected.gold);
    const level = knownNumber(selected && selected.level) || 1;
    if (stabilizationState(selected).urgent) return "本回合提质量";
    if (severity === "red") return "停止远期投入";
    if (severity === "yellow") return "等待转型门槛";
    if (health != null && gold != null && health >= 70 && gold >= 40 && level <= 6) return "存钱留分支";
    if (health != null && gold != null && health >= 55 && gold >= 30) return "稳经济保血";
    if (level <= 4) return "先保血";
    return "补现板质量";
  }

  function heroAugmentContext(selected) {
    const chosen = selected && selected.heroAugment && selected.heroAugment.selected;
    if (!chosen) return { name: "", hero: "" };
    const effect = chosen.effect || {};
    return { name: String(chosen.name || ""), hero: stripStar(effect.grantedHero || chosen.hero) };
  }

  function contractFacts(contract, field) {
    return uniq(contract && contract[field] && contract[field].facts || []);
  }

  function buildContext(input) {
    const ctx = input || {};
    const selected = ctx.selected || {};
    const decision = ctx.decision || {};
    const row = ctx.executionRow || {};
    const contract = ctx.actionContract || decision.actionContract || {};
    const family = routeFamily(row, decision);
    const candidateName = String(row && row.template && row.template.name || decision.executionName || family);
    const carry = routeCarry(row, contract);
    const currentCarry = stripStar(decision.currentBoardCarry);
    const units = selectedUnitMap(selected);
    const carryUnit = units.get(carry) || null;
    const currentCarryUnit = units.get(currentCarry) || null;
    const contractFactsRow = contract.facts || {};
    const currentStar = Math.max(Number(contractFactsRow.currentStar) || 0, carryUnit && carryUnit.star || 0);
    const heldCoreItems = uniq(contractFactsRow.heldCoreItems || []);
    const missingCoreItems = uniq(contractFactsRow.missingCoreItems || []);
    const itemGoal = Math.max(0, Number(contractFactsRow.itemGoal) || 0);
    const targetStar = Math.max(2, Number(contractFactsRow.targetStar) || 2);
    const routeCarryReady = Boolean(carry && currentCarry === carry && currentStar >= 2
      && (!itemGoal || heldCoreItems.length >= 1));
    const augment = heroAugmentContext(selected);
    const level = knownNumber(selected.level) || knownNumber(decision.level) || 1;
    const health = knownNumber(selected.health);
    const gold = knownNumber(selected.gold);
    const rawStage = String(selected.stage || selected.currentStage || "").trim();
    const stage = rawStage && rawStage !== "unknown" ? rawStage : "";
    const stabilization = stabilizationState(selected);
    const severity = stabilization.urgent ? "red"
      : decision.forecast && decision.forecast.warning && decision.forecast.warning.severity || "green";
    const intent = resourceIntent(selected, severity);
    const boardUnits = uniq((decision.currentBoardUnits || []).map(row => stripStar(normalizeUnit(row).name))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const traits = uniq((decision.currentBoardTraits || []).map(row => typeof row === "string" ? row : row && (row.label || `${row.count || ""}${row.name || ""}`))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const bench = uniq((decision.currentBoardBench || []).map(row => stripStar(normalizeUnit(row).name))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const currentAugment = Boolean(augment.name && augment.hero && augment.hero === currentCarry);

    let title;
    let badge;
    if (stabilization.urgent) {
      const lowHealth = health != null && health <= 35;
      title = `${currentAugment ? `${augment.name}·` : ""}${currentCarry || "当前最强板"}${lowHealth ? "保命" : "止血"} · ${intent}`;
      badge = lowHealth ? "立即止血" : "提前止血";
    } else if (routeCarryReady) {
      title = `${carry}承接成型 · ${family}`;
      badge = "可以换入";
    } else if (currentCarry) {
      title = `${currentAugment ? `${augment.name}·` : ""}${currentCarry}过渡 · ${level}级${intent}`;
      badge = currentAugment ? "强化过渡" : "当前过渡";
    } else {
      title = `最强板过渡 · ${level}级${intent}`;
      badge = "继续观察";
    }

    const stateFacts = uniq([
      stage && `回合${stage}`,
      `${level}级`,
      health != null && `${health}血`,
      gold != null && `${gold}金`,
      currentCarry && `当前C${currentCarry}${currentCarryUnit && currentCarryUnit.star ? `${currentCarryUnit.star}星` : ""}`,
    ]);
    const reasons = [];
    if (currentCarry) reasons.push(`${currentCarry}是当前最强板的主要输出，当前动作先围绕已持有战力，而不是候选终局名字。`);
    if (currentAugment) reasons.push(`${augment.name}绑定${augment.hero}，强化收益已经在当前上场与主C判断中生效。`);
    if (health != null && gold != null) {
      if (stabilization.urgent) reasons.push(`${health}血、${gold}金${stabilization.recentLoss ? `、最近掉${stabilization.recentLoss}血` : ""}已触发${stabilization.critical ? "保命" : "提前止血"}，赢下一轮的价值高于利息和远期换线。`);
      else if (health >= 70 && gold >= 40) reasons.push(`${health}血、${gold}金容错较高，可以保留经济和转型选择权。`);
      else reasons.push(`${health}血、${gold}金需要兼顾现板质量与经济，不能只按阵容模板硬冲。`);
    } else reasons.push("血量或金币尚未完整录入，暂不把经济动作说死。 ");
    if (carry && carry !== currentCarry) reasons.push(`${carry}不是当前主C，且尚未达到承接门槛，因此${candidateName}只作为条件候选。`);
    else if (routeCarryReady) reasons.push(`${carry}${currentStar}星并已有${heldCoreItems.length}件核心装，当前主C与候选路线主C一致，才允许进入换线执行。`);

    const satisfied = [];
    if (boardUnits.length) satisfied.push(`当前可上场${boardUnits.length}张：${boardUnits.join("、")}`);
    if (traits.length) satisfied.push(`已激活羁绊：${traits.join("、")}`);
    if (currentCarry) satisfied.push(`当前主C：${currentCarry}${currentCarryUnit && currentCarryUnit.star ? `${currentCarryUnit.star}星` : ""}`);
    if (currentAugment) satisfied.push(`英雄强化：${augment.name} → ${augment.hero}`);
    if (carryUnit) satisfied.push(`候选主C${carry}已持有${currentStar ? `，当前${currentStar}星` : ""}`);
    if (heldCoreItems.length) satisfied.push(`${carry}核心装已持有：${heldCoreItems.join("、")}`);

    const gaps = [];
    if (carry && !carryUnit) gaps.push(`还没有${carry}，不能提前显示“主C${carry}”或为它拆板`);
    else if (carry && currentStar < 2) gaps.push(`${carry}当前${currentStar || 1}星，至少两星后再判断能否接管输出`);
    if (carry && itemGoal && heldCoreItems.length < itemGoal) gaps.push(`${carry}核心装${heldCoreItems.length}/${itemGoal}${missingCoreItems.length ? `，缺${missingCoreItems.slice(0, 2).join("或")}` : ""}`);
    if (row.antiFragile && row.antiFragile.bottleneckText) gaps.push(`路线最大风险：${row.antiFragile.bottleneckText}`);
    uniq([...(row.missing || []), ...(row.penalties || [])]).slice(0, 3).forEach(line => gaps.push(line));
    if (!gaps.length) gaps.push("当前没有必须立刻补的硬缺口，继续按行动条件滚动检查");

    const now = contractFacts(contract, "now");
    const check = contractFacts(contract, "check");
    const stay = contractFacts(contract, "stay");
    const switchWhen = uniq(contract.switchWhen || []);
    const meta = routeCarryReady
      ? `${stateFacts.join(" · ")}；${carry}已达到承接条件，可按${family}逐张换入。`
      : `${stateFacts.join(" · ")}；${carry && carry !== currentCarry ? `${carry}未接管输出，先用${currentCarry || "现板"}打工。` : "继续按当前最强板处理。"}`;

    return {
      title,
      badge,
      meta,
      severity,
      intent,
      family,
      candidateName,
      currentCarry,
      routeCarry: carry,
      routeCarryReady,
      boardUnits,
      bench,
      traits,
      heroAugment: augment,
      reasons: uniq(reasons.map(row => row.trim())),
      satisfied: uniq(satisfied),
      gaps: uniq(gaps),
      now,
      check,
      stay,
      switchWhen,
      checkpoint: String(contract.checkpoint || ""),
      stateFacts,
    };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function fixture(overrides) {
    const input = {
      selected: {
        level: 4, stage: "2-2", health: 82, gold: 20,
        units: [{ name: "亚索", star: 1 }, { name: "雷克顿", star: 2 }],
        heroAugment: { selected: { name: "浪客之风", hero: "亚索", effect: { grantedHero: "亚索" } } },
      },
      decision: {
        currentBoardCarry: "亚索·1星",
        currentBoardUnits: ["亚索·1星", "雷克顿·2星"],
        currentBoardTraits: [{ name: "决斗大师", count: 2, label: "2决斗大师" }],
        currentBoardBench: [],
        executionFamily: "决斗",
      },
      executionRow: {
        template: { name: "鸟盾劫6决斗大师", family: "决斗", carryUnits: ["劫"] },
        missing: ["缺劫"], penalties: [],
        antiFragile: { bottleneckText: "主C劫未到" },
      },
      actionContract: {
        checkpoint: "3-2",
        facts: { carry: "劫", currentStar: 0, targetStar: 2, heldCoreItems: [], missingCoreItems: ["无尽之刃", "最后的轻语"], itemGoal: 2 },
        now: { facts: ["维持当前最强板"] },
        check: { facts: ["3-2检查现板质量"] },
        stay: { facts: ["劫未成型前不拆板"] },
        switchWhen: ["劫两星且有两件核心装再换线"],
      },
    };
    return { ...input, ...(overrides || {}) };
  }

  function runTests() {
    const yasuo = buildContext(fixture());
    assert(yasuo.title.includes("亚索") && !yasuo.title.includes("主C劫") && !yasuo.routeCarryReady,
      "有浪客亚索但无劫时，标题必须描述亚索过渡，不能提前宣称主C劫");
    assert(yasuo.gaps.some(line => line.includes("没有劫")), "详情必须明确终局主C缺口");
    const zedInput = fixture();
    zedInput.selected = { ...zedInput.selected, units: [{ name: "劫", star: 2 }, { name: "亚索", star: 2 }] };
    zedInput.decision = { ...zedInput.decision, currentBoardCarry: "劫·2星", currentBoardUnits: ["劫·2星", "亚索·2星"] };
    zedInput.actionContract = { ...zedInput.actionContract, facts: { ...zedInput.actionContract.facts, currentStar: 2, heldCoreItems: ["无尽之刃", "最后的轻语"], missingCoreItems: [] } };
    const zed = buildContext(zedInput);
    assert(zed.routeCarryReady && zed.title.includes("劫承接成型"), "劫达到承接条件后才允许进入终局执行标题");
    const dyingInput = fixture();
    dyingInput.selected = { ...dyingInput.selected, health: 24, gold: 38 };
    const dying = buildContext(dyingInput);
    assert(dying.title !== yasuo.title && dying.title.includes("保命") && dying.reasons.some(line => line.includes("24血") && line.includes("38金")),
      "血量与金币变化必须改变策略标题和原因");
    const losingInput = fixture();
    losingInput.selected = {
      ...losingInput.selected,
      stage: "4-2",
      health: 47,
      gold: 50,
      healthTrend: { recentLoss: 23, consecutiveLosses: 1 },
      stabilization: { urgent: true, critical: false, recentLoss: 23, reasons: ["上一检查点掉23血"] },
    };
    const losing = buildContext(losingInput);
    assert(losing.badge === "提前止血" && losing.title.includes("止血")
      && losing.reasons.some(line => line.includes("47血") && line.includes("掉23血")),
      "未低于35血但刚大入时，展示层也必须进入提前止血，不得继续显示普通过渡");
    const richInput = fixture();
    richInput.selected = { ...richInput.selected, health: 82, gold: 45 };
    const rich = buildContext(richInput);
    assert(rich.title !== yasuo.title && rich.title.includes("存钱留分支") && rich.meta.includes("45金"),
      "同血量下金币与等级允许时，策略必须从保血改为存钱留分支");
    const reversedInput = fixture();
    reversedInput.selected = { ...reversedInput.selected, units: [...reversedInput.selected.units].reverse() };
    reversedInput.decision = { ...reversedInput.decision, currentBoardUnits: [...reversedInput.decision.currentBoardUnits].reverse() };
    const reversed = buildContext(reversedInput);
    assert(JSON.stringify(yasuo) === JSON.stringify(reversed), "输入顺序变化不得改变局面表达结论");
    const primary = JSON.stringify({ title: yasuo.title, meta: yasuo.meta, reasons: yasuo.reasons, satisfied: yasuo.satisfied, gaps: yasuo.gaps });
    assert(!/承诺净值=|抗脆弱=|蒙特卡洛/.test(primary), "首屏局面结论不得泄露内部公式");
    console.log("strategy-presenter assertions passed");
  }

  return { stripStar, buildContext, runTests };
});

if (typeof module === "object" && module.exports && require.main === module) module.exports.runTests();
