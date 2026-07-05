(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SignalParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const FILLERS = [
    "来了", "来个", "拿了", "拿到", "拿着", "一个", "还有", "然后", "以及", "给我", "看到",
    "看见", "现在", "这把", "有个", "有一个", "帮我", "可以", "的话", "那个", "这个",
    "我是", "我这边", "我现在", "这边", "嗯", "啊",
  ];
  const CLEAR_WORDS = ["重开", "新的一局", "新局", "清空", "重新开始"];
  const REMOVE_WORDS = ["删掉", "去掉", "不要", "删除", "移除"];

  const HERO_ALIASES = {
    艾希: ["寒冰", "冰弓", "冰霜射手"],
    波比: ["锤妹", "圣锤"],
    布里茨: ["机器人", "机器", "蒸汽机器人"],
    加里奥: ["巨像", "正义巨像"],
    凯尔: ["天使", "正义天使"],
    拉克丝: ["光辉", "光女", "光辉女郎"],
    雷克顿: ["鳄鱼", "怒之领域"],
    璐璐: ["露露", "仙灵女巫"],
    内瑟斯: ["狗头", "沙漠死神"],
    普朗克: ["船长", "海洋之灾"],
    塞拉斯: ["偷男", "解脱者"],
    孙悟空: ["猴子", "悟空", "大圣", "齐天大圣"],
    泰隆: ["男刀", "刀锋", "刀锋之影"],
    安妮: ["火女", "黑暗之女"],
    德莱文: ["荣耀行刑官"],
    菲奥娜: ["剑姬", "女剑", "无双剑姬"],
    金克丝: ["金克斯", "暴走萝莉"],
    卡蜜尔: ["青钢影", "卡密尔", "卡米尔"],
    李青: ["瞎子", "盲僧"],
    墨菲特: ["石头人", "石头", "熔岩巨兽"],
    芮尔: ["镕铁少女", "熔铁少女"],
    蔚: ["皮城执法官", "执法官"],
    希维尔: ["轮子妈", "战争女神"],
    亚索: ["风男", "快乐风男", "托儿索", "疾风剑豪"],
    伊泽瑞尔: ["ez", "黄毛", "小黄毛", "探险家"],
    悠米: ["猫咪", "猫", "魔法猫咪"],
    阿利斯塔: ["牛头", "老牛", "牛", "牛头酋长"],
    贾克斯: ["武器", "武器人", "武器大师", "拉面"],
    卡莎: ["虚空之女"],
    科加斯: ["大虫子", "虫子", "虚空恐惧"],
    拉莫斯: ["龙龟", "披甲龙龟"],
    乐芙兰: ["妖姬", "诡术妖姬"],
    莫甘娜: ["莫甘娜", "堕落天使"],
    尼菈: ["尼拉"],
    锐雯: ["瑞文", "瑞雯", "放逐之刃", "锐萌萌"],
    赛娜: ["涤魂圣枪"],
    娑娜: ["琴女", "琴瑟仙女"],
    薇恩: ["vn", "维恩", "暗夜猎手"],
    维克兹: ["大眼", "虚空之眼"],
    佐伊: ["左移", "暮光星灵"],
    艾克: ["时间刺客"],
    "奥瑞利安 · 索尔": ["奥瑞利安索尔", "龙王", "龙神"],
    卑尔维斯: ["女皇", "虚空女皇"],
    厄运小姐: ["女枪", "赏金", "赏金猎人"],
    佛耶戈: ["破败", "破败王", "破败之王"],
    劫: ["影流", "影流之主"],
    瑟提: ["腕豪"],
    瑟庄妮: ["猪妹", "猪女", "瑟庄尼", "北地之怒"],
    莎弥拉: ["莎米拉", "沙弥拉"],
    索拉卡: ["奶妈", "众星之子"],
    塔莉垭: ["岩雀"],
    亚托克斯: ["剑魔", "暗裔剑魔"],
    扎克: ["生化魔人"],
    厄斐琉斯: ["月男", "月亮男", "残月之肃"],
    厄加特: ["螃蟹", "无畏战车"],
    费德提克: ["稻草人"],
    迦娜: ["风女", "风暴之怒"],
    蕾欧娜: ["日女", "曙光", "曙光女神"],
    莫德凯撒: ["铁男", "金属大师"],
    努努和威朗普: ["努努", "雪人", "雪原双子"],
    辛德拉: ["球女", "暗黑元首"],
    "训练假人？": ["假人", "训练假人", "木桩"],
  };

  const ITEM_ALIASES = {
    鬼索的狂暴之刃: ["羊刀", "鬼索", "鬼锁", "养刀", "鬼索刀"],
    疾射火炮: ["火炮", "双火炮"],
    泰坦的坚决: ["泰坦", "泰坦甲"],
    卢安娜的飓风: ["飓风"],
    最后的轻语: ["轻语", "破甲", "破甲弓"],
    锐利之刃: ["杀人剑"],
    汲取剑: ["饮血", "饮血剑"],
    珠光护手: ["法爆"],
    班克斯的魔法帽: ["帽子"],
    蓝霸符: ["蓝buff", "蓝霸服", "蓝buff符"],
    朔极之矛: ["青龙刀", "朔极"],
    离子火花: ["离子"],
    日炎斗篷: ["日炎"],
    狂徒铠甲: ["狂徒", "大肉"],
    石像鬼石板甲: ["石像鬼", "板甲"],
    巨龙之爪: ["龙牙", "龙爪"],
    棘刺背心: ["反甲"],
    圣盾使的誓约: ["鸟盾", "圣盾"],
    斯塔缇克电刃: ["电刀", "静电", "电刃"],
    海克斯科技枪刃: ["科技枪"],
    巨人捕手: ["巨杀"],
    水银: ["水银"],
    无尽之刃: ["无尽"],
    振奋盔甲: ["振奋"],
    钢铁烈阳之匣: ["钢铁匣", "钢铁烈阳", "鸟盾"],
    暴风之剑: ["大剑", "bf"],
    反曲之弓: ["反曲弓", "攻速", "弓"],
    无用大棒: ["大棒"],
    女神之泪: ["眼泪", "泪滴"],
    负极斗篷: ["魔抗", "斗篷"],
    巨人腰带: ["腰带"],
    金铲铲: ["铲子", "铲铲"],
  };

  const TRAIT_ALIASES = {
    护卫: ["护卫"],
    斗士: ["斗士"],
    战斗机甲: ["机甲", "战斗机甲", "战队机甲"],
    小天才: ["小天才", "小"],
    福牛守护者: ["福牛", "福牛守护者"],
    决斗大师: ["决斗", "决斗大师"],
    秘术卫士: ["秘卫", "秘术", "秘术卫士", "秘书卫士"],
    情报特工: ["情报", "情报特工"],
    强袭枪手: ["枪手", "强袭枪手"],
    超级英雄: ["超英", "超级英雄"],
    星之守护者: ["星守", "星之守护者"],
    "源计划：激光特工": ["源计划", "激光", "原计划", "源计划激光", "源计划特工", "激光特工", "源计划：激光特工"],
    混沌战士: ["混沌", "混沌战士"],
    爱心使者: ["爱心", "爱心使者"],
    吉祥物: ["吉祥物"],
    黑客: ["黑客"],
    灵能使: ["灵能", "灵能使"],
    精英战士: ["精英", "精英战士"],
    平民英雄: ["平民", "平民英雄"],
    地下魔盗团: ["魔盗", "地下魔盗", "地下魔盗团"],
    幻灵战队: ["幻灵", "幻灵战队"],
    怪兽: ["怪兽"],
    AI程序: ["ai", "ai程序", "AI程序"],
    淘气包: ["淘气包"],
    气象主播: ["气象", "气象主播"],
  };
  const CN_NUMBERS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

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
    护: "hu", 卫: "wei", 小: "xiao", 天: "tian", 才: "cai", 机: "ji", 甲: "jia", 战: "zhan", 斗: "dou",
    福: "fu", 牛: "niu", 决: "jue", 秘: "mi", 术: "shu", 情: "qing", 报: "bao", 枪: "qiang", 超: "chao",
    星: "xing", 守: "shou", 源: "yuan", 计: "ji", 划: "hua", 激: "ji", 光: "guang", 混: "hun", 沌: "dun",
    爱: "ai", 心: "xin", 吉: "ji", 祥: "xiang", 黑: "hei", 客: "ke", 灵: "ling", 能: "neng", 平: "ping",
    民: "min", 魔: "mo", 盗: "dao", 幻: "huan",
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
    unitSearch.forEach(x => push("units", x.name, [...(x.aliases || []), ...(HERO_ALIASES[x.name] || [])]));
    const knownItems = new Set();
    (matcher.options.items || []).forEach(x => {
      knownItems.add(x.name);
      push("items", x.name, ITEM_ALIASES[x.name] || []);
    });
    Object.keys(ITEM_ALIASES).filter(x => !knownItems.has(x)).forEach(x => push("items", x, ITEM_ALIASES[x]));
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
      traits: Object.entries(TRAIT_ALIASES).flatMap(([value, aliases]) =>
        [value, ...(aliases || [])].map(label => ({ kind: "traits", value, label, norm: norm(label), py: toPinyin(norm(label)) }))
      ).filter(x => x.norm).sort((a, b) => b.norm.length - a.norm.length),
    };
    return cache;
  }

  function parseNumberAt(text, i) {
    const ch = text[i];
    if (CN_NUMBERS[ch]) return { count: CN_NUMBERS[ch], len: 1 };
    const m = text.slice(i).match(/^[1-9]/);
    return m ? { count: Number(m[0]), len: m[0].length } : null;
  }

  function findTraitAt(text, i) {
    const n = parseNumberAt(text, i);
    if (!n) return null;
    const rest = text.slice(i + n.len);
    const trait = buildVocab().traits.find(e => rest.startsWith(e.norm));
    if (!trait) return null;
    return {
      entry: {
        kind: "traits",
        value: trait.value,
        label: `${n.count}${trait.value}`,
        count: n.count,
      },
      len: n.len + trait.norm.length,
      method: "trait",
    };
  }

  function bestCandidates(raw, kindFilter) {
    const clean = norm(raw);
    if (Array.from(clean).length < 2) return [];
    const p = toPinyin(clean);
    const entries = buildVocab().entries.filter(e => !kindFilter || e.kind === kindFilter);
    const seen = new Set();
    const rows = entries.map(e => ({
      kind: e.kind,
      value: e.value,
      label: e.value,
      distance: editDistance(p, e.py),
    })).filter(x => x.distance <= 1).sort((a, b) => a.distance - b.distance || a.value.length - b.value.length)
      .filter(x => {
        const k = `${x.kind}|${x.value}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return rows.length <= 3 ? rows : [];
  }

  function findMatchAt(text, i, kindFilter) {
    const { entries, maxLen } = buildVocab();
    if (!kindFilter) {
      const trait = findTraitAt(text, i);
      if (trait) return trait;
    }
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
      const nearRows = entries
        .filter(e => !kindFilter || e.kind === kindFilter)
        .map(e => ({ e, d: editDistance(py, e.py) }))
        .filter(x => x.d <= 1)
        .sort((a, b) => a.d - b.d || b.e.norm.length - a.e.norm.length);
      const seen = new Set();
      const unique = nearRows.filter(x => {
        const k = `${x.e.kind}|${x.e.value}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (unique.length === 1) return { entry: unique[0].e, len, method: "near" };
    }
    return null;
  }

  function tokenize(text, kindFilter) {
    const clean = norm(stripFillers(text));
    const add = [];
    const pending = [];
    const unheard = [];
    let unknown = "";
    let i = 0;
    const flush = () => {
      if (!unknown) return;
      if (Array.from(unknown).length >= 2) {
        const candidates = bestCandidates(unknown, kindFilter);
        if (candidates.length) pending.push({ raw: unknown, candidates });
        else unheard.push(unknown);
      }
      unknown = "";
    };
    while (i < clean.length) {
      const hit = findMatchAt(clean, i, kindFilter);
      if (hit) {
        flush();
        add.push({
          kind: hit.entry.kind,
          value: hit.entry.value,
          label: hit.entry.kind === "traits" ? hit.entry.label : hit.entry.value,
          count: hit.entry.count,
          via: hit.method,
        });
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
      unheard: [...new Set(unheard)],
    };
  }

  function parse(text, currentSignals) {
    const raw = String(text || "").trim();
    const out = { add: [], remove: [], clear: false, augTriple: [], pending: [], unheard: [] };
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
      out.unheard = got.unheard;
      return out;
    }

    const removeWord = REMOVE_WORDS.find(w => raw.includes(w));
    if (removeWord) {
      const target = raw.slice(raw.indexOf(removeWord) + removeWord.length);
      const got = tokenize(target);
      out.remove = got.add;
      out.pending = got.pending;
      out.unheard = got.unheard;
      return out;
    }

    const got = tokenize(raw);
    out.add = got.add;
    out.pending = got.pending;
    out.unheard = got.unheard;
    return out;
  }

  function assertIncludes(rows, kind, value) {
    if (!rows.some(x => x.kind === kind && x.value === value)) {
      throw new Error(`断言失败：缺少 ${kind}:${value}，实际=${JSON.stringify(rows)}`);
    }
  }
  function assertTrait(rows, count, value) {
    if (!rows.some(x => x.kind === "traits" && x.value === value && x.count === count)) {
      throw new Error(`断言失败：缺少 ${count}${value}，实际=${JSON.stringify(rows)}`);
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

    const f = parse("我是三小凯尔两护卫", []);
    assertTrait(f.add, 3, "小天才");
    assertIncludes(f.add, "units", "凯尔");
    assertTrait(f.add, 2, "护卫");
    if (f.pending.length) throw new Error("羁绊用例不应有候选：" + JSON.stringify(f.pending));

    const g = parse("来了个武器人两机甲", []);
    assertIncludes(g.add, "units", "贾克斯");
    assertTrait(g.add, 2, "战斗机甲");

    const h = parse("破败拿了龙爪大肉", []);
    assertIncludes(h.add, "units", "佛耶戈");
    assertIncludes(h.add, "items", "巨龙之爪");
    assertIncludes(h.add, "items", "狂徒铠甲");

    const i = parse("轮子妈轻语", []);
    assertIncludes(i.add, "units", "希维尔");
    assertIncludes(i.add, "items", "最后的轻语");

    const j = parse("然后的话那个嗯", [{ kind: "units", value: "凯尔" }]);
    if (j.add.length || j.pending.length || j.unheard.length) throw new Error("纯填充词应静默：" + JSON.stringify(j));
    console.log("signal-parser assertions passed");
  }

  const api = { parse, tokenize, norm, toPinyin, buildVocab, runTests };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
