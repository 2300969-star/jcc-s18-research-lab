#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const RESULTS = path.join(ROOT, "artifacts", "results");
const OUTPUT = path.join(ROOT, "docs", "images", "research");
const WIDTH = 1200;
const HEIGHT = 680;
const C = {
  ink: "#172033",
  muted: "#667085",
  faint: "#98a2b3",
  grid: "#e4e7ec",
  paper: "#ffffff",
  panel: "#f8fafc",
  blue: "#2563eb",
  cyan: "#0891b2",
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
  violet: "#7c3aed",
};

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(RESULTS, `${name}.json`), "utf8"));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function t(x, y, value, size = 20, color = C.ink, weight = 400, anchor = "start", extra = "") {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}" ${extra}>${escapeXml(value)}</text>`;
}

function multiline(x, y, lines, size = 18, color = C.ink, weight = 400, gap = 1.35, anchor = "start") {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * gap : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function rect(x, y, w, h, fill = C.panel, stroke = "none", radius = 8, strokeWidth = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function line(x1, y1, x2, y2, stroke = C.grid, width = 1, dash = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
}

function circle(x, y, r, fill, stroke = "none", strokeWidth = 1) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function pill(x, y, value, fill, color = "#fff", width) {
  const w = width || Math.max(70, String(value).length * 16 + 28);
  return `${rect(x, y, w, 32, fill, "none", 16)}${t(x + w / 2, y + 22, value, 15, color, 650, "middle")}`;
}

function polyline(points, stroke, width = 3, fill = "none") {
  return `<polyline points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function frame(title, subtitle, body, source) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title)}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${C.paper}"/>
  <style>text{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;letter-spacing:0}</style>
  ${t(52, 58, title, 30, C.ink, 750)}
  ${t(52, 88, subtitle, 16, C.muted, 400)}
  ${line(52, 108, 1148, 108, C.grid, 1)}
  ${body}
  ${line(52, 642, 1148, 642, C.grid, 1)}
  ${t(52, 666, source, 13, C.faint, 400)}
  ${t(1148, 666, "JCC S18 Research Lab", 13, C.faint, 600, "end")}
</svg>`;
}

function save(name, content) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, name), content);
  console.log(`generated docs/images/research/${name}`);
}

function shortName(name, max = 16) {
  const clean = String(name).replace(/[【】]/g, "");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function figureAssetValue() {
  const weights = [
    ["主C本体", 60, C.blue],
    ["主C成装", 30, C.violet],
    ["副C本体", 24, C.cyan],
    ["前排本体", 16, C.green],
    ["功能棋子", 10, C.amber],
    ["羁绊亲和", 7, C.red],
  ];
  const max = 60;
  let body = "";
  body += rect(52, 132, 1096, 98, "#eff6ff", "#bfdbfe", 10);
  body += t(600, 173, "V(route | hand, level) = Σ held-role value + Σ future value × P(hit) + Baugment + Bprior", 22, C.blue, 700, "middle");
  body += t(600, 207, "阶段感不靠人工乘数，而由商店可见概率与未持有需求的折现自然产生", 16, C.muted, 450, "middle");
  body += t(52, 272, "角色基础权重", 20, C.ink, 700);
  weights.forEach(([label, value, color], i) => {
    const y = 302 + i * 49;
    body += t(52, y + 23, label, 16, C.ink, 600);
    body += rect(172, y, 450, 30, "#eef2f6", "none", 5);
    body += rect(172, y, 450 * value / max, 30, color, "none", 5);
    body += t(635, y + 22, `${value} 分`, 16, color, 700);
  });
  body += rect(720, 270, 428, 282, C.panel, C.grid, 10);
  body += t(748, 309, "组合算子", 20, C.ink, 700);
  body += pill(748, 332, "2星 ×1.5", C.blue, "#fff", 124);
  body += pill(884, 332, "3星 ×2.5", C.violet, "#fff", 124);
  body += pill(1020, 332, "三星核心 +18", C.green, "#fff", 112);
  body += multiline(748, 407, [
    "两散件可立即合成：成装价值 × 0.80",
    "单散件属于目标装备：成装价值 × 0.50",
    "认证先验：clamp((R - 50) / 10, -5, +5)",
    "未来价值：需求价值 × P(hit | 等级、费用、牌池)",
  ], 16, C.ink, 500, 1.75);
  body += rect(720, 572, 428, 42, "#ecfdf3", "#a7f3d0", 7);
  body += t(934, 599, "同一资产因承担角色不同而价值不同", 16, C.green, 700, "middle");
  save("formula-asset-value.svg", frame(
    "公式 01 · 资产角色价值模型",
    "从“清单命中”改为主C、装备、前排、功能位与概率折现的结构化估值",
    body,
    "口径：public/matcher-core.js fallbackWeights 与确定性算子常量"
  ));
}

function loadOdds() {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "public", "odds-data.js"), "utf8"), context);
  return context.globalThis.JCC_ODDS;
}

