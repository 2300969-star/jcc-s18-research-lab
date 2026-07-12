// 科研驾驶舱：把榜单结果重组为“假设-证据-实验”的研究工具
const fs = require('fs');
const { resultPath, reportPath, publicPath, ensureOutputDirs } = require('../lib/project-paths');

const read = file => JSON.parse(fs.readFileSync(resultPath(file), 'utf8'));

const model = read('model_results.json');
const discovery = read('discovery_results.json');
const transitions = read('transition_results.json');
const lens = read('numeric_lens_results.json');
let postgame = null;
try {
  postgame = read('postgame_review.json');
} catch (_) {
  postgame = null;
}

function first(arr) {
  return arr && arr.length ? arr[0] : null;
}

function pct(n) {
  return Math.round(Number(n) * 10) / 10;
}

function shortTeam(row) {
  return (row.team || []).map(x => x.name).join('、');
}

const topRoute = first(transitions.routes);
const topLens = first(lens.routes);
const lateTop = first(discovery.stageComps.late);
const midTop = first(discovery.stageComps.mid);
const officialTop = first((model.teamsearch || {}).officialScored || []);
const modelTop = first((model.teamsearch || {}).topTeams || []);
const failedJax = postgame && (postgame.reviews || []).find(x => x.id === 'jax-loss-20260705-a');
const workingJax = postgame && (postgame.reviews || []).find(x => x.id === 'jax-top2-20260705-b');

