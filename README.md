# 金铲铲怪兽入侵 研究文件夹

研究金铲铲之战 S18「怪兽入侵：铲铲市危机」的最强阵容、装备与强化符文。
数据直接取自 jcc.qq.com 官网背后的公开数据接口（game.gtimg.cn CDN），非网页爬取。

## 看什么

- **`reports/科研驾驶舱.md`** —— 当前主线：把阵容研究改成“假设-证据-实验”的科研工作台
- **`可视化/index.html`** —— 主仪表盘（浏览器直接打开）：首屏为「二阶段交互匹配器」，可直接输入棋子/装备/符文搜索路线，下接科研驾驶舱、阵容发现、自由搜索、数值透视和审计证据库
- **`可视化/match.html`** —— 比赛模式（浏览器直接打开）：面向对局中输入法口述，快车道本地解析，LLM 慢车道只把没听懂的文本翻译成标准信号，不参与打分
- **`reports/二阶段交互匹配器.md`** —— 可点击工具的数据设计：根据二阶段棋子/装备/符文实时重排阵容路线
- **`reports/阵容发现研究.md`** —— 从棋子属性、装备、羁绊、抽卡概率反推官方之外的强阵容候选
- **`报告-最强阵容与符文装备.md`** —— 主报告：版本梯队、符文榜、装备榜、怪兽推荐（先看这个）
- `notes/阵容全量明细.md` —— 官方 44 套阵容逐套完整明细（站位棋子、出装、符文、运营思路、克制关系）
- `discover.js` —— 阵容发现引擎：阶段阵容搜索、数值怪、抽卡概率、符文线索，输出 `discovery_results.json`
- `transition.js` —— 平滑过渡路线：把前期/中期/后期候选串成可落地运营路线
- `numeric-lens.js` —— 数值透视：拆主C裸装/装备/羁绊/完整DPS、装备边际、羁绊边际和前排EHP
- `postgame-review.js` —— 实战校准：把战绩回放里的真实伤害反推成启动率/终局风险
- `research-lab.js` —— 科研驾驶舱：把模型结果重组为假设、证据链、异常信号和下一轮实验
- `stage2-matcher.js` —— 二阶段匹配器：把官方早期阵容、散件优先级、符文推荐和研究模板合成可交互路线库
- `reinvent.js` —— 官方阵容再发明：从属性闭环反推官方阵容的装备/符文/棋子替换变体
- `mecha-branch.js` —— 机甲线分叉实验：固定机甲壳子，比较贾克斯、蕾欧娜、瑟提、佛耶戈终局路线
- `model.js` —— 数值模型源码（战斗模拟/EHP/经济/验证），输出 model_results.json
- `audit.js` —— 数值与 Bug 审计入口：检查官方数据一致性、技能解析覆盖率、装备特效覆盖率、异常组合搜索，输出 `audit_results.json` 和 `reports/数值与Bug审计.md`
- **`审计可视化/index.html`** —— 数值 QA 面板：P1/P2/P3 筛选、技能漏算、装备漏算、异常组合搜索结果浏览

## 阵容发现 / 找更强组合

```bash
node discover.js
node postgame-review.js
node transition.js
node numeric-lens.js
node research-lab.js
node stage2-matcher.js
node reinvent.js
node mecha-branch.js
```

会生成：

- `discovery_results.json`
- `可视化/discovery-data.js`
- `reports/阵容发现研究.md`
- `reports/平滑过渡阵容路线.md`
- `reports/数值透视.md`
- `reports/贾克斯两局实战校准.md`
- `reports/科研驾驶舱.md`
- `reports/二阶段交互匹配器.md`
- `reports/机甲分叉实验.md`

核心问题不是“官方阵容哪里弱”，而是：

- 哪些棋子在不同阶段是数值怪？
- 哪些装备组合能把非官方主C推上来？
- 哪些前期/中期/后期阵容在模型里更强？
- 这条线的抽卡概率和成型成本是否支持实战？
- 哪个假设被实战样本推翻，下一局应该采集什么证据？

## 比赛模式 LLM 慢车道

浏览器直连 `https://yuyumaster.com/v1/chat/completions` 的 CORS 预检当前不放行，所以比赛模式默认使用本地代理地址：

```bash
node llm-proxy.js
```

然后打开 `可视化/match.html`，右上角设置里填 API Key。API 地址可切换：

- `http://127.0.0.1:8787/v1`：本地代理，推荐
- `https://yuyumaster.com/v1`：直连，只有服务端允许 CORS 时可用
- `mock`：本地模拟响应，用于无 Key 验证慢车道和校验层

Key 只存浏览器 localStorage，代理只透传请求，不落盘。LLM 只翻译口述信号，最终阵容排序仍由本地模型完成。

## 数值审计 / 挖 Bug

```bash
node audit.js
```

模块可单独运行：

```bash
node audit-data.js          # 阵容 contact、引用缺失、同名英雄多记录
node audit-skill-parser.js  # 技能解析漏算：百分比伤害、护盾、治疗、控制等
node audit-items.js         # 装备基础属性与特效覆盖率
node audit-outliers.js      # 英雄 x 装备 暴力搜索异常 DPS/EHP 候选
```

查看审计前端：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:8765/审计可视化/index.html`。

## 怎么更新

游戏出新版本后（约两周一次），运行：

```bash
./update.sh
```

自动检测最新版本号 → 重新下载全部数据 → 重新生成明细和统计。
主报告的结论需按新统计输出手动修订（或丢给 Claude 重写）。

## 数据说明

| 文件 | 内容 |
|---|---|
| data/lineup_detail_total.json | 官方推荐阵容库（44套，S/A/B分级，含符文/装备/怪兽推荐与文字攻略） |
| data/hex.js | 全部强化符文（含英雄专属强化），对应 jcc.qq.com/#/hex 的符文页 |
| data/monster.js | 怪兽伙伴数据（经济型/战力型），对应 hex 页的怪兽 tab |
| data/chess.js | 棋子（属性、费用、技能） |
| data/equip.js | 装备（散件、成装、合成路线） |
| data/race.js + job.js | 羁绊（种族/职业） |
| data/versiondataconfig.js | 全模式版本索引，mode=8 且 is_newest_version=1 即当前怪兽入侵最新版 |

创建：2026-07-05，当前数据已同步至 17.17.6b-S18（2026-07-07 热更新）。
