(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SignalParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const FILLERS = [
    "来了", "来个", "拿了", "拿到", "拿着", "一个", "还有", "然后", "以及", "给我", "看到",
    "看见", "现在", "这把", "有个", "有一个", "帮我", "可以", "的话", "那个", "这个",
  ];
  const CLEAR_WORDS = ["重开", "新的一局", "新局", "清空", "重新开始"];
  const REMOVE_WORDS = ["删掉", "去掉", "不要", "删除", "移除"];

  const ITEM_ALIASES = {
    鬼索的狂暴之刃: ["羊刀", "鬼索", "鬼锁", "养刀"],
    疾射火炮: ["火炮", "双火炮"],
    泰坦的坚决: ["泰坦"],
    卢安娜的飓风: ["飓风"],
    最后的轻语: ["轻语", "破甲弓"],
    锐利之刃: ["杀人剑"],
    汲取剑: ["饮血", "饮血剑"],
    珠光护手: ["法爆"],
    班克斯的魔法帽: ["帽子"],
    蓝霸符: ["蓝buff", "蓝霸服", "蓝buff符"],
    朔极之矛: ["青龙刀"],
    离子火花: ["离子"],
    日炎斗篷: ["日炎"],
    狂徒铠甲: ["狂徒"],
    石像鬼石板甲: ["石像鬼", "板甲"],
    巨龙之爪: ["龙牙"],
    暴风之剑: ["大剑", "bf"],
    反曲之弓: ["反曲弓", "攻速", "弓"],
    无用大棒: ["大棒"],
    女神之泪: ["眼泪", "泪滴"],
    负极斗篷: ["魔抗", "斗篷"],
    巨人腰带: ["腰带"],
    金铲铲: ["铲子", "铲铲"],
  };

  const PINYIN = {
    安: "an", 妮: "ni", 波: "bo", 比: "bi", 璐: "lu", 露: "lu", 佐: "zuo", 左: "zuo", 伊: "yi", 移: "yi",
    羊: "yang", 养: "yang", 刀: "dao", 鬼: "gui", 索: "suo", 锁: "suo", 的: "de", 狂: "kuang", 暴: "bao", 之: "zhi", 刃: "ren",
    男: "nan", 锋: "feng", 泰: "tai", 隆: "long", 瞎: "xia", 盲: "mang", 僧: "seng", 李: "li", 青: "qing",
    琴: "qin", 女: "nv", 娑: "suo", 娜: "na", 武: "wu", 器: "qi", 贾: "jia", 克: "ke", 斯: "si",
    火: "huo", 炮: "pao", 反: "fan", 曲: "qu", 弓: "gong", 眼: "yan", 泪: "lei", 大: "da", 棒: "bang",
    无: "wu", 情: "qing", 连: "lian", 打: "da", 街: "jie", 区: "qu", 团: "tuan", 队: "dui", 建: "jian", 设: "she",
    升: "sheng", 级: "ji", 咯: "lo", 高: "gao", 端: "duan", 购: "gou", 物: "wu", 对: "dui", 冲: "chong", 基: "ji", 金: "jin",
    猴: "hou", 子: "zi", 孙: "sun", 悟: "wu", 空: "kong", 德: "de", 莱: "lai", 文: "wen",
    佛: "fo", 耶: "ye", 戈: "ge", 阿: "a", 利: "li", 塔: "ta", 瑟: "se", 庄: "zhuang", 猪: "zhu", 妹: "mei",
    蕾: "lei", 欧: "ou", 厄: "e", 加: "jia", 特: "te", 费: "fei", 稻: "dao", 草: "cao", 人: "ren",
  };

  let cache = null;

  function getMatcher() {
    if (root && root.STAGE2_MATCHER) return root.STAGE2_MATCHER;
    if (typeof require === "function") {
      try { return require("../stage2_matcher_results.json"); } catch (e) {}
    }
    return { options: {}, templates: [] };
  }

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[\s,，、+＋/|;；:：!！?？。,.()（）\[\]【】·.\-_—>→]/g, "");
  }

  function stripFillers(text) {
    let out = String(text || "");
    FILLERS.sort((a, b) => b.length - a.length).forEach(w => { out = out.split(w).join(""); });
    return out;
  }

  function toPinyin(s) {
    return Array.from(String(s || "")).map(ch => {
      if (/[a-z0-9]/i.test(ch)) return ch.toLowerCase();
      return PINYIN[ch] || ch;
    }).join("");
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[a.length][b.length];
  }

  function buildVocab() {
    if (cache) return cache;
    const matcher = getMatcher();
    const entries = [];
    const push = (kind, value, labels) => {
      [value, ...(labels || [])].filter(Boolean).forEach(label => {
        const n = norm(label);
        if (!n) return;
        entries.push({ kind, value, label, norm: n, py: toPinyin(n) });
      });
    };

    const unitSearch = matcher.options.unitSearch || matcher.options.units || [];
    unitSearch.forEach(x => push("units", x.name, x.aliases || []));
    (matcher.options.items || []).forEach(x => push("items", x.name, ITEM_ALIASES[x.name] || []));
    ((matcher.options.augmentSearch || matcher.options.augments) || []).forEach(x => push("augments", x.name, x.aliases || []));
    (matcher.options.augmentSignals || []).forEach(x => push("augmentCats", x, [`${x}符文`]));
    const monsters = new Set();
    (matcher.templates || []).forEach(t => (t.monsterPrefs || []).forEach(x => monsters.add(x)));
    monsters.forEach(x => push("monsters", x, []));

    const seen = new Set();
    const clean = entries.filter(e => {
      const k = `${e.kind}|${e.value}|${e.norm}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => b.norm.length - a.norm.length);
    cache = {
      entries: clean,
      maxLen: Math.max(...clean.map(e => e.norm.length), 2),
    };
    return cache;
  }

  function bestCandidates(raw, kindFilter) {
    const p = toPinyin(norm(raw));
    const entries = buildVocab().entries.filter(e => !kindFilter || e.kind === kindFilter);
    return entries.map(e => ({
      kind: e.kind,
      value: e.value,
      label: e.label,
      distance: editDistance(p, e.py),
    })).sort((a, b) => a.distance - b.distance || a.value.length - b.value.length).slice(0, 3);
  }

  function findMatchAt(text, i, kindFilter) {
    const { entries, maxLen } = buildVocab();
    const max = Math.min(maxLen, text.length - i);
    for (let len = max; len >= 1; len--) {
      const piece = text.slice(i, i + len);
      const literal = entries.find(e => (!kindFilter || e.kind === kindFilter) && e.norm === piece);
      if (literal) return { entry: literal, len, method: "literal" };
    }
    for (let len = max; len >= 2; len--) {
      const piece = text.slice(i, i + len);
      const py = toPinyin(piece);
      const exact = entries.find(e => (!kindFilter || e.kind === kindFilter) && e.py === py);
      if (exact) return { entry: exact, len, method: "pinyin" };
    }
    for (let len = max; len >= 2; len--) {
      const piece = text.slice(i, i + len);
      const py = toPinyin(piece);
      const near = entries
        .filter(e => !kindFilter || e.kind === kindFilter)
        .map(e => ({ e, d: editDistance(py, e.py) }))
        .filter(x => x.d <= 1)
        .sort((a, b) => a.d - b.d || b.e.norm.length - a.e.norm.length)[0];
      if (near) return { entry: near.e, len, method: "near" };
    }
    return null;
  }

  function tokenize(text, kindFilter) {
    const clean = norm(stripFillers(text));
    const add = [];
    const pending = [];
    let unknown = "";
    let i = 0;
    const flush = () => {
      if (!unknown) return;
      pending.push({ raw: unknown, candidates: bestCandidates(unknown, kindFilter) });
      unknown = "";
    };
    while (i < clean.length) {
      const hit = findMatchAt(clean, i, kindFilter);
      if (hit) {
        flush();
        add.push({ kind: hit.entry.kind, value: hit.entry.value, label: hit.entry.value, via: hit.method });
        i += hit.len;
      } else {
        unknown += clean[i];
        i++;
      }
    }
    flush();
    const seen = new Set();
    return {
      add: add.filter(x => {
        const k = `${x.kind}|${x.value}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
      pending: pending.filter(x => x.raw && x.candidates.length),
    };
  }

  function parse(text, currentSignals) {
    const raw = String(text || "").trim();
    const out = { add: [], remove: [], clear: false, augTriple: [], pending: [] };
    if (!raw) return out;
    if (CLEAR_WORDS.some(w => raw.includes(w))) {
      out.clear = true;
      return out;
    }

    const augCmd = raw.match(/(?:符文|海克斯)(.+)$/);
    if (augCmd) {
      const got = tokenize(augCmd[1], "augments");
      out.augTriple = got.add.slice(0, 3);
      out.pending = got.pending;
      return out;
    }

    const removeWord = REMOVE_WORDS.find(w => raw.includes(w));
    if (removeWord) {
      const target = raw.slice(raw.indexOf(removeWord) + removeWord.length);
      const got = tokenize(target);
      out.remove = got.add;
      out.pending = got.pending;
      return out;
    }

    const got = tokenize(raw);
    out.add = got.add;
    out.pending = got.pending;
    return out;
  }

  function assertIncludes(rows, kind, value) {
    if (!rows.some(x => x.kind === kind && x.value === value)) {
      throw new Error(`断言失败：缺少 ${kind}:${value}，实际=${JSON.stringify(rows)}`);
    }
  }

  function runTests() {
    const a = parse("来了个安妮还有波比拿了养刀", []);
    assertIncludes(a.add, "units", "安妮");
    assertIncludes(a.add, "units", "波比");
    assertIncludes(a.add, "items", "鬼索的狂暴之刃");
    if (a.pending.length) throw new Error("用例A不应有待确认：" + JSON.stringify(a.pending));

    const b = parse("左移露露", []);
    assertIncludes(b.add, "units", "佐伊");
    assertIncludes(b.add, "units", "璐璐");

    const c = parse("删掉波比", [{ kind: "units", value: "波比" }]);
    assertIncludes(c.remove, "units", "波比");
    if (!parse("新的一局", []).clear) throw new Error("新的一局应清空");

    const d = parse("符文 无情连打 DD街区 团队建设", []);
    if (d.augTriple.length !== 3) throw new Error("符文三选一失败：" + JSON.stringify(d));

    const e = parse("鬼锁", []);
    assertIncludes(e.add, "items", "鬼索的狂暴之刃");
    console.log("signal-parser assertions passed");
  }

  const api = { parse, tokenize, norm, toPinyin, buildVocab, runTests };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