const out = {
  generated: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  title: '怪兽入侵 S18 阵容研究实验室',
  thesis: {
    headline: '不要再问“哪套是T0”，要问“什么机制在什么约束下被官方低估”。',
    currentTheory: '战斗机甲不是单一贾克斯答案，而是德莱文保血、贾克斯中期承接、蕾欧娜/五费控制争一的数值壳。',
    confidence: '中',
    why: [
      `官方梯队与模型分相关性只有 ρ=${model.spearman}，说明官方榜不是纯数值最优解。`,
      topRoute ? `过渡搜索第一名变为 ${topRoute.name}，标签含 ${topRoute.tags.join('、')}。` : '过渡搜索尚未生成。',
      failedJax ? `实战样本中贾克斯启动失败局只有 ${failedJax.twoStarStartupRatioPct}% 二星启动率。` : '缺少实战校准样本。',
      topLens ? topLens.keyFindings[0] : '数值透视尚未生成。',
    ],
  },
  instruments: [
    {
      name: '假设引擎',
      role: '把“我感觉强”改写成可证伪命题',
      output: '每个阵容必须绑定触发条件、反例样本和下一轮实验',
    },
    {
      name: '反事实引擎',
      role: '去掉单件装备/单个羁绊/单个五费，观察分数坍塌',
      output: '找真正的数值杠杆，而不是只看总DPS',
    },
    {
      name: '实战校准器',
      role: '用战绩回放反推启动率、命中率、生存时间',
      output: '把木桩模型修正成对局模型',
    },
    {
      name: '异常挖掘器',
      role: '寻找官方未命名但模型高分的组合',
      output: '生成可上分、可复现、可被推翻的新阵容候选',
    },
  ],
  hypotheses: [
    {
      id: 'H1',
      status: '支持',
      title: '官方S级不等于数值最强，只是高容错推荐集',
      evidence: `模型分 vs 官方梯队 Spearman ρ=${model.spearman}；官方最高同口径为 ${officialTop ? officialTop.name + ' ' + officialTop.score + '分' : '-'}。`,
      next: '继续找“官方配角当主C”与“官方未组壳”的高分异常。',
    },
    {
      id: 'H2',
      status: '修正',
      title: '贾克斯是吃分桥，不是无条件终局答案',
      evidence: failedJax && workingJax
        ? `启动失败样本 ${failedJax.twoStarStartupRatioPct}%；能启动样本 ${workingJax.twoStarStartupRatioPct}%。排序后终局贾克斯已退出前列。`
        : '需要更多实战样本。',
      next: '采集最后两回合样本，分离站位、控制、同行、是否三星四个变量。',
    },
    {
      id: 'H3',
      status: '强支持',
      title: '战斗机甲的颠覆点不是贾克斯，而是可继承的前中后期数值壳',
      evidence: topRoute ? `${topRoute.name} ${topRoute.score}分；${topRoute.verdict}` : '-',
      next: '验证德莱文开局、贾克斯中期、蕾欧娜终局的装备继承阈值。',
    },
    {
      id: 'H4',
      status: '待证伪',
      title: '官方配角蕾欧娜可能是版本最高上限主C之一',
      evidence: lateTop ? `后期候选第一：${lateTop.carry}${lateTop.carryStar}星 ${lateTop.score}分，${lateTop.officialFlag}；${lateTop.traits.slice(0, 4).join(' / ')}。` : '-',
      next: '测试蕾欧娜装备是否真能从德莱文/贾克斯平滑继承，还是模型被单体木桩误导。',
    },
  ],
  experimentQueue: [
    {
      name: '贾克斯启动率实验',
      variable: '三星/水银/站位/对手控制',
      method: '每局记录最后3回合主C伤害、死亡时间、是否摸到后排',
      success: '启动率稳定 >65% 才给终局主C权重',
      priority: 'P1',
    },
    {
      name: '蕾欧娜终局可行性',
      variable: '上9速度、二星概率、装备继承',
      method: '用抽卡模型叠加经济曲线，测从5-1到6-1的成型率',
      success: '成型概率与实战吃鸡率同时高于贾克斯终局线',
      priority: 'P1',
    },
    {
      name: '官方配角主C搜索',
      variable: '官方非主C英雄 + 三件套 + 羁绊壳',
      method: '对所有官方配角跑反事实主C，筛出高分但低推荐率样本',
      success: '找出至少3套官方未命名的可复现路线',
      priority: 'P2',
    },
    {
      name: '控制/站位惩罚模型',
      variable: '近战、远程、AOE、控制免疫、第一目标可达性',
      method: '把战绩图伤害与木桩预期相除，拟合 matchupAccess',
      success: '同一阵容的预测误差下降到20%以内',
      priority: 'P2',
    },
  ],
  frontier: [
    {
      label: '当前主线',
      title: topRoute ? topRoute.name : '-',
      score: topRoute ? topRoute.score : 0,
      claim: topRoute ? topRoute.verdict : '',
      team: topRoute ? ['前期 ' + topRoute.stages.early.carry, '中期 ' + topRoute.stages.mid.carry, '后期 ' + topRoute.stages.late.carry] : [],
    },
    {
      label: '官方配角颠覆',
      title: lateTop ? `${lateTop.carry}${lateTop.carryStar}星主C` : '-',
      score: lateTop ? lateTop.score : 0,
      claim: lateTop ? `${lateTop.officialFlag}，但后期搜索第一；${lateTop.carryItems.join('+')}` : '',
      team: lateTop ? lateTop.traits.slice(0, 5) : [],
    },
    {
      label: '模型自建异常',
      title: modelTop ? `${modelTop.carry}C 自建阵容` : '-',
      score: modelTop ? modelTop.score : 0,
      claim: modelTop ? `同口径 ${modelTop.score}分；${(modelTop.acts || []).slice(0, 5).join(' / ')}` : '',
      team: modelTop ? shortTeam(modelTop).split('、').slice(0, 8) : [],
    },
    {
      label: '实战反例',
      title: '贾克斯终局风险',
      score: failedJax ? failedJax.twoStarStartupRatioPct : 0,
      claim: failedJax ? `失败局启动率 ${failedJax.twoStarStartupRatioPct}%，最高伤害仅对面主C的 ${failedJax.carryGapPct}%。` : '等待样本。',
      team: ['近战攻速C', '启动时间', '控制/站位', '争一上限'],
    },
  ],
  anomalies: [
    {
      kind: '低相关',
      title: '官方榜与模型分只中等相关',
      detail: `ρ=${model.spearman}，这就是研究空间：官方推荐里混有容错、运营、热度，不是纯数值真相。`,
    },
    {
      kind: '高依赖',
      title: '中期贾克斯完整倍率极高',
      detail: topLens ? (topLens.stages.mid.carry.hero + ' 完整倍率 ' + topLens.stages.mid.carry.fullGainX + 'x；少 ' + topLens.stages.mid.carry.itemDrops[0].item + ' 掉 ' + topLens.stages.mid.carry.itemDrops[0].dropPct + '%。') : '-',
    },
    {
      kind: '反直觉',
      title: '后期蕾欧娜可以从配角变主C',
      detail: lateTop ? `${lateTop.score}分，阵容：${shortTeam(lateTop)}。` : '-',
    },
    {
      kind: '实战误差',
      title: '木桩DPS会高估近战攻速C',
      detail: failedJax ? `贾克斯失败局二星口径启动率 ${failedJax.twoStarStartupRatioPct}%，必须加 startupReliability。` : '-',
    },
  ],
  nextDataSchema: [
    'round: 回合，例如 6-5',
    'placement: 最终名次',
    'comp: 阵容羁绊',
    'carryDamage: 主C实际伤害',
    'enemyTopDamage: 对手最高伤害',
    'carryAliveSec: 主C存活秒数',
    'firstTarget: 第一攻击目标',
    'controlHits: 被控次数',
    'items/augments/stars: 装备、强化、星级',
  ],
};

function writeReport(data) {
  const lines = ['# 科研驾驶舱', '', `生成时间：${data.generated}`, '', `## 当前理论`, '', data.thesis.currentTheory, ''];
  lines.push('## 假设');
  data.hypotheses.forEach(h => {
    lines.push(`- ${h.id} [${h.status}] ${h.title}`);
    lines.push(`  - 证据：${h.evidence}`);
    lines.push(`  - 下一步：${h.next}`);
  });
  lines.push('', '## 下一轮实验');
  data.experimentQueue.forEach(e => {
    lines.push(`- [${e.priority}] ${e.name}：变量=${e.variable}；方法=${e.method}；成功标准=${e.success}`);
  });
  ensureOutputDirs();
  fs.writeFileSync(reportPath('科研驾驶舱.md'), lines.join('\n'));
}

fs.writeFileSync(resultPath('research_lab_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(publicPath('research-lab-data.js'), 'window.RESEARCH_LAB=' + JSON.stringify(out) + ';');
writeReport(out);

console.log('科研驾驶舱生成完成');
console.log(out.thesis.currentTheory);
out.hypotheses.forEach(h => console.log(`${h.id} [${h.status}] ${h.title}`));
console.log('输出: artifacts/results/research_lab_results.json, public/research-lab-data.js, docs/reports/科研驾驶舱.md');