function heatColor(value) {
  if (value === 0) return "#f2f4f7";
  if (value <= 5) return "#dbeafe";
  if (value <= 15) return "#bfdbfe";
  if (value <= 30) return "#93c5fd";
  if (value <= 50) return "#60a5fa";
  if (value <= 75) return "#3b82f6";
  return "#1d4ed8";
}

function figureShopOdds() {
  const odds = loadOdds();
  const x0 = 260, y0 = 178, cw = 126, ch = 43;
  let body = t(52, 148, "等级 × 费用的单格商店占比", 20, C.ink, 700);
  for (let cost = 1; cost <= 5; cost++) body += t(x0 + (cost - 1) * cw + cw / 2, y0 - 16, `${cost}费`, 16, C.muted, 650, "middle");
  for (let level = 1; level <= 9; level++) {
    const y = y0 + (level - 1) * ch;
    body += t(x0 - 28, y + 28, `${level}级`, 16, C.ink, 650, "end");
    odds.shopOdds[level].forEach((value, i) => {
      const fill = heatColor(value);
      body += rect(x0 + i * cw, y, cw - 7, ch - 7, fill, "#fff", 5);
      body += t(x0 + i * cw + (cw - 7) / 2, y + 26, `${value}%`, 16, value >= 50 ? "#fff" : C.ink, 700, "middle");
    });
  }
  body += rect(52, 178, 160, 382, C.panel, C.grid, 9);
  body += t(72, 215, "概率折现", 19, C.ink, 700);
  body += multiline(72, 260, [
    "p(slot) =",
    "商店费用概率",
    "÷ 同费用棋子数",
    "× 剩余牌池系数",
    "",
    "E[金币] ≈",
    "目标张数 × 2",
    "÷ (5 × p(slot))",
  ], 16, C.muted, 500, 1.55);
  body += rect(260, 586, 623, 36, "#fff7ed", "#fed7aa", 6);
  body += t(572, 610, "0% 费用不伪造 999 金成本，统一进入“后期目标”", 15, C.amber, 700, "middle");
  body += t(925, 202, "牌池份数", 18, C.ink, 700);
  Object.entries(odds.poolCopies).forEach(([cost, copies], i) => {
    const y = 232 + i * 58;
    body += pill(925, y, `${cost}费`, [C.blue, C.cyan, C.green, C.amber, C.violet][i], "#fff", 68);
    body += t(1008, y + 22, `每张 ${copies} 份`, 16, C.ink, 650);
  });
  save("formula-shop-odds.svg", frame(
    "公式 02 · 商店概率与可达性折现",
    "低等级自然压低高费终局价值，高等级恢复核心棋子与追三成本",
    body,
    "数据：public/odds-data.js；概率来源注释见该文件，牌池份数按 S8 同口径"
  ));
}

function evidenceFactor(level) {
  if (String(level).startsWith("L2.5")) return 1;
  if (String(level).startsWith("L2")) return 0.65;
  return 0.35;
}

