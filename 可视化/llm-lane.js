(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LLMLane = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DEFAULT_MODEL = "claude-haiku-4-5";
  const DEFAULT_API_BASE = "http://127.0.0.1:8787/v1";
  const TRAITS = [
    "护卫", "斗士", "战斗机甲", "小天才", "福牛守护者", "决斗大师", "秘术卫士", "情报特工", "强袭枪手",
    "超级英雄", "星之守护者", "源计划：激光特工", "混沌战士", "爱心使者", "吉祥物", "黑客", "灵能使",
    "精英战士", "平民英雄", "地下魔盗团", "幻灵战队", "怪兽", "AI程序", "淘气包", "气象主播", "枪神", "堕落使者",
  ];
  const EXTRA_ITEMS = ["钢铁烈阳之匣"];
  const VALID_KINDS = ["units", "items", "augments", "traits"];

  function uniq(rows) {
    return [...new Set((rows || []).filter(Boolean))];
  }

  function getMatcher() {
    if (root && root.STAGE2_MATCHER) return root.STAGE2_MATCHER;
    if (typeof require === "function") {
      try { return require("../stage2_matcher_results.json"); } catch (e) {}
    }
    return { options: {} };
  }

  function buildVocab(matcher) {
    const options = (matcher || getMatcher()).options || {};
    const units = uniq((options.unitSearch || options.units || []).map(x => x.name || x));
    const items = uniq([...(options.items || []).map(x => x.name || x), ...EXTRA_ITEMS]);
    const augments = uniq(((options.augmentSearch || options.augments) || []).map(x => x.name || x));
    const traits = uniq(TRAITS);
    const all = new Set([...units, ...items, ...augments, ...traits]);
    return {
      units: new Set(units),
      items: new Set(items),
      augments: new Set(augments),
      traits: new Set(traits),
      all,
      list: { units, items, augments, traits },
    };
  }

  function safeJson(content) {
    const text = String(content || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try { return JSON.parse(text); } catch (e) {}
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("LLM没有返回JSON对象");
    return JSON.parse(m[0]);
  }

  function validatePayload(payload, vocab, logger) {
    const log = logger || console;
    const out = { add: [], remove: [], discarded: [] };
    const seenAdd = new Set();
    const seenRemove = new Set();
    (payload && Array.isArray(payload.add) ? payload.add : []).forEach(row => {
      const kind = row && row.kind;
      const value = row && row.value;
      const count = Number(row && row.count);
      if (!VALID_KINDS.includes(kind) || !value || !vocab[kind] || !vocab[kind].has(value)) {
        out.discarded.push(row);
        if (log && log.warn) log.warn("[llm-lane] 丢弃非法信号", row);
        return;
      }
      if (kind === "traits" && (!Number.isInteger(count) || count < 1 || count > 9)) {
        out.discarded.push(row);
        if (log && log.warn) log.warn("[llm-lane] 丢弃非法羁绊数量", row);
        return;
      }
      const sig = {
        kind,
        value,
        label: kind === "traits" ? `${count}${value}` : value,
        via: "llm",
      };
      if (kind === "traits") sig.count = count;
      const key = `${sig.kind}|${sig.value}|${sig.count || ""}`;
      if (!seenAdd.has(key)) {
        seenAdd.add(key);
        out.add.push(sig);
      }
    });
    (payload && Array.isArray(payload.remove) ? payload.remove : []).forEach(value => {
      if (typeof value !== "string" || !vocab.all.has(value)) {
        out.discarded.push({ remove: value });
        if (log && log.warn) log.warn("[llm-lane] 丢弃非法移除项", value);
        return;
      }
      if (!seenRemove.has(value)) {
        seenRemove.add(value);
        out.remove.push(value);
      }
    });
    return out;
  }

  function compactSignals(signals) {
    return (signals || []).map(s => s.kind === "traits" ? `${s.count}${s.value}` : (s.value || s.label)).filter(Boolean).slice(0, 30);
  }

  function buildMessages(ctx, vocab) {
    const sys = [
      "你是金铲铲之战 S18 阵容信号翻译器，只把口述文本翻译成标准信号，不参与打分、阵容推荐或解释。",
      "只能输出严格 JSON，不要 Markdown，不要自然语言。",
      "JSON格式：{\"add\":[{\"kind\":\"units|items|augments|traits\",\"value\":\"<词表内标准名>\",\"count\":<羁绊数量,可选>}],\"remove\":[\"<词表内标准名>\"]}",
      "traits 必须带 count，count 只能是 1 到 9。理解不了就省略。禁止输出词表外的 value。",
      `棋子标准名：${vocab.list.units.join("、")}`,
      `装备标准名：${vocab.list.items.join("、")}`,
      `羁绊标准名：${vocab.list.traits.join("、")}`,
      `常用符文标准名：${vocab.list.augments.slice(0, 180).join("、")}`,
      "例1：原句=不是安妮是波比；当前信号=安妮；输出={\"add\":[{\"kind\":\"units\",\"value\":\"波比\"}],\"remove\":[\"安妮\"]}",
      "例2：原句=三小两护卫；输出={\"add\":[{\"kind\":\"traits\",\"value\":\"小天才\",\"count\":3},{\"kind\":\"traits\",\"value\":\"护卫\",\"count\":2}],\"remove\":[]}",
    ].join("\n");
    const user = JSON.stringify({
      原句全文: ctx.original || "",
      未识别碎片列表: ctx.unheard || [],
      当前信号池: compactSignals(ctx.signals || []),
    });
    return [
      { role: "system", content: sys },
      { role: "user", content: user },
    ];
  }

  function mockPayload() {
    return {
      add: [
        { kind: "traits", value: "战斗机甲", count: 3 },
        { kind: "units", value: "幻觉棋子" },
      ],
      remove: [],
    };
  }

  async function translate(opts) {
    const ctx = opts || {};
    const vocab = buildVocab(ctx.matcher);
    const apiBase = String(ctx.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    const logger = ctx.logger || console;
    if (!ctx.unheard || !ctx.unheard.length) return { ok: true, status: "skip", add: [], remove: [], discarded: [] };
    if (apiBase.toLowerCase() === "mock") {
      const valid = validatePayload(mockPayload(), vocab, logger);
      return { ok: true, status: "mock", ...valid };
    }
    if (!ctx.apiKey) return { ok: false, status: "no-key", add: [], remove: [], discarded: [] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs || 4000);
    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${ctx.apiKey}`,
        },
        body: JSON.stringify({
          model: ctx.model || DEFAULT_MODEL,
          temperature: 0,
          max_tokens: 300,
          messages: buildMessages(ctx, vocab),
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, status: `http-${res.status}`, add: [], remove: [], discarded: [] };
      const json = await res.json();
      const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      const valid = validatePayload(safeJson(content), vocab, logger);
      return { ok: true, status: "ok", ...valid };
    } catch (e) {
      return { ok: false, status: e && e.name === "AbortError" ? "timeout" : "error", add: [], remove: [], discarded: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  async function testConnection(opts) {
    const apiBase = String(opts && opts.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    if (apiBase.toLowerCase() === "mock") return { ok: true, status: "mock" };
    if (!opts || !opts.apiKey) return { ok: false, status: "no-key" };
    const res = await translate({
      apiBase,
      apiKey: opts.apiKey,
      model: opts.model || DEFAULT_MODEL,
      original: "测试连接",
      unheard: ["测试连接"],
      signals: [],
      matcher: opts.matcher,
      timeoutMs: opts.timeoutMs || 4000,
      logger: opts.logger || console,
    });
    return { ok: res.ok, status: res.status };
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function runTests() {
    const vocab = buildVocab(getMatcher());
    const silent = { warn() {} };
    const got = validatePayload({
      add: [
        { kind: "traits", value: "战斗机甲", count: 3 },
        { kind: "units", value: "幻觉棋子" },
        { kind: "traits", value: "护卫", count: 12 },
        { kind: "items", value: "巨龙之爪" },
      ],
      remove: ["安妮", "幻觉装备"],
    }, vocab, silent);
    assert(got.add.length === 2, "应只接受两个合法add");
    assert(got.add.some(x => x.kind === "traits" && x.value === "战斗机甲" && x.count === 3), "应接受合法羁绊");
    assert(got.add.some(x => x.kind === "items" && x.value === "巨龙之爪"), "应接受合法装备");
    assert(got.remove.length === 1 && got.remove[0] === "安妮", "应接受合法remove");
    assert(got.discarded.length === 3, "应拒绝词表外值和非法count");
    console.log("llm-lane assertions passed");
  }

  const api = {
    DEFAULT_MODEL,
    DEFAULT_API_BASE,
    TRAITS,
    buildVocab,
    buildMessages,
    validatePayload,
    translate,
    testConnection,
    runTests,
  };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
