(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AugmentStrategist = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 12000;
  const VALID_DIMENSIONS = new Set(["board", "bench", "star", "items", "traits", "level", "round", "gold", "health", "route", "commitment", "augment-interaction"]);

  function uniq(rows) {
    return [...new Set((rows || []).filter(Boolean))];
  }

  function stripStar(name) {
    return String(name || "").replace(/·\d星$/, "");
  }

  function compactName(value) {
    return String(value || "").replace(/[\s!！?？。,.，、]/g, "");
  }

  function catalogRow(name, matcher, descriptionCatalog) {
    const options = matcher && matcher.options || {};
    const target = compactName(name);
    const row = ((options.augmentSearch || options.augments) || []).find(candidate => candidate
      && [candidate.name, ...(candidate.aliases || [])].some(value => compactName(value) === target)) || null;
    if (row && (row.desc || row.description)) return row;
    const externalRows = (descriptionCatalog || []).filter(candidate => {
      const candidateName = compactName(candidate && candidate.name);
      return candidateName === target || candidateName.replace(/[ⅠⅡⅢIVX]+$/i, "") === target
        || candidateName.replace(/[一二三123]+$/, "") === target;
    });
    if (!externalRows.length) return row;
    const desc = externalRows.length === 1
      ? externalRows[0].description || externalRows[0].desc || ""
      : externalRows.map(candidate => `${candidate.name}：${candidate.description || candidate.desc || ""}`).join("；");
    return { ...(row || {}), name: row && row.name || name, desc, descriptionVariants: externalRows.map(candidate => candidate.name) };
  }

  function normalizeUnit(row) {
    if (typeof row === "string") {
      const match = row.match(/^(.*?)·(\d)星$/);
      return { name: match ? match[1] : row, star: match ? Number(match[2]) : 1, location: "unknown" };
    }
    return {
      name: row && (row.name || row.value) || "",
      star: Number(row && row.star) || 1,
      location: row && row.location || "unknown",
    };
  }

  function hardConstraints(selected, decision, augments) {
    const rawHealth = selected && selected.health;
    const health = rawHealth === null || rawHealth === undefined || rawHealth === "" || rawHealth === "unknown" ? NaN : Number(rawHealth);
    const stabilization = selected && selected.stabilization || {};
    const rows = [
      "只能点名当前已持有棋子；若建议上场备战席棋子，必须明确替换谁以及原因。",
      "必须同时引用至少两个当前事实维度，例如星级+装备、回合+金币、血量+场面质量。",
      "强化作用于全队时，也要指出当前最能兑现收益的棋子，而不是泛泛复述说明。",
      "不得把终局阵容当成当前局面，不得推荐当前状态中不存在的英雄或装备。",
    ];
    if (stabilization.urgent || Number.isFinite(health) && health <= 35) rows.push("当前已触发止血：经济强化不得建议硬存钱，优先提升下一轮当前板战力。\n");
    if (decision && decision.currentBoardUnits && decision.currentBoardUnits.length) rows.push("站位与战斗动作优先围绕当前最强板，而非路线终局棋子。\n");
    if ((augments || []).some(row => /最大利息|金币|商店|刷新|经验/.test(row.desc || ""))) {
      rows.push("经济建议必须明确回答：现在存钱、先稳板再存、还是立即花钱。\n");
    }
    return rows.map(row => row.trim());
  }

  function buildContract(ctx) {
    const selected = ctx && ctx.selected || {};
    const decision = ctx && ctx.decision || {};
    const matcher = ctx && ctx.matcher || {};
    const descriptionCatalog = ctx && ctx.descriptionCatalog || [];
    const actionContract = ctx && ctx.actionContract || {};
    const selectedNames = uniq(selected.augments || []);
    const augments = selectedNames.map(name => {
      const row = catalogRow(name, matcher, descriptionCatalog) || {};
      return {
        name: row.name || name,
        desc: row.desc || row.description || "描述缺失",
        categories: row.cats || [],
        descriptionVariants: row.descriptionVariants || [],
      };
    });
    const board = (decision.currentBoardUnits || []).map(normalizeUnit).filter(row => row.name);
    const boardNames = new Set(board.map(row => row.name));
    const held = (selected.units || []).map(normalizeUnit).filter(row => row.name);
    const bench = uniq([
      ...(decision.currentBoardBench || []).map(stripStar),
      ...held.filter(row => !boardNames.has(row.name)).map(row => row.name),
    ]);
    const items = (selected.itemRows || []).map(row => ({
      name: row.name || row.value,
      holder: row.holder || "未分配",
      equipped: Boolean(row.equipped || row.holder),
    })).filter(row => row.name);
    const traits = (selected.traits || []).map(row => typeof row === "string" ? row : row.label || `${row.count || ""}${row.name || ""}`).filter(Boolean);
    const healthKnown = selected.health !== null && selected.health !== undefined && selected.health !== ""
      && selected.health !== "unknown" && Number.isFinite(Number(selected.health));
    const goldKnown = selected.gold !== null && selected.gold !== undefined && selected.gold !== ""
      && selected.gold !== "unknown" && Number.isFinite(Number(selected.gold));
    const contract = {
      version: 1,
      state: {
        level: Number(selected.level) || null,
        round: selected.stage || selected.currentStage || "未知",
        health: healthKnown ? Number(selected.health) : null,
        goldLowerBound: goldKnown ? Number(selected.gold) : null,
        board,
        boardCarry: stripStar(decision.currentBoardCarry || ""),
        bench,
        items,
        activeTraits: decision.currentBoardTraits || traits,
        route: decision.executionName || "尚未定线",
        routeCarry: actionContract.facts && actionContract.facts.carry || "",
        nextCheckpoint: actionContract.checkpoint || "",
        currentActions: actionContract.now && actionContract.now.facts || [],
        commitments: selected.commitments || [],
        derivedAssets: selected.derivedAssets || [],
        mechanismStates: selected.mechanismStates || [],
        healthTrend: selected.healthTrend || null,
        stabilization: selected.stabilization || null,
      },
      augments,
      deterministicFallback: actionContract.augmentAdvice || [],
      hardConstraints: [],
      allowed: {
        units: uniq(held.map(row => row.name)),
        boardUnits: board.map(row => row.name),
        items: uniq(items.map(row => row.name)),
        augments: augments.map(row => row.name),
        numbers: [],
      },
    };
    contract.hardConstraints = hardConstraints(selected, decision, augments);
    contract.allowed.numbers = uniq([
      ...String(JSON.stringify(contract.state)).match(/\d+(?:\.\d+)?/g) || [],
      ...String(JSON.stringify(augments)).match(/\d+(?:\.\d+)?/g) || [],
      "0", "10", "20", "30", "40", "50", "70",
    ]).map(String);
    return contract;
  }

  function safeJson(content) {
    const text = String(content || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try { return JSON.parse(text); } catch (e) {}
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("局面推理没有返回JSON对象");
    return JSON.parse(match[0]);
  }

  function entityMentions(text, names) {
    const source = String(text || "");
    return (names || []).filter(name => name && source.includes(name));
  }

  function validatePayload(payload, contract, matcher, logger) {
    const log = logger || console;
    const options = matcher && matcher.options || {};
    const allUnits = uniq((options.unitSearch || options.units || []).map(row => row && (row.name || row)));
    const allItems = uniq((options.items || []).map(row => row && (row.name || row)));
    const allAugments = uniq(((options.augmentSearch || options.augments) || []).map(row => row && (row.name || row)));
    const allowedUnits = new Set(contract.allowed.units || []);
    const allowedItems = new Set(contract.allowed.items || []);
    const selectedAugments = new Set(contract.allowed.augments || []);
    const allowedNumbers = new Set((contract.allowed.numbers || []).map(String));
    const out = [];
    const discarded = [];
    const rows = payload && Array.isArray(payload.advice) ? payload.advice : [];
    rows.forEach(row => {
      const augment = row && row.augment;
      const action = String(row && row.action || "").trim();
      const because = row && Array.isArray(row.because) ? uniq(row.because.map(value => String(value).trim()).filter(Boolean)) : [];
      const dimensions = row && Array.isArray(row.dimensions) ? uniq(row.dimensions.map(String)).filter(value => VALID_DIMENSIONS.has(value)) : [];
      const targets = row && Array.isArray(row.targets) ? uniq(row.targets.map(String)) : [];
      const text = `${action} ${because.join(" ")} ${targets.join(" ")}`;
      const foreignUnits = entityMentions(text, allUnits).filter(name => !allowedUnits.has(name));
      const foreignItems = entityMentions(text, allItems).filter(name => !allowedItems.has(name));
      const foreignAugments = entityMentions(text, allAugments).filter(name => !selectedAugments.has(name));
      const foreignNumbers = (text.match(/\d+(?:\.\d+)?/g) || []).filter(value => !allowedNumbers.has(value));
      const healthKnown = contract.state.health !== null && contract.state.health !== undefined
        && Number.isFinite(Number(contract.state.health));
      const mustStabilize = Boolean(contract.state.stabilization && contract.state.stabilization.urgent)
        || healthKnown && Number(contract.state.health) <= 35;
      const greedAtLowHealth = mustStabilize && /(?:建议|继续|优先).{0,6}(?:存钱|攒钱|存到|保50)|不D|不花钱/.test(action)
        && !/(?:不建议|不要|别|不硬).{0,6}(?:存钱|攒钱|存到|保50)/.test(action);
      const invalid = !selectedAugments.has(augment) || !action || action.length > 220 || because.length < 2 || dimensions.length < 2
        || targets.some(name => !allowedUnits.has(name)) || foreignUnits.length || foreignItems.length
        || foreignAugments.length || foreignNumbers.length || greedAtLowHealth;
      if (invalid) {
        discarded.push({ row, foreignUnits, foreignItems, foreignAugments, foreignNumbers, greedAtLowHealth });
        if (log && log.warn) log.warn("[augment-strategist] 丢弃越界建议", discarded[discarded.length - 1]);
        return;
      }
      out.push({
        augment,
        kind: "adaptive",
        title: String(row.verdict || "全局推理"),
        tone: ["green", "yellow", "red"].includes(row.tone) ? row.tone : "yellow",
        targets,
        action,
        reason: because.join("；"),
        dimensions,
      });
    });
    const covered = new Set(out.map(row => row.augment));
    const complete = [...selectedAugments].every(name => covered.has(name));
    return {
      ok: complete && out.length > 0,
      status: complete && out.length > 0 ? "ok" : "incomplete",
      summary: String(payload && payload.summary || "").slice(0, 180),
      advice: complete ? out : [],
      discarded,
    };
  }

  function buildMessages(contract) {
    const system = [
      "你是金铲铲怪兽入侵比赛中的实时局面策略师，不是静态攻略生成器。",
      "你必须对每一个已选强化重新阅读其完整描述，并结合当前全部状态推导当下动作。",
      "同时考虑：当前最强上场、备战席、星级、装备归属、羁绊、等级、回合、金币、血量、已形成路线、下一检查点、已投入成本及多个强化之间的联动。",
      "禁止按强化名输出固定套话；相同强化在不同局面必须可能得出不同结论。",
      "战斗强化要点名当前真正受益的棋子及站位/装备/对位动作；经济强化必须明确现在存钱、先稳板再存、还是立即花钱。",
      "只能点名 allowed 中的实体和数字，不得推荐未持有英雄、未拥有装备或编造概率。",
      "每条 because 必须列出至少2个来自 state 的不同事实，说明为什么此刻这样做。",
      "严格服从 hardConstraints。只输出JSON，不要Markdown。",
      "dimensions 至少选择2项且必须真实参与判断，可选：board、bench、star、items、traits、level、round、gold、health、route、commitment、augment-interaction。",
      "格式：{\"summary\":\"本局强化组合结论\",\"advice\":[{\"augment\":\"已选强化标准名\",\"verdict\":\"立即兑现|条件兑现|先稳板|暂不追\",\"tone\":\"green|yellow|red\",\"targets\":[\"当前持有棋子\"],\"dimensions\":[\"board\",\"items\"],\"action\":\"现在具体怎么做\",\"because\":[\"事实1\",\"事实2\"]}]}。",
    ].join("\n");
    return [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(contract) },
    ];
  }

  function strategyKey(contract) {
    return contract ? JSON.stringify(contract) : "";
  }

  function mockPayload(contract) {
    const carry = contract.state.boardCarry || contract.allowed.boardUnits[0] || contract.allowed.units[0];
    const facts = [
      `${contract.state.round}回合${contract.state.health == null ? "血量未知" : `${contract.state.health}血`}`,
      `当前板${contract.allowed.boardUnits.join("、") || "未知"}`,
    ];
    return {
      summary: "已按完整局面重算所有强化",
      advice: contract.augments.map(row => ({
        augment: row.name,
        verdict: "条件兑现",
        tone: "yellow",
        targets: carry ? [carry] : [],
        dimensions: ["round", "board"],
        action: `${row.name}：围绕${carry || "当前最强板"}执行，并在${contract.state.nextCheckpoint || contract.state.round}复查`,
        because: facts,
      })),
    };
  }

  async function strategize(opts) {
    const ctx = opts || {};
    const contract = ctx.contract;
    const fallback = { ok: false, status: "fallback", summary: "", advice: contract && contract.deterministicFallback || [] };
    if (!contract || !contract.augments || !contract.augments.length) return { ...fallback, status: "empty" };
    const apiBase = String(ctx.apiBase || "").replace(/\/+$/, "");
    if (apiBase.toLowerCase() === "mock") return validatePayload(mockPayload(contract), contract, ctx.matcher, ctx.logger);
    if (!ctx.apiKey) return { ...fallback, status: "no-key" };
    const externalSignal = ctx.signal;
    if (externalSignal && externalSignal.aborted) return { ...fallback, status: "cancelled" };
    const controller = new AbortController();
    const abortFromExternal = () => controller.abort();
    if (externalSignal) externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    const timer = setTimeout(() => controller.abort(), Number(ctx.timeoutMs) || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${ctx.apiKey}` },
        body: JSON.stringify({
          model: ctx.model,
          temperature: 0.15,
          max_tokens: 900,
          messages: buildMessages(contract),
        }),
        signal: controller.signal,
      });
      if (!response.ok) return { ...fallback, status: `http-${response.status}` };
      const json = await response.json();
      const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      return validatePayload(safeJson(content), contract, ctx.matcher, ctx.logger);
    } catch (error) {
      const status = error && error.name === "AbortError" ? (externalSignal && externalSignal.aborted ? "cancelled" : "timeout") : "error";
      return { ...fallback, status };
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function runTests() {
    const matcher = {
      options: {
        unitSearch: [{ name: "希维尔" }, { name: "布里茨" }, { name: "德莱文" }, { name: "亚索" }],
        items: [{ name: "锐利之刃" }, { name: "蓝霸符" }],
        augmentSearch: [
          { name: "珠光莲花", desc: "" },
          { name: "利滚利", desc: "获得12金币。你的最大利息提升至7金币。" },
        ],
      },
    };
    const selected = {
      level: 4, stage: "2-5", health: 100, gold: 50,
      augments: ["珠光莲花", "利滚利"],
      units: [{ name: "希维尔", star: 2 }, { name: "布里茨", star: 1 }],
      itemRows: [{ name: "锐利之刃", holder: "希维尔" }],
    };
    const decision = { currentBoardUnits: ["希维尔·2星", "布里茨"], currentBoardCarry: "希维尔", currentBoardBench: [], executionName: "当前枪手过渡" };
    const actionContract = { checkpoint: "3-2", now: { facts: ["保持当前板"] }, facts: { carry: "希维尔" }, augmentAdvice: [] };
    const descriptionCatalog = [
      { name: "珠光莲花 I", description: "己方获得10%暴击几率和技能暴击。" },
      { name: "珠光莲花 II", description: "己方获得25%暴击几率、10%暴击伤害和技能暴击。" },
    ];
    const contract = buildContract({ selected, decision, actionContract, matcher, descriptionCatalog });
    assert(contract.augments.length === 2 && contract.augments.some(row => row.name === "珠光莲花"), "未预设专属规则的强化也必须进入全局推理合同");
    assert(contract.augments.find(row => row.name === "珠光莲花").desc.includes("珠光莲花 I")
      && contract.augments.find(row => row.name === "珠光莲花").descriptionVariants.length === 2,
    "主数据缺描述时必须从完整强化目录补齐版本信息，而不是让模型只凭名字猜");
    assert(contract.state.board.length === 2 && contract.state.items[0].holder === "希维尔"
      && contract.state.health === 100 && contract.state.goldLowerBound === 50, "推理合同必须包含棋盘、装备、血量与经济事实");
    const valid = validatePayload({
      summary: "当前高血可运营，但强化兑现对象不同",
      advice: [
        { augment: "珠光莲花", verdict: "立即兑现", tone: "green", targets: ["希维尔"], dimensions: ["star", "items"], action: "珠光莲花：让希维尔继续持锐利之刃承担输出", because: ["希维尔2星", "锐利之刃已在希维尔身上"] },
        { augment: "利滚利", verdict: "条件兑现", tone: "green", targets: [], dimensions: ["round", "health", "gold"], action: "利滚利：当前100血先存到70", because: ["2-5回合", "当前至少50金"] },
      ],
    }, contract, matcher, { warn() {} });
    assert(valid.ok && valid.advice.length === 2, "全局推理必须覆盖每一个已选强化并引用多维事实");
    const hallucinated = validatePayload({
      advice: [
        { augment: "珠光莲花", verdict: "立即兑现", tone: "green", targets: ["亚索"], dimensions: ["board", "star"], action: "让亚索主C", because: ["当前2-5", "希维尔2星"] },
        { augment: "利滚利", verdict: "条件兑现", tone: "green", targets: [], dimensions: ["health", "gold"], action: "先存到70", because: ["当前100血", "当前50金"] },
      ],
    }, contract, matcher, { warn() {} });
    assert(!hallucinated.ok, "不得推荐当前未持有棋子");
    const dyingContract = buildContract({ selected: { ...selected, health: 20 }, decision, actionContract, matcher });
    const greed = validatePayload({
      advice: [
        { augment: "珠光莲花", verdict: "立即兑现", tone: "green", targets: ["希维尔"], dimensions: ["star", "health"], action: "让希维尔继续输出", because: ["希维尔2星", "当前20血"] },
        { augment: "利滚利", verdict: "继续存钱", tone: "green", targets: [], dimensions: ["health", "gold"], action: "利滚利：建议存钱到70，不D", because: ["当前20血", "当前50金"] },
      ],
    }, dyingContract, matcher, { warn() {} });
    assert(!greed.ok, "残血时必须拒绝模型机械贪利息");
    console.log("augment-strategist assertions passed");
  }

  const api = { DEFAULT_TIMEOUT_MS, buildContract, validatePayload, buildMessages, strategyKey, strategize, runTests };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