function figureAugmentOperators() {
  const cert = read("route_certification_results");
  const categories = ["英雄专属", "战力", "经济", "装备"];
  const colors = [C.violet, C.red, C.green, C.blue];
  const rows = categories.map((category) => {
    const best = [...cert.conditionRankings[category]].sort((a, b) => b.conditionScore - a.conditionScore)[0];
    const q = evidenceFactor(best.evidenceLevel);
    const lift = Number(best.conditionLift);
    const hardGate = !Number.isFinite(lift);
    const bounded = hardGate ? 0 : Math.min(12, 0.5 * lift);
    return { category, best, q, lift, hardGate, operator: q * bounded };
  });
  let body = rect(52, 134, 1096, 68, "#faf5ff", "#ddd6fe", 9);
  body += t(600, 164, "b = qₑ × min(12, 0.5 × Δcondition)", 23, C.violet, 750, "middle");
  body += t(600, 189, "qₑ = { L2.5: 1.00, L2: 0.65, L1.5: 0.35 }，单项封顶12分、合计封顶18分", 15, C.muted, 500, "middle");
  rows.forEach((row, i) => {
    const y = 238 + i * 88;
    const maxW = 380;
    body += pill(52, y, row.category, colors[i], "#fff", 92);
    body += t(160, y + 20, shortName(row.best.templateName, 19), 16, C.ink, 650);
    body += t(160, y + 44, `门槛：${row.best.gates.map((x) => x.value).join(" / ")}`, 14, C.muted, 450);
    body += rect(506, y + 2, maxW, 24, "#eef2f6", "none", 5);
    body += rect(506, y + 2, row.hardGate ? maxW : Math.min(maxW, row.lift / 65 * maxW), 24, row.hardGate ? "#ddd6fe" : "#cbd5e1", "none", 5);
    body += t(900, y + 20, row.hardGate ? "专属机制硬门槛" : `原始抬升 ${row.lift.toFixed(1)}`, 14, C.muted, 600);
    body += rect(506, y + 36, maxW, 24, "#eef2f6", "none", 5);
    body += rect(506, y + 36, row.hardGate ? maxW : row.operator / 12 * maxW, 24, colors[i], "none", 5);
    body += t(900, y + 54, row.hardGate ? "机制开关，非软加分" : `入场算子 ${row.operator.toFixed(1)} 分`, 14, colors[i], 700);
    body += pill(1040, y + 15, row.best.evidenceLevel.split(" ")[0], "#f2f4f7", C.ink, 74);
  });
  body += rect(52, 598, 1096, 30, "#fef2f2", "#fecaca", 5);
  body += t(600, 619, "符文不是固定加分：先经过条件抬升、证据等级、成熟度与类别算子的四层约束", 15, C.red, 650, "middle");
  save("formula-augment-operator.svg", frame(
    "公式 03 · 条件符文算子",
    "以每类当前最强条件路线为例，展示原始抬升如何被证据等级折扣后进入比赛模式",
    body,
    `数据：route_certification_results.json，${cert.sampleSize.toLocaleString("en-US")} 次/路线蒙特卡洛认证`
  ));
}

function stageCard(x, stage, width, color) {
  const team = stage.team.map((u) => typeof u === "string" ? u : u.name);
  const shown = team.slice(0, 7).join(" · ");
  return [
    rect(x, 170, width, 348, "#fff", C.grid, 10, 1.5),
    rect(x, 170, width, 8, color, "none", 4),
    t(x + 24, 214, `${stage.label} · ${stage.carry}${stage.carryStar || 2}星`, 21, C.ink, 750),
    pill(x + width - 92, 190, `${stage.score}分`, color, "#fff", 68),
    t(x + 24, 252, `核心装备`, 15, C.muted, 600),
    multiline(x + 24, 281, stage.items, 16, C.ink, 600, 1.45),
    t(x + 24, 376, `棋盘 ${team.length} 人`, 15, C.muted, 600),
    multiline(x + 24, 405, [shown.slice(0, 24), shown.slice(24, 48), shown.slice(48, 72)].filter(Boolean), 15, C.ink, 500, 1.5),
    t(x + 24, 491, shortName(stage.traits.slice(0, 3).join(" · "), 26), 14, color, 650),
  ].join("");
}

