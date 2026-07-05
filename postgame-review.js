// 实战回放校准：把战绩图里的真实伤害反馈到数值模型
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const lens = JSON.parse(fs.readFileSync(path.join(ROOT, 'numeric_lens_results.json'), 'utf8'));

const samples = [
  {
    id: 'jax-loss-20260705-a',
    source: '9b8e855ff6ad91c8b720e56daaa108ac.jpg / 4fb4c47bed0a45b3f344ac784fceafb8.jpg',
    placement: 3,
    observedRound: '6-5',
    shownRoundResult: 'loss',
    compRead: '5战斗机甲 / 4斗士 / 护卫挂件',
    userTopDamage: 1524,
    enemyTopDamage: 13235,
    userDamageLine: [1524, 762, 658, 449, 417, 277, 179, 126],
    enemyDamageLine: [13235, 5472, 3599, 1812, 914, 498, 393, 356],
    interpretation: '最高输出只有对面主C的11.5%，属于贾克斯启动失败局，不能按30秒木桩DPS计分。',
    tags: ['启动失败', '近战攻速C', '后排爆发压制'],
  },
  {
    id: 'jax-top2-20260705-b',
    source: '07ca1b5721c7178e3a5cd339335567a6.jpg / 4c7be540d81b66b7e8d30abc764e2edc.jpg',
    placement: 2,
    observedRound: '6-3',
    shownRoundResult: 'win',
    compRead: '5战斗机甲 / 4斗士 / 护卫挂件',
    userTopDamage: 5281,
    enemyTopDamage: 2362,
    userDamageLine: [5281, 3898, 3767, 2034, 1313, 1006, 993],
    enemyDamageLine: [2362, 2280, 1660, 1532, 500, 446, 437, 285],
    interpretation: '截图回合是赢的，说明贾克斯能启动时可以吃分；但最终第二，争一还要看最后对榜一的站位、控制和五费上限。',
    tags: ['能启动', '吃分强', '争一待补终局'],
  },
];

function findJaxProfiles() {
  const found = {};
  for (const route of lens.routes || []) {
    for (const key of ['mid', 'late', 'early']) {
      const stage = route.stages && route.stages[key];
      if (!stage || !stage.carry || stage.carry.hero !== '贾克斯') continue;
      const row = { route: route.name, stage: key, profile: stage.carry };
      if (stage.carry.star === 2 && !found.twoStar) found.twoStar = row;
      if (stage.carry.star === 3 && !found.threeStar) found.threeStar = row;
      if (key === 'late' && !found.late) found.late = row;
    }
  }
  found.terminal = found.threeStar || found.late || null;
  found.main = found.terminal || found.twoStar || null;
  return found;
}

function round(n, d = 1) {
  const p = 10 ** d;
  return Math.round((Number(n) || 0) * p) / p;
}

const jaxProfiles = findJaxProfiles();
const terminalJax = jaxProfiles.terminal;
const mainJax = jaxProfiles.main;
const twoStarJax = jaxProfiles.twoStar;
const referenceDps = mainJax ? mainJax.profile.dps : 0;
const twoStarDps = twoStarJax ? twoStarJax.profile.dps : 0;
const fightWindowSec = 12;

function calibrate(sample) {
  const expectedWindowDamage = referenceDps * fightWindowSec;
  const expectedTwoStarWindowDamage = twoStarDps * fightWindowSec;
  const startupRatio = expectedWindowDamage ? sample.userTopDamage / expectedWindowDamage : 0;
  const twoStarStartupRatio = expectedTwoStarWindowDamage ? sample.userTopDamage / expectedTwoStarWindowDamage : 0;
  const carryGap = sample.enemyTopDamage ? sample.userTopDamage / sample.enemyTopDamage : 0;
  let verdict;
  if (sample.shownRoundResult === 'loss' && (twoStarStartupRatio || startupRatio) < 0.25) {
    verdict = '强降级：这类局不能把贾克斯当终局主C，只能当过渡或副C。';
  } else if (sample.placement <= 2 && sample.shownRoundResult === 'win') {
    verdict = '保留吃分评级：能赢中后期回合，但争一需要终局补蕾欧娜/厄加特/费德提克/辛德拉等控制或高费输出。';
  } else {
    verdict = '轻降级：需要更多最后一回合样本确认。';
  }
  return {
    ...sample,
    modelReference: {
      mainRoute: mainJax && mainJax.route,
      mainStage: mainJax && mainJax.stage,
      mainJaxDps: referenceDps,
      mainLabel: terminalJax ? '终局贾克斯' : '二星中期贾克斯',
      terminalRoute: terminalJax && terminalJax.route,
      terminalStage: terminalJax && terminalJax.stage,
      terminalJaxDps: terminalJax && terminalJax.profile.dps,
      twoStarRoute: twoStarJax && twoStarJax.route,
      twoStarStage: twoStarJax && twoStarJax.stage,
      twoStarJaxDps: twoStarDps,
      assumedFightWindowSec: fightWindowSec,
      expectedWindowDamage: round(expectedWindowDamage, 0),
      expectedTwoStarWindowDamage: round(expectedTwoStarWindowDamage, 0),
    },
    startupRatioPct: round(startupRatio * 100, 1),
    twoStarStartupRatioPct: round(twoStarStartupRatio * 100, 1),
    carryGapPct: round(carryGap * 100, 1),
    verdict,
  };
}

