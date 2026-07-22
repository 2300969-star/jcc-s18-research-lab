(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DecisionNarrator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 9000;
  const FIELDS = ["now", "check", "stay"];

  function uniq(rows) {
    return [...new Set((rows || []).filter(Boolean))];
  }

  function safeJson(content) {
    const text = String(content || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try { return JSON.parse(text); } catch (e) {}
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM没有返回JSON对象");
    return JSON.parse(match[0]);
  }

  function contractFacts(contract, field) {
    return uniq(contract && contract[field] && contract[field].facts || []).map(String);
  }

  function fallbackTexts(contract) {
    return Object.fromEntries(FIELDS.map(field => [field, contractFacts(contract, field).join("；")]));
  }

  function matcherNames(matcher) {
    const options = matcher && matcher.options || {};
    const templates = matcher && matcher.templates || [];
    return uniq([
      ...(options.unitSearch || options.units || []).map(row => row && (row.name || row)),
      ...(options.items || []).map(row => row && (row.name || row)),
      ...(options.augmentSearch || options.augments || []).map(row => row && (row.name || row)),
      ...templates.flatMap(template => [template && template.name, template && template.family]),
    ]).filter(name => String(name).length >= 2).sort((a, b) => String(b).length - String(a).length);
  }

  function numericTokens(text) {
    return uniq(String(text || "").match(/\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?/g) || []);
  }

  function entityTokens(text, names) {
    const source = String(text || "");
    return (names || []).filter(name => source.includes(name));
  }

  function validateNarration(payload, contract, matcher, logger) {
    const log = logger || console;
    const fallback = fallbackTexts(contract);
    const names = matcherNames(matcher);
    const texts = {};
    for (const field of FIELDS) {
      const value = payload && payload[field];
      const source = contractFacts(contract, field).join("；");
      if (typeof value !== "string" || !value.trim() || value.length > 220) {
        if (log && log.warn) log.warn("[decision-narrator] 丢弃缺失或过长文案", field);
        return { ok: false, status: "invalid-shape", texts: fallback };
      }
      const output = value.trim();
      const sourceNumbers = numericTokens(source);
      const outputNumbers = numericTokens(output);
      const addedNumbers = outputNumbers.filter(token => !sourceNumbers.includes(token));
      const missingNumbers = sourceNumbers.filter(token => !outputNumbers.includes(token));
      const sourceEntities = entityTokens(source, names);
      const outputEntities = entityTokens(output, names);
      const addedEntities = outputEntities.filter(token => !sourceEntities.includes(token));
      const missingEntities = sourceEntities.filter(token => !outputEntities.includes(token));
      if (addedNumbers.length || missingNumbers.length || addedEntities.length || missingEntities.length) {
        if (log && log.warn) log.warn("[decision-narrator] 丢弃越界文案", {
          field, addedNumbers, missingNumbers, addedEntities, missingEntities,
        });
        return { ok: false, status: "fact-mismatch", texts: fallback };
      }
      texts[field] = output;
    }
    if (contract && contract.checkpoint && !texts.check.includes(contract.checkpoint)) {
      if (log && log.warn) log.warn("[decision-narrator] 丢弃遗漏检查回合文案", contract.checkpoint);
      return { ok: false, status: "missing-checkpoint", texts: fallback };
    }
    return { ok: true, status: "ok", texts };
  }

  function narrationKey(contract) {
    if (!contract) return "";
    return JSON.stringify({
      version: contract.version,
      routeId: contract.routeId,
      strategicRouteId: contract.strategicRouteId,
      checkpoint: contract.checkpoint,
      now: contractFacts(contract, "now"),
      check: contractFacts(contract, "check"),
      stay: contractFacts(contract, "stay"),
      switchWhen: contract.switchWhen || [],
    });
  }

  function buildMessages(contract) {
    const system = [
      "你是金铲铲比赛模式的动作讲解器，不是决策器。",
      "只压缩措辞，禁止修改路线、英雄、装备、回合、星级、数量、阈值或触发条件。",
      "每个字段必须保留输入字段里的全部数字与专有名词，不得补充任何新事实。",
      "只输出严格JSON：{\"now\":\"现在做\",\"check\":\"下次检查\",\"stay\":\"不转底线\"}。",
      "每项不超过90个汉字，不要Markdown，不要解释。",
    ].join("\n");
    return [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({
        now: contractFacts(contract, "now"),
        check: contractFacts(contract, "check"),
        stay: contractFacts(contract, "stay"),
      }) },
    ];
  }

  function mockPayload(contract) {
    const fallback = fallbackTexts(contract);
    return {
      now: `先做：${fallback.now}`,
      check: `复查：${fallback.check}`,
      stay: `不转：${fallback.stay}`,
    };
  }

  async function narrate(opts) {
    const ctx = opts || {};
    const contract = ctx.contract;
    const fallback = fallbackTexts(contract);
    if (!contract || FIELDS.some(field => !contractFacts(contract, field).length)) {
      return { ok: false, status: "empty-contract", texts: fallback };
    }
    const apiBase = String(ctx.apiBase || "").replace(/\/+$/, "");
    if (apiBase.toLowerCase() === "mock") {
      const checked = validateNarration(mockPayload(contract), contract, ctx.matcher, ctx.logger);
      return { ...checked, status: checked.ok ? "mock" : checked.status };
    }
    if (!ctx.apiKey) return { ok: false, status: "no-key", texts: fallback };
    const externalSignal = ctx.signal;
    if (externalSignal && externalSignal.aborted) return { ok: false, status: "cancelled", texts: fallback };
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
          temperature: 0,
          max_tokens: 240,
          messages: buildMessages(contract),
        }),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, status: `http-${response.status}`, texts: fallback };
      const json = await response.json();
      const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      return validateNarration(safeJson(content), contract, ctx.matcher, ctx.logger);
    } catch (error) {
      const status = error && error.name === "AbortError" ? (externalSignal && externalSignal.aborted ? "cancelled" : "timeout") : "error";
      return { ok: false, status, texts: fallback };
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
      options: { units: [{ name: "佛耶戈" }, { name: "卡莎" }], items: [{ name: "珠光护手" }] },
      templates: [{ name: "福牛佛耶戈" }],
    };
    const contract = {
      version: 1,
      routeId: "viego",
      checkpoint: "3-5",
      now: { facts: ["停止给佛耶戈追加装备或D牌"] },
      check: { facts: ["3-5检查佛耶戈：目标2星，当前1星", "核心装进度1/2，缺珠光护手"] },
      stay: { facts: ["达到佛耶戈2星且核心装达到2件时继续投入"] },
    };
    const silent = { warn() {} };
    const valid = validateNarration({
      now: "先停投佛耶戈，不再追加装备或D牌",
      check: "3-5复查佛耶戈：当前1星、目标2星；核心装1/2，缺珠光护手",
      stay: "佛耶戈2星且核心装达到2件再继续投入",
    }, contract, matcher, silent);
    assert(valid.ok, "应接受只压缩措辞且完整保留事实的讲解");
    const hallucinated = validateNarration({
      now: "先停投佛耶戈，改玩卡莎",
      check: "3-5复查佛耶戈：当前1星、目标2星；核心装1/2，缺珠光护手",
      stay: "佛耶戈2星且核心装达到2件再继续投入",
    }, contract, matcher, silent);
    assert(!hallucinated.ok && hallucinated.status === "fact-mismatch", "必须拒绝新增棋子或路线");
    const changedThreshold = validateNarration({
      now: "先停投佛耶戈，不再追加装备或D牌",
      check: "4-1复查佛耶戈：当前1星、目标2星；核心装1/2，缺珠光护手",
      stay: "佛耶戈2星且核心装达到2件再继续投入",
    }, contract, matcher, silent);
    assert(!changedThreshold.ok, "必须拒绝修改检查回合或数值门槛");
    assert(narrationKey(contract) === narrationKey(JSON.parse(JSON.stringify(contract))), "同一行动合同必须产生稳定缓存键");
    console.log("decision-narrator assertions passed");
  }

  const api = {
    DEFAULT_TIMEOUT_MS,
    fallbackTexts,
    validateNarration,
    narrationKey,
    buildMessages,
    narrate,
    runTests,
  };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