function figureMechaTransition() {
  const transitions = read("transition_results");
  const route = transitions.routes.find((x) => x.name.includes("贾克斯 -> 蕾欧娜"));
  const stages = [route.stages.early, route.stages.mid, route.stages.late];
  const colors = [C.cyan, C.blue, C.violet];
  const xs = [52, 428, 804];
  let body = "";
  stages.forEach((stage, i) => { body += stageCard(xs[i], stage, 344, colors[i]); });
  [[396, 428], [772, 804]].forEach(([a, b], i) => {
    body += line(a, 340, b - 8, 340, C.amber, 4);
    body += `<path d="M${b - 14} 332 L${b - 2} 340 L${b - 14} 348" fill="none" stroke="${C.amber}" stroke-width="4"/>`;
    const trans = i === 0 ? route.transition.earlyToMid : route.transition.midToLate;
    body += pill(a - 14, 535, `保留${trans.keep.length}人`, C.amber, "#fff", 82);
  });
  body += rect(52, 574, 1096, 48, "#fff7ed", "#fed7aa", 7);
  body += t(600, 604, `路径总分 ${route.score} · 平滑 ${route.smooth} · 风险 ${route.risk} · 装备继承 3件 → 2件`, 17, C.amber, 700, "middle");
  save("lineup-mecha-transition.svg", frame(
    "阵容推导 01 · 机甲主C交接链",
    "阶段战力、棋盘重合与装备继承联合求解：贾克斯稳中期，蕾欧娜接终局上限",
    body,
    "数据：transition_results.json；路线“战斗机甲：贾克斯 → 蕾欧娜”"
  ));
}

function figureJinxGrowth() {
  const data = read("jinx_sisters_results");
  const growth = data.growth;
  const plot = { x: 78, y: 182, w: 650, h: 338 };
  const x = (kills) => plot.x + kills / 40 * plot.w;
  const y = (dps) => plot.y + plot.h - dps / 850 * plot.h;
  let body = t(plot.x, 150, "姐妹强化：参与击杀 → 法强叠层 → 炮弹数阶跃", 19, C.ink, 700);
  for (let d = 0; d <= 800; d += 200) {
    body += line(plot.x, y(d), plot.x + plot.w, y(d), C.grid, 1);
    body += t(plot.x - 14, y(d) + 5, `${d}`, 13, C.muted, 500, "end");
  }
  for (let k = 0; k <= 40; k += 10) {
    body += line(x(k), plot.y, x(k), plot.y + plot.h, C.grid, 1);
    body += t(x(k), plot.y + plot.h + 24, `${k}击杀`, 13, C.muted, 500, "middle");
  }
  body += polyline(growth.map((p) => [x(p.kills), y(p.dps)]), C.violet, 4);
  growth.forEach((p) => {
    body += circle(x(p.kills), y(p.dps), 7, C.violet, "#fff", 3);
    if ([0, 20, 40].includes(p.kills)) body += t(x(p.kills), y(p.dps) - 16, `${p.dps} DPS`, 14, C.violet, 700, "middle");
  });
  [20, 40].forEach((k) => body += line(x(k), plot.y, x(k), plot.y + plot.h, C.amber, 2, "6 5"));
  body += pill(x(20) - 45, 532, "2枚炮弹", C.amber, "#fff", 90);
  body += pill(x(40) - 45, 532, "3枚炮弹", C.amber, "#fff", 90);
  body += rect(774, 142, 374, 418, C.panel, C.grid, 10);
  body += t(798, 180, "终局壳体反事实", 20, C.ink, 700);
  const maxScore = Math.max(...data.boards.map((b) => b.score));
  data.boards.forEach((board, i) => {
    const yy = 216 + i * 102;
    body += t(798, yy, board.name, 16, C.ink, 650);
    body += rect(798, yy + 16, 270, 18, "#e4e7ec", "none", 5);
    body += rect(798, yy + 16, 270 * board.score / maxScore, 18, [C.violet, C.blue, C.green][i], "none", 5);
    body += t(1080, yy + 31, `${board.score}分`, 14, [C.violet, C.blue, C.green][i], 700);
    body += t(798, yy + 56, `20层DPS ${board.dps20} · 前排EHP ${board.frontEhp.toLocaleString("en-US")}`, 13, C.muted, 500);
  });
  body += rect(774, 580, 374, 42, "#faf5ff", "#ddd6fe", 7);
  body += t(961, 606, "最优：超英幻灵姐妹 1032分", 15, C.violet, 700, "middle");
  save("lineup-jinx-growth.svg", frame(
    "阵容推导 02 · 无限技能金克丝",
    "不是照搬社媒阵容：分别验算成长曲线、导弹阈值与三种终局壳体",
    body,
    "数据：jinx_sisters_results.json；装备为蓝霸符、朔极之矛、珠光护手"
  ));
}