const reviews = samples.map(calibrate);

const out = {
  generated: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  subject: '5战斗机甲贾克斯实战校准',
  reference: jaxProfiles,
  reviews,
  modelPatch: {
    missingVariable: '近战攻速C的真实启动系数',
    formula: 'effectiveCarryDamage = modelDps * fightWindowSec * startupReliability * matchupAccess',
    recommendedDefaults: [
    '贾克斯二星：只给过渡/吃分权重，不给争一终局权重',
    '贾克斯三星且有无情连打/水银/稳定防控：才上调到 0.70-0.85',
      '遇到后排爆发、强控、拉扯或无法第一时间摸到目标：下调到 0.25-0.45',
      '如果实战最高伤害低于模型12秒窗口的20%，判定为启动失败，阵容分强降级。',
    ],
    practicalRule: '贾克斯是强过渡和吃分核心，不应默认等同于争一终局；5阶段以后如果没有三星/关键强化/防控，模型应鼓励转蕾欧娜或补五费控制。',
  },
};

function writeReport(data) {
  const lines = [
    '# 贾克斯两局实战校准',
    '',
    `生成时间：${data.generated}`,
    '',
    `参考模型：${data.reference.terminal ? `终局口径 ${data.reference.terminal.route} / ${data.reference.terminal.stage} / 贾克斯 ${data.reference.terminal.profile.dps} DPS` : '当前前列路线未保留终局贾克斯口径'}`,
    data.reference.twoStar ? `二星口径：${data.reference.twoStar.route} / ${data.reference.twoStar.stage} / 贾克斯 ${data.reference.twoStar.profile.dps} DPS` : '二星口径：未找到',
    '',
    '## 结论',
    '',
    '- 这两局暴露的不是“贾克斯完全不强”，而是“模型把近战攻速C当成稳定站桩输出”这个假设太乐观。',
    '- 第一把 6-5 是启动失败样本：你最高输出 1524，对面最高 13235，模型必须强降级。',
    '- 第二把 6-3 截图回合其实赢了：贾克斯最高 5281，说明它能吃分；但最终第二，争一还缺最后对榜一的终局样本。',
    '- 因此贾克斯二星应被模型定位为强过渡/吃分C；争一条件必须绑定三星、关键强化、防控和五费上限。',
    '',
    '## 样本',
    '',
  ];

  data.reviews.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.id}`);
    lines.push('');
    lines.push(`- 名次/回合：第${r.placement}名，${r.observedRound}，截图回合 ${r.shownRoundResult}`);
    lines.push(`- 阵容读数：${r.compRead}`);
    lines.push(`- 伤害读数：你最高 ${r.userTopDamage}，对面最高 ${r.enemyTopDamage}，相当于对面最高的 ${r.carryGapPct}%`);
    lines.push(`- 按 ${r.modelReference.assumedFightWindowSec} 秒窗口估算，${r.modelReference.mainLabel}期望伤害 ${r.modelReference.expectedWindowDamage}，实战启动率约 ${r.startupRatioPct}%`);
    if (r.modelReference.twoStarJaxDps) {
      lines.push(`- 若按二星贾克斯 ${r.modelReference.twoStarJaxDps} DPS 估算，期望伤害 ${r.modelReference.expectedTwoStarWindowDamage}，实战启动率约 ${r.twoStarStartupRatioPct}%`);
    }
    lines.push(`- 判断：${r.interpretation}`);
    lines.push(`- 模型处理：${r.verdict}`);
    lines.push('');
  });

  lines.push('## 模型修正');
  lines.push('');
  lines.push(`缺失变量：${data.modelPatch.missingVariable}`);
  lines.push('');
  data.modelPatch.recommendedDefaults.forEach(x => lines.push(`- ${x}`));
  lines.push(`- 实战规则：${data.modelPatch.practicalRule}`);
  lines.push('');

  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', '贾克斯两局实战校准.md'), lines.join('\n'));
}

fs.writeFileSync(path.join(ROOT, 'postgame_review.json'), JSON.stringify(out, null, 1));
writeReport(out);

console.log('实战校准完成');
out.reviews.forEach(r => {
  console.log(`${r.id}: 启动率约 ${r.startupRatioPct}% | ${r.verdict}`);
});
console.log('输出: postgame_review.json, reports/贾克斯两局实战校准.md');