function paretoFront(rows) {
  return rows.filter((a) => !rows.some((b) => b !== a && b.carryDps >= a.carryDps && b.frontEHP >= a.frontEHP && (b.carryDps > a.carryDps || b.frontEHP > a.frontEHP)));
}

function figureSolverFrontier() {
  const meta = read("meta_discovery_results");
  const rows = meta.stable;
  const frontier = paretoFront(rows).sort((a, b) => a.frontEHP - b.frontEHP);
  const xMin = Math.min(...rows.map((r) => r.frontEHP)) * 0.9;
  const xMax = Math.max(...rows.map((r) => r.frontEHP)) * 1.05;
  const yMax = Math.max(...rows.map((r) => r.carryDps)) * 1.08;
  const plot = { x: 104, y: 155, w: 1000, h: 420 };
  const x = (v) => plot.x + (v - xMin) / (xMax - xMin) * plot.w;
  const y = (v) => plot.y + plot.h - v / yMax * plot.h;
  let body = "";
  for (let i = 0; i <= 4; i++) {
    const val = xMin + (xMax - xMin) * i / 4;
    body += line(x(val), plot.y, x(val), plot.y + plot.h, C.grid, 1);
    body += t(x(val), plot.y + plot.h + 27, `${Math.round(val / 1000)}k EHP`, 13, C.muted, 500, "middle");
  }
  for (let i = 0; i <= 4; i++) {
    const val = yMax * i / 4;
    body += line(plot.x, y(val), plot.x + plot.w, y(val), C.grid, 1);
    body += t(plot.x - 16, y(val) + 4, `${Math.round(val)}`, 13, C.muted, 500, "end");
  }
  body += t(34, 375, "主C DPS", 14, C.muted, 600, "middle", 'transform="rotate(-90 34 375)"');
  body += polyline(frontier.map((r) => [x(r.frontEHP), y(r.carryDps)]), C.amber, 3);
  rows.forEach((r) => {
    const isFrontier = frontier.includes(r);
    const radius = 6 + Math.max(0, r.score - 1700) / 220;
    body += circle(x(r.frontEHP), y(r.carryDps), radius, isFrontier ? C.amber : "#93c5fd", "#fff", 2);
  });
  [...rows].sort((a, b) => b.score - a.score).slice(0, 7).forEach((r, i) => {
    const dx = i % 2 ? 12 : -12;
    body += t(x(r.frontEHP) + dx, y(r.carryDps) - 13, shortName(r.displayName, 12), 13, C.ink, 650, dx > 0 ? "start" : "end");
  });
  body += pill(865, 126, "橙色 = Pareto前沿", C.amber, "#fff", 176);
  body += pill(1049, 126, `${rows.length}套求解阵容`, C.blue, "#fff", 99);
  body += rect(104, 604, 1000, 28, "#fff7ed", "#fed7aa", 5);
  body += t(604, 624, "Pareto 前沿：不存在另一套阵容同时拥有更高主C输出与更厚前排", 14, C.amber, 650, "middle");
  save("lineup-solver-frontier.svg", frame(
    "阵容推导 03 · 全队求解器 Pareto 前沿",
    "联合优化主C输出、前排EHP与全队结构，避免只追逐单个最高DPS",
    body,
    "数据：meta_discovery_results.json stable；气泡大小映射全队总分"
  ));
}

function figureCertification() {
  const cert = read("route_certification_results");
  const rows = [...cert.certificates].sort((a, b) => b.metrics.robustness - a.metrics.robustness).slice(0, 10);
  const x0 = 390, maxW = 620;
  let body = "";
  rows.forEach((row, i) => {
    const y = 142 + i * 47;
    const m = row.metrics;
    body += t(52, y + 19, `${i + 1}`, 14, C.faint, 650);
    body += t(80, y + 19, shortName(row.templateName, 20), 15, C.ink, 600);
    body += rect(x0, y + 2, maxW, 22, "#eef2f6", "none", 5);
    body += rect(x0, y + 2, maxW * m.robustness / 100, 22, m.robustness >= 80 ? C.green : m.robustness >= 60 ? C.blue : C.amber, "none", 5);
    body += t(x0 + maxW + 12, y + 19, `${m.robustness}%`, 14, C.ink, 700);
    body += circle(1095, y + 13, Math.max(3, Math.sqrt(m.failureRate + 0.1) * 3), m.failureRate <= 1 ? C.green : C.red);
  });
  body += t(390, 625, "稳健度 R", 14, C.muted, 600);
  body += pill(974, 593, "圆点=失速率", "#f2f4f7", C.muted, 126);
  body += rect(52, 598, 840, 32, "#ecfdf3", "#a7f3d0", 6);
  body += t(472, 620, "R = 40%×前25%率 + 20%×前5率 + 25%×(1−失速率) + 15%×尾部下限", 14, C.green, 650, "middle");
  save("validation-certification.svg", frame(
    "模型验算 01 · 路线稳健性认证",
    "同随机种子联合扰动经济、商店、装备、对手与转型节奏，展示当前稳健度前十",
    body,
    `数据：route_certification_results.json；${cert.certificates.length}路线 × ${cert.sampleSize.toLocaleString("en-US")}样本 = ${(cert.certificates.length * cert.sampleSize).toLocaleString("en-US")}次`
  ));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function figureTierValidation() {
  const model = read("model_results");
  const tiers = ["S", "A", "B"];
  const colors = { S: C.blue, A: C.green, B: C.amber };
  const plot = { x: 120, y: 158, w: 720, h: 400 };
  const min = -1.6, max = 1.8;
  const y = (v) => plot.y + plot.h - (v - min) / (max - min) * plot.h;
  let body = "";
  for (let v = -1.5; v <= 1.5; v += 0.5) {
    body += line(plot.x, y(v), plot.x + plot.w, y(v), C.grid, 1);
    body += t(plot.x - 14, y(v) + 5, v.toFixed(1), 13, C.muted, 500, "end");
  }
  tiers.forEach((tier, ti) => {
    const center = plot.x + 140 + ti * 220;
    const rows = model.comps.filter((c) => c.quality === tier);
    rows.forEach((row, i) => {
      const jitter = ((i * 37) % 91) - 45;
      body += circle(center + jitter, y(row.score), 6, colors[tier], "#fff", 1.5);
    });
    const med = median(rows.map((r) => r.score));
    body += line(center - 72, y(med), center + 72, y(med), C.ink, 4);
    body += t(center, plot.y + plot.h + 35, `${tier}级 · n=${rows.length}`, 16, colors[tier], 700, "middle");
    body += t(center, plot.y + plot.h + 58, `中位 ${med.toFixed(2)}`, 14, C.muted, 500, "middle");
  });
  body += rect(886, 158, 262, 260, C.panel, C.grid, 10);
  body += t(1017, 204, "官方梯队相关性", 18, C.ink, 700, "middle");
  body += t(1017, 278, `ρ = ${model.spearman.toFixed(3)}`, 44, C.violet, 800, "middle");
  body += multiline(1017, 328, ["Spearman 等级相关", "n = 44 套官方阵容"], 15, C.muted, 500, 1.55, "middle");
  body += rect(886, 438, 262, 120, "#fef2f2", "#fecaca", 9);
  body += multiline(1017, 474, ["诚实边界", "相关性偏弱", "模型不能冒充版本真值"], 15, C.red, 650, 1.55, "middle");
  body += rect(120, 606, 1028, 26, "#faf5ff", "#ddd6fe", 5);
  body += t(634, 625, "该图刻意保留离群点：它们是下一轮机制建模与真实对局留出集的研究入口", 14, C.violet, 650, "middle");
  save("validation-tier-correlation.svg", frame(
    "模型验算 02 · 官方梯队与模型分相关性",
    "展示全部44套官方阵容，不隐藏分布重叠与反例",
    body,
    "数据：model_results.json；模型分 = 55%主C标准分 + 45%前排EHP标准分"
  ));
}

function figurePrimeExperiment() {
  const data = read("mecha_prime_results");
  const stages = [data.stages.early, data.stages.mid, data.stages.late];
  const colors = [C.cyan, C.blue, C.violet];
  const allRows = stages.flatMap((stage, si) => stage.ranking.map((row) => ({ ...row, stage: stage.label, si })));
  const maxOutput = Math.max(...allRows.map((x) => x.teamOutput));
  let body = "";
  stages.forEach((stage, si) => {
    const x = 52 + si * 370;
    body += t(x, 150, `${stage.label} · ${stage.mechaTier}机甲`, 19, colors[si], 750);
    stage.ranking.slice(0, si === 2 ? 5 : 3).forEach((row, i) => {
      const y = 184 + i * 63;
      body += t(x, y + 17, `${i + 1}. ${row.holder}`, 15, C.ink, 650);
      body += rect(x + 94, y, 210, 22, "#eef2f6", "none", 5);
      body += rect(x + 94, y, 210 * row.teamOutput / maxOutput, 22, colors[si], "none", 5);
      body += t(x + 314, y + 17, `${row.teamOutput}`, 14, colors[si], 700);
    });
    body += rect(x, 522, 330, 68, "#fff", colors[si], 8, 1.5);
    body += t(x + 165, 550, `最优至尊：${stage.winner.holder}`, 17, C.ink, 750, "middle");
    body += t(x + 165, 575, `全队输出 ${stage.winner.teamOutput}`, 14, colors[si], 650, "middle");
  });
  body += line(360, 470, 420, 470, C.amber, 3);
  body += line(730, 470, 790, 470, C.amber, 3);
  body += pill(336, 452, "转交", C.amber, "#fff", 54);
  body += pill(706, 452, "转交", C.amber, "#fff", 54);
  body += rect(52, 608, 1096, 24, "#fff7ed", "#fed7aa", 5);
  body += t(600, 626, "对照结论：至尊给瑟提类前排并非零收益，但终局比蕾欧娜2星少199全队输出", 14, C.amber, 650, "middle");
  save("validation-mecha-prime.svg", frame(
    "模型验算 03 · 至尊机甲持有者反事实",
    "固定阶段棋盘与主C装备，仅替换至尊持有者，逐人重跑战斗模型",
    body,
    "数据：mecha_prime_results.json；3机甲+60/60，5机甲至尊+110/110"
  ));
}

figureAssetValue();
figureShopOdds();
figureAugmentOperators();
figureMechaTransition();
figureJinxGrowth();
figureSolverFrontier();
figureCertification();
figureTierValidation();
figurePrimeExperiment();
