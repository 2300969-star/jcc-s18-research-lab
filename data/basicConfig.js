(function (ee, ce) {
  typeof exports == "object" && typeof module != "undefined" ? module.exports = ce() : typeof define == "function" && define.amd ? define(ce) : (ee = typeof globalThis != "undefined" ? globalThis : ee || self, ee.basicConfig = ce())
})(this, function () {
  "use strict";
  var isTest = false;  //sdk组件库测试
  var mode = '8' //当前赛季mode
  var season = 'S18' //当前赛季season
  var features_tabs_selected = '8_S18' //赛季特色默认选中的tab id
  var novice_strategy_tabs_selected = '8_S18' //新手攻略选中tab id
  var channel = '11';//阵容列表正式服务渠道
  var cdn_dir = '';
  if(isTest){
    // channel = '19' //阵容列表测试服务渠道
    // cdn_dir = 'devbuildtest/' //test目录地址，一般无需改动，对齐文件：(.env.test)
  }
  var baseUrlManager = {
    // 默认图
    default_pic: '//game.gtimg.cn/images/jk/logo-jcc.png',
    // 英雄图 示例效果：https://game.gtimg.cn/images/jk/jkimg/champion-set6-5/1029x318/s6_ezreal.jpg
    hero_pic_big:{
      "8_S18":"//game.gtimg.cn/images/jk/jkimg/mode8s18/1624x750/{{pic_name}}.jpg",
      "17_S18":"//game.gtimg.cn/images/jk/jkimg/mode17s18/1624x750/{{pic_name}}.jpg",
      "4_S18":"//game.gtimg.cn/images/jk/jkimg/mode4s17/1624x750/{{pic_name}}.jpg",
      "16_S18":"//game.gtimg.cn/images/jk/jkimg/mode16s17/1624x750/{{pic_name}}.jpg",
      "10_S16":"//game.gtimg.cn/images/jk/jkimg/mode10s16/1624x750/{{pic_name}}.jpg",
      "9_S16":"//game.gtimg.cn/images/jk/jkimg/mode9s16/1624x750/{{pic_name}}.jpg",
      "15_S16":"//game.gtimg.cn/images/jk/jkimg/mode15s16/1624x750/{{pic_name}}.jpg",
      "7_S15":"//game.gtimg.cn/images/jk/jkimg/mode7s15/1624x750/{{pic_name}}.jpg",
      "14_S15":"//game.gtimg.cn/images/jk/jkimg/mode14s15/1624x750/{{pic_name}}.jpg",
      "4_S14":"//game.gtimg.cn/images/jk/jkimg/mode4s14/1624x750/{{pic_name}}.jpg",
      "13_S14":"//game.gtimg.cn/images/jk/jkimg/mode13s14/1624x750/{{pic_name}}.jpg",
      "9_S13":"//game.gtimg.cn/images/jk/jkimg/mode9s13/1624x750/{{pic_name}}.jpg",
      "12_S13":"//game.gtimg.cn/images/jk/jkimg/mode12s13/1624x750/{{pic_name}}.jpg",
      "6_S12":"//game.gtimg.cn/images/jk/jkimg/mode6s12/1624x750/{{pic_name}}.jpg",
      "11_S12":"//game.gtimg.cn/images/jk/jkimg/mode11s12/1624x750/{{pic_name}}.jpg",
      "4_S11":"//game.gtimg.cn/images/jk/jkimg/mode4s11/1624x750/{{pic_name}}.jpg",
      "10_S11":"//game.gtimg.cn/images/jk/jkimg/mode10s11/1624x750/{{pic_name}}.jpg",
      "9_S10":"//game.gtimg.cn/images/jk/jkimg/champion-set9-5/1624x750/{{pic_name}}.jpg",
      "3_S9":"//game.gtimg.cn/images/jk/jkimg/champion-set3/1624x750/{{pic_name}}.jpg",
      "9_S9":"//game.gtimg.cn/images/jk/jkimg/champion-set9/1624x750/{{pic_name}}.jpg",
      "8_S8":"//game.gtimg.cn/images/jk/jkimg/champion-set8-5/1624x750/{{pic_name}}.jpg",
      "7_S6":"//game.gtimg.cn/images/jk/jkimg/champion-set7/1624x750/{{pic_name}}.jpg",
      "6_S6":"//game.gtimg.cn/images/jk/jkimg/champion-set6-5/1624x750/{{pic_name}}.jpg",
      "4_S100001":"//game.gtimg.cn/images/jk/jkimg/champion-mode4s100001/1624x750/{{pic_name}}.jpg",
      "1_S1":"//game.gtimg.cn/images/jk/jkimg/champion/1624x750/{{pic_name}}.jpg"
    },
    hero_pic_long:{
      "8_S18":"//game.gtimg.cn/images/jk/jkimg/mode8s18/414x750/{{pic_name}}.jpg",
      "17_S18":"//game.gtimg.cn/images/jk/jkimg/mode17s18/414x750/{{pic_name}}.jpg",
      "4_S18":"//game.gtimg.cn/images/jk/jkimg/mode4s17/414x750/{{pic_name}}.jpg",
      "16_S18":"//game.gtimg.cn/images/jk/jkimg/mode16s17/414x750/{{pic_name}}.jpg",
      "10_S16":"//game.gtimg.cn/images/jk/jkimg/mode10s16/414x750/{{pic_name}}.jpg",
      '9_S16':"//game.gtimg.cn/images/jk/jkimg/mode9s16/414x750/{{pic_name}}.jpg",
      "15_S16":"//game.gtimg.cn/images/jk/jkimg/mode15s16/414x750/{{pic_name}}.jpg",
      "7_S15":"//game.gtimg.cn/images/jk/jkimg/mode7s15/414x750/{{pic_name}}.jpg",
      "14_S15":"//game.gtimg.cn/images/jk/jkimg/mode14s15/414x750/{{pic_name}}.jpg",
      "4_S14":"//game.gtimg.cn/images/jk/jkimg/mode4s14/1624x750/{{pic_name}}.jpg",
      "13_S14":"//game.gtimg.cn/images/jk/jkimg/mode13s14/414x750/{{pic_name}}.jpg",
      "9_S13":"//game.gtimg.cn/images/jk/jkimg/mode9s13/414x750/{{pic_name}}.jpg",
      "12_S13":"//game.gtimg.cn/images/jk/jkimg/mode12s13/414x750/{{pic_name}}.jpg",
      "6_S12":"//game.gtimg.cn/images/jk/jkimg/mode6s12/1624x750/{{pic_name}}.jpg",
      "11_S12":"//game.gtimg.cn/images/jk/jkimg/mode11s12/1624x750/{{pic_name}}.jpg",
      "4_S11":"//game.gtimg.cn/images/jk/jkimg/mode4s11/1624x750/{{pic_name}}.jpg",
      "10_S11":"//game.gtimg.cn/images/jk/jkimg/mode10s11/1624x750/{{pic_name}}.jpg",
      "9_S10":"//game.gtimg.cn/images/jk/jkimg/champion-set9-5/1624x750/{{pic_name}}.jpg",
      "3_S9":"//game.gtimg.cn/images/jk/jkimg/champion-set3/1624x750/{{pic_name}}.jpg",
      "9_S9":"//game.gtimg.cn/images/jk/jkimg/champion-set9/1624x750/{{pic_name}}.jpg",
      "8_S8":"//game.gtimg.cn/images/jk/jkimg/champion-set8-5/1624x750/{{pic_name}}.jpg",
      "7_S6":"//game.gtimg.cn/images/jk/jkimg/champion-set7/1624x750/{{pic_name}}.jpg",
      "6_S6":"//game.gtimg.cn/images/jk/jkimg/champion-set6-5/1624x750/{{pic_name}}.jpg",
      "4_S100001":"//game.gtimg.cn/images/jk/jkimg/champion-mode4s100001/1624x750/{{pic_name}}.jpg",
      "1_S1":"//game.gtimg.cn/images/jk/jkimg/champion/1624x750/{{pic_name}}.jpg"
    },
    hero_pic_660x305:{
      "8_S18":"//game.gtimg.cn/images/jk/jkimg/mode8s18/660x305/{{pic_name}}.jpg",
      "17_S18":"//game.gtimg.cn/images/jk/jkimg/mode17s18/1624x750/{{pic_name}}.jpg",
      "4_S18":"//game.gtimg.cn/images/jk/jkimg/mode4s17/1624x750/{{pic_name}}.jpg",
      "16_S18":"//game.gtimg.cn/images/jk/jkimg/mode16s17/1624x750/{{pic_name}}.jpg",
      "10_S16":"//game.gtimg.cn/images/jk/jkimg/mode10s16/1624x750/{{pic_name}}.jpg",
      "9_S16":"//game.gtimg.cn/images/jk/jkimg/mode9s16/1624x750/{{pic_name}}.jpg",
      "15_S16":"//game.gtimg.cn/images/jk/jkimg/mode15s16/1624x750/{{pic_name}}.jpg",
      "7_S15":"//game.gtimg.cn/images/jk/jkimg/mode7s15/1624x750/{{pic_name}}.jpg",
      "14_S15":"//game.gtimg.cn/images/jk/jkimg/mode14s15/1624x750/{{pic_name}}.jpg",
      "4_S14":"//game.gtimg.cn/images/jk/jkimg/mode4s14/1624x750/{{pic_name}}.jpg",
      "13_S14":"//game.gtimg.cn/images/jk/jkimg/mode13s14/1624x750/{{pic_name}}.jpg",
      "9_S13":"//game.gtimg.cn/images/jk/jkimg/mode9s13/660x305/{{pic_name}}.jpg",
      "12_S13":"//game.gtimg.cn/images/jk/jkimg/mode12s13/660x305/{{pic_name}}.jpg",
      "4_S11":"//game.gtimg.cn/images/jk/jkimg/mode4s11/660x305/{{pic_name}}.jpg",
      "1_S1":"//game.gtimg.cn/images/jk/jkimg/champion/1624x750/{{pic_name}}.jpg"
    },
    // 根据赛季id和模式管理阵容列表地址  格式:(赛季id Or 赛季id:模式)
    lineup_url:{
      // 地址切换规则 https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m{mode}/渠道/{season}/lineup_detail_total.json
      // 地址切换规则 https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m{season}/渠道/{mode}/lineup_detail_total.json
      // 上面两个规则可能随机出现
      // 怪兽入侵回归
      '8_S18':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m18/${channel}/8/lineup_detail_total.json`,
      // 星神
      '17_S18':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m18/${channel}/17/lineup_detail_total.json`,
      // 天选福星
      '4_S18':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m17/${channel}/4/lineup_detail_total.json`,
      // 强音对决
      '16_S18':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m17/${channel}/16/lineup_detail_total.json`,
      // 强音对决
      '10_S16':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m16/${channel}/10/lineup_detail_total.json`,
      // 符文大陆传奇
      '9_S16':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m16/${channel}/9/lineup_detail_total.json`,
      // 天下无双格斗大会
      '15_S16':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m16/${channel}/15/lineup_detail_total.json`,
      // 巨龙之巢返场 巨龙之巢返场有个模块叫隐龙之路（龙神试炼）字段是: dragonData和dragon_info
      '7_S15':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m15/${channel}/7/lineup_detail_total.json`,
      // 赛博城市
      '14_S15':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m15/${channel}/14/lineup_detail_total.json`,
      // 天选福星2025
      '4_S14':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m14/${channel}/4/lineup_detail_total.json`,
      // 双城传说II
      '13_S14':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m14/${channel}/13/lineup_detail_total.json`,
      // 24符文大陆传奇
      '9_S13':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m13/${channel}/9/lineup_detail_total.json`,
      // 魔法乱斗
      '12_S13':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m13/${channel}/12/lineup_detail_total.json`,
      // 画之灵
      '6_S12':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m12/${channel}/6/lineup_detail_total.json`,
      // 画之灵
      '11_S12':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m12/${channel}/11/lineup_detail_total.json`,
      // 天选福星2024
      '4_S11':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m11/${channel}/4/lineup_detail_total.json`,
      // 强音对决
      '10_S11':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m11/${channel}/10/lineup_detail_total.json`,
      // 志在天际
      '9_S10':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m10/${channel}/9/lineup_detail_total.json`,
      // 激战星海
      '3_S9':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m9/${channel}/3/lineup_detail_total.json`,
      // 符文大陆：传奇
      '9_S9':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m9/${channel}/9/lineup_detail_total.json`,
      // 铲铲市危机
      '8_S8':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m8/${channel}/8/lineup_detail_total.json`,
      // 铲铲市危机：双人模式
      '8_S8:2':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/doubleLineupJson/m8/${channel}/8/lineup_detail_total.json`,
      // 怪兽入侵
      // '8':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m7/${channel}/8/lineup_detail_total.json`,
      // 怪兽入侵：双人模式
      // '8:2':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/doubleLineupJson/m7/${channel}/8/lineup_detail_total.json`,
      // 隐秘之海
      '7_S6':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m6/${channel}/7/lineup_detail_total.json`,
      // 隐秘之海：双人模式
      '7_S6:2':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/doubleLineupJson/m6/${channel}/7/lineup_detail_total.json`,
      // 巨龙之巢
      // '7':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m5/${channel}/7/lineup_detail_total.json`,
      // 巨龙之巢：双人模式
      // '7:2':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/doubleLineupJson/m5/${channel}/7/lineup_detail_total.json`,
      // 双城传说：霓虹之夜
      '6_S6':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m4/${channel}/6/lineup_detail_total.json`,
      // 双人模式
      '6_S6:2':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/doubleLineupJson/m4/${channel}/6/lineup_detail_total.json`,
      // 天选福星
      '4_S100001':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m100001/${channel}/4/lineup_detail_total.json`,
      // 时空裂痕
      '1_S1':`https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m1/${channel}/1/lineup_detail_total.json`,
    },
    // 国度封面图
    galaxy_cover: {
      "德玛西亚":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Demacia.png",
      "暗影岛":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_ShadowIsles.png",
      "祖安":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Zaun.png",
      "恕瑞玛":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Shurima.png",
      "巨神峰":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Targon.png",
      "虚空":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Void.png",
      "诺克萨斯":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Noxus.png",
      "艾欧尼亚":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Ionia.png",
      "弗雷尔卓德":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Freljord.png",
      "班德尔城":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_BandleCity.png",
      "皮尔特沃夫":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Piltover.png",
      "比尔吉沃特":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_detail_Bilgewater.png",
      "以绪塔尔":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_Ixtal.png",
      "default":"https://game.gtimg.cn/images/lol/act/img/tft/RegionPortal/bg_share_default.png",
    },
  }
  var baseData = {
    channel,
    isTest,
    sdkHost: {
      formal:"https://jcc.qq.com/zmjkzone/public-lib/jkgamedata.umd.js",
      test:"https://jcc.qq.com/zmjkzone/public-lib/jkgamedatatest.umd.js",
      
      JCCFrameworkChina:"https://jcc.qq.com/act/JCCFramework/JCCFrameworkChina.umd.js",
      JCCFrameworkChinaTest:"https://jcc.qq.com/act/JCCFramework/JCCFrameworkChinaTest.umd.js",
// 2025.06.12-管理端改版后, 在赛博之城及以后的模式改成这个
//   正式:
//   https://jcc.qq.com/act/JCCFramework/JCCFrameworkChina.umd.js
//   测试:
//   https://jcc.qq.com/act/JCCFramework/JCCFrameworkChinaTest.umd.js
//
// 使用, Mode14S15(赛博之城)/Mode7S15(巨龙之巢), 这个按赛季切换, chess, equip这些还是和之前的老组件的一样:
//   正式
//   JCCFrameworkChina.Mode7S15.getModeGameData({arrNameData:['chess','equip']});
//   测试
//   JCCFrameworkChinaTest.Mode7S15.getModeGameData({arrNameData:['chess','equip']});
//
//   JCCFrameworkChinaTest.getModeLib("7","15"), 也可以这样获取对应赛季的组件库
//
//   正式环境:
//   JCCFrameworkChina.getModeLib("7","15")?.getModeGameData({arrNameData:['chess','equip']});
//   测试环境:
//   JCCFrameworkChinaTest.getModeLib("7","15")?.getModeGameData({arrNameData:['chess','equip']});
//   如果传的赛季不存在, 就会返回null, 可能需要处理一下这种边界情况
//   测试组件和正式组件的地址和名称都有一个Test的区别
//   需要关注一下哈
//   新的巨龙之巢及以后的组件缓存新的
//   老组件不维护了
//   正式和测试组件的切换规则和之前一样
//   版本正式发布之后，会更新正式组件
//   现存的不用更换
    },
    update: "2026/06/17",
    CurrentMode: mode,
    CurrentSeason: season,
    CurrentVersion:"",
    CurModeType:1,
    features_tabs_selected: features_tabs_selected,//赛季特色默认选中的tab id
    novice_strategy_tabs_selected: novice_strategy_tabs_selected,//新手攻略选中tab id
    hex_data_tpl:{//资料库
      'default':[
        {id: "buff", tpl: "buff", name: "强化符文"},
        // {id: "legend", name: "英雄传说之力"},
        // {id: "galaxy", name: "国度"},
        // {id: "music", name: "羁绊音乐"},
        // {id: "galaxy_m10s11", name: "传送门"},
        // {id: "adventure", name: "随机法杖"},
      ],
      // 银河战争
      '3_S9':[
        {id:"galaxy", tpl:"galaxy2", name:"星系"},
        {id:"buff", tpl:"buff", name:"强化符文"},
      ],
      '9_S9':[
        {id:"legend", tpl:"legend", name:"英雄传说之力"},
        {id:"galaxy", tpl:"galaxy", name:"国度"},
        {id:"buff", tpl:"buff", name:"强化符文"},
      ],
      '11_S12':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        {id:"galaxy", tpl:"galaxy_m10s11", name:"传送门"},
      ],
      '12_S13':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        {id:"galaxy", tpl:"galaxy_m10s11", name:"传送门"},
        {id:"adventure", tpl:"adventure", name:"随机法杖"},
      ],
      '9_S13':[
        {id:"legend", tpl:"legend", name:"英雄传说之力"},
        {id:"galaxy", tpl:"galaxy", name:"国度"},
        {id:"buff", tpl:"buff", name:"强化符文"},
      ],
      '13_S14':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        {id:"goop", tpl:"yctb", name:"异常突变"},
      ],
      '4_S11':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        {id:"galaxy", tpl:"galaxy_m10s11", name:"传送门"},
      ],
      '4_S14':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        {id:"galaxy", tpl:"galaxy_m10s11", name:"传送门"},
      ],
      '14_S15':[
        {id:"buff", tpl:"buff", name:"强化符文"},
      ],
      '7_S15':[
        {id:"buff", tpl:"buff", name:"强化符文"}
      ],
      '15_S16':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        {id:"goop", tpl:"yctb", name:"强化果实"},
      ],
      '10_S16':[
        {id:"buff", tpl:"buff", name:"强化符文"}
      ],
      '16_S18':[
        {id:"buff", tpl:"buff", name:"强化符文"}
      ],
      '4_S18':[
        {id:"buff", tpl:"buff", name:"强化符文"}
      ],
      '17_S18':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        // {id:"godreward", tpl:"godreward", name:"星神赐福"},
      ],
      '8_S18':[
        {id:"buff", tpl:"buff", name:"强化符文"},
        // {id:"godreward", tpl:"godreward", name:"星神赐福"},
      ],
    },
    equipment_type: [//装备分类
      {title:'基础装备',type:['基础装备'],value:1},
      {title:'成型装备',type:['成型装备'],value:2},
      {title:'特殊装备',type:['特殊装备'],value:3},
      {title:'光明装备',type:['光明装备','光明武器'],value:4},
      {title:'辅助装备',type:['辅助装备'],value:5},
      {title:'神器装备',type:['神器装备'],value:6},
      {title:'纹章',type:['转职纹章','纹章'],value:7},
      {title:'其他装备',type:['其他装备'],value:999},
    ],
    //特殊机制
    mechanism_tab:[
      {set_id: "17", mode: "17", season: "S18", version: "", id: "17_S18", name: "星神", hex_data:[{id:"godreward",name:"星神"}]},
      {set_id: "8", mode: "8", season: "S18", version: "", id: "8_S18", name: "怪兽",hex_data:[{id:"monster",name:"怪兽"}]},
    ],
    // 赛季
    season_tabs: [
      /**
       * set_id: 赛季id
       * id: 列表id(自定义"赛季id:模式"，请保持唯一性) eg:8_5:2  8:2
       * name: 赛季名称
       * ename: 赛季英文名（自定义）
       * mode_type: 用于区分单人1，双人模式2
       * gicp_id1: 新手攻略id PC
       * gicp_id2: 赛季解读id H5 src\views\Home\components\components\SeasonInterpretation.vue getNewsList()
       * hex_data：资料模版，使用页面 src\views\Hex\Index.vue {id:资料接口请求的标识，tpl:页面使用的模版，name:资料的名称} 示例：{id: "buff",tpl:"buff", name: "强化符文"}
       * is_show:用于显示的页面
       * sdk:使用不同sdk拉取数据
       */
      {set_id: "8", mode: "8", season: "S18", version: "", id: "8_S18", name: "怪兽入侵", set_name: "怪兽入侵", ename: "M8S18", mode_type: 1, gicp_id1: "142756", gicp_id2: "112027,132973", hex_data:['buff','monster'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['mech','lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      {set_id: "17", mode: "17", season: "S18", version: "", id: "17_S18", name: "星神", set_name: "星神", ename: "M17S18", mode_type: 1, gicp_id1: "141724", gicp_id2: "112027,132973", hex_data:['buff','godreward'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['mech','lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "4", mode: "4", season: "S18", version: "", id: "4_S18", name: "天选福星", set_name: "天选福星", ename: "M4S17", mode_type: 1, gicp_id1: "140939", gicp_id2: "112027,132973", hex_data:['buff'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      {set_id: "16", mode: "16", season: "S18", version: "", id: "16_S18", name: "英雄联盟传奇", set_name: "英雄联盟传奇", ename: "M16S17", mode_type: 1, gicp_id1: "140083", gicp_id2: "112027,132973", hex_data:['buff'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "10.5", mode: "10", season: "S16", version: "", id: "10_S16", name: "强音对决", set_name: "强音对决", ename: "M10S16", mode_type: 1, gicp_id1: "139615", gicp_id2: "112027,132973", hex_data:['buff'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "9.5", mode: "9", season: "S16", version: "", id: "9_S16", name: "符文大陆传奇", set_name: "符文大陆传奇", ename: "M9S16", mode_type: 1, gicp_id1: "138870", gicp_id2: "112027,132973", hex_data:["legend", "galaxy", "buff"], eq_type_classify:[1,2,4,5,6,7,3], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "16", mode: "15", season: "S16", version: "", id: "15_S16", name: "天下无双格斗大会", set_name: "天下无双格斗大会", ename: "M15S16", mode_type: 1, gicp_id1: "138870", gicp_id2: "112027,132973", hex_data:['buff','goop'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "15", mode: "7", season: "S15", version: "", id: "7_S15", name: "巨龙之巢", set_name: "巨龙之巢", ename: "M7S15", mode_type: 1, gicp_id1: "138610", gicp_id2: "112027,132973", hex_data:['buff'], eq_type_classify:[1,2,4,5,6,7], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "15", mode: "14", season: "S15", version: "", id: "14_S15", name: "赛博城市", set_name: "赛博城市", ename: "M14S15", mode_type: 1, gicp_id1: "138079", gicp_id2: "112027,132973", hex_data:['buff'], eq_type_classify:[1,2,4,5,6,7,3],/*对应equipment_type的value*/ is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'JCCFrameworkChina'},
      // {set_id: "14", mode: "4", season: "S14", version: "", id: "4_S14", name: "天选福星", set_name: "天选福星2025", ename: "M4S14", mode_type: 1, gicp_id1: "136822", gicp_id2: "112027,132973", hex_data:['buff','galaxy'], eq_type_classify:[1,2,4,5,6,7],/*对应equipment_type的value*/ is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "13", mode: "13", season: "S14", version: "", id: "13_S14", name: "双城传说II", set_name: "双城传说II", ename: "M13S14", mode_type: 1, gicp_id1: "136172", gicp_id2: "112027,132973", hex_data:['buff','goop'], eq_type_classify:[1,2,4,5,6,7,3],/*对应equipment_type的value*/ is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "9", mode: "9", season: "S13", version: "", id: "9_S13", name: "符文大陆传奇", set_name: "符文大陆传奇", ename: "M9S13", mode_type: 1, gicp_id1: "135738", gicp_id2: "112027,132973", hex_data:["legend", "galaxy", "buff"], eq_type_classify:[1,2,4,5,6,7,3],/*对应equipment_type的value*/ is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "12", mode: "12", season: "S13", version: "", id: "12_S13", name: "魔法乱斗", set_name: "魔法乱斗", ename: "M12S13", mode_type: 1, gicp_id1: "134139", gicp_id2: "112027,132973", hex_data:["buff", "galaxy", "adventure"], eq_type_classify:[1,2,4,5,6,7,3],/*对应equipment_type的value*/ is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "6", mode: "6", season: "S12", version: "", id: "6_S12", name: "双城传说", set_name: "双城传说", ename: "M6S12", mode_type: 1, gicp_id1: "134140", gicp_id2: "134140",hex_data:['galaxy','buff'], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "11", mode: "11", season: "S12", version: "", id: "11_S12", name: "画之灵", set_name: "画之灵", ename: "M11S12", mode_type: 1, gicp_id1: "112027,132973", gicp_id2: "112027,132973",hex_data:['buff','galaxy'], eq_type_classify:[1,2,4,5,6,7,3], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "10", mode: "10", season: "S11", version: "", id: "10_S11", name: "强音对决", set_name: "强音对决", ename: "M10S11", mode_type: 1, gicp_id1: "112027,131631", gicp_id2: "112027,131631", is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "4", mode: "4", season: "S11", version: "", id: "4_S11", name: "天选福星2024", set_name: "天选福星", ename: "M4S11", mode_type: 1, gicp_id1: "112027,132810", gicp_id2: "112027,131631",hex_data:['buff','galaxy'], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "9.5", mode: "9", season: "S10", version: "", id: "9_S10", name: "志在天际", set_name: "志在天际", ename: "M9S10", mode_type: 1, gicp_id1: "112027,131149", gicp_id2: "112027,131149", is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "9", mode: "9", season: "S9", version: "", id: "9_S9", name: "符文大陆：传奇", set_name: "符文大陆：传奇", ename: "M9S9", mode_type: 1, gicp_id1: "112027,126658", gicp_id2: "112027,126658",hex_data:['buff','galaxy','legend'], is_show:['lineup','hero','hex','synergy','quipment','m_database','novice_strategy'], sdk:'jkgamedata'},
      // {set_id: "3", mode: "3", season: "S9", version: "", id: "3_S9", name: "激战星海", set_name: "激战星海", ename: "M3S9", mode_type: 1, gicp_id1: "112027,126658", gicp_id2: "112027,126658",hex_data:['galaxy','buff'], is_show:['lineup','hero','hex','synergy','quipment','m_database'], sdk:'jkgamedata'},
      // {set_id: "8", mode: "8", season: "S8", version: "", id: "8_S8", name: "铲铲市危机", set_name: "铲铲市危机", ename: "Crisis", mode_type: 1, gicp_id1: "112027,125536", gicp_id2: "112027,122994", is_show:['lineup','hero','hex','synergy','quipment','m_database'], sdk:'jkgamedata'},
      // {set_id: "8", mode: "8", season: "S7", version: "", id: "8", name: "怪兽入侵", set_name: "怪兽入侵", ename: "MonsterInvasion", mode_type: 1, gicp_id1: "112027,122994", gicp_id2: "112027,122994", is_show:['lineup','hero','hex','synergy','quipment','m_database'], sdk:'jkgamedata'},
      // {set_id: "4", mode: "4", season: "S100001", version: "", id: "4_S100001", name: "天选福星", set_name: "天选福星", ename: "LuckyStar", mode_type: 1, gicp_id1: "112027,121029", gicp_id2: "112027,121029", is_show:['lineup','hero','hex','synergy','quipment','m_database'], sdk:'jkgamedata'},
      // {set_id: "8", mode: "8", season: "S7", version: "", id: "8:2", name: "双人作战", set_name: "怪兽入侵", ename: "MonsterInvasion_double", mode_type: 2, gicp_id1: "112027,118155", gicp_id2: "118155", is_show:['lineup'], sdk:'jkgamedata'},
      // {set_id:"7", mode:"7", season:"S6", version:"", id:"7", name:"隐秘之海", set_name:"隐秘之海", ename:"HiddenSea", mode_type:1, gicp_id1:"122994,112027", gicp_id2: "122994,112027", sdk:'jkgamedata'},
      // {set_id:"7", mode:"7", season:"S6", version:"", id:"7_5:2", name:"双人作战", set_name:"隐秘之海", ename:"HiddenSea_double", mode_type:1, gicp_id1:"122994,112027", gicp_id2: "122994,112027", sdk:'jkgamedata'},
      // {set_id: "11", mode: "11", season: "S12", version: "", id: "11_S12:2", name: "双人作战", set_name: "画之灵", ename: "Crisis_double", mode_type: 2, gicp_id1: "112027,118155", gicp_id2: "118155", is_show:['novice_strategy'], sdk:'jkgamedata'},
      {set_id: "1", mode: "1", season: "S1", version: "", id: "1_S1", name: "时空裂痕", set_name: "时空裂痕", ename: "RIFT", mode_type: 1, gicp_id1: "118154,116025", gicp_id2: "118154",
        hex_data:[],
        eq_type_classify:[1,2,4,5,6,7],//对应equipment_type的value
        is_show:['lineup','hero','synergy','quipment','m_database','novice_strategy'],
        sdk:'JCCFrameworkChina'
      }
    ],
    /**
     * 赛季特色 PC
     * features_tabs：赛季特色列表
     */
    features_tabs: [
      {mode: "8", season: "S18", version: "", id: "8_S18", name: "怪兽入侵", mode_type: 1},
      {mode: "17", season: "S18", version: "", id: "17_S18", name: "星神", mode_type: 1},
      {mode: "4", season: "S17", version: "", id: "4_S18", name: "天选福星", mode_type: 1},
      {mode: "16", season: "S17", version: "", id: "16_S18", name: "英雄联盟传奇", mode_type: 1},
      // {mode: "10.5", season: "S16", version: "", id: "10_S16", name: "强音对决", mode_type: 1},
      // {mode: "15", season: "S16", version: "", id: "15_S16", name: "天下无双格斗大会", mode_type: 1},
      // {mode: "7", season: "S15", version: "", id: "7_S15", name: "巨龙之巢", mode_type: 1},
      // {mode: "14", season: "S15", version: "", id: "14_S15", name: "赛博城市", mode_type: 1},
      // {mode: "4", season: "S14", version: "", id: "4_S14", name: "天选福星", mode_type: 1},
      // {mode: "13", season: "S14", version: "", id: "13_S14", name: "双城传说II", mode_type: 1},
      // {mode: "9", season: "S13", version: "", id: "9_S13", name: "符文大陆传奇", mode_type: 1},
      // {mode: "12", season: "S13", version: "", id: "12_S13", name: "魔法乱斗", mode_type: 1},
      // {mode: "6", season: "S12", version: "", id: "6_S12", name: "双城传说", mode_type: 1},
      // {mode: "11", season: "S12", version: "", id: "11_S12", name: "画之灵", mode_type: 1},
      // {mode: "10", season: "S11", version: "", id: "10_S11", name: "强音对决", mode_type: 1},
      // {mode: "4", season: "S11", version: "", id: "4_S11", name: "天选福星", mode_type: 1},
      // {mode: "9", season: "S10", version: "", id: "9_S10", name: "志在天际", mode_type: 1},
      // {mode: "9", season: "S9", version: "", id: "9_S9", name: "符文大陆：传奇", mode_type: 1},
      // {mode: "3", season: "S9", version: "", id: "3_S9", name: "激战星海", mode_type: 1},
      // {mode: "8", season: "S8", version: "", id: "8_S8", name: "铲铲市危机", mode_type: 1},
      // {mode: "10", season: "S11", version: "", id: "11_S12:2", name: "双人作战", mode_type: 2},
      {mode: "1", season: "", version: "", id: "1_S1", name: "时空裂痕", mode_type: 1}
    ],
    main_bg:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/mainbg.jpg`,
    main_bg_m:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/mainbg-m.jpg`,
    kv_banner:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/kv.jpg`,
    kv_banner_m:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/kv-m.jpg`,
    kv_video:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/kv-video.mp4`,
    kv_video_m:"",
    kv_slogan:{
      url:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/kv-slogan.png`,
      style:"width:10.31rem;height:6.52rem;bottom:18%;bottom:6%;left:50%;transform:translate3d(-50%, 0, 0);"
    },
    kv_slogan_m:{
      url:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/kv-slogan-m.png`,
      style:"width:9.81rem;height:7.07rem;bottom:14%;"//mix-blend-mode:Lighten
    },
    kv_btn_down_m:{
      url:`https://game.gtimg.cn/images/jk/${cdn_dir}kv/M${mode+season}/btn-down.png`,
      style:"width:3.92rem;height:1.06rem;bottom:10%"
    },
    home_mini_vid:"c3282dvkjrj",
    // 赛季特色 banner
    season_features:{
      "8_S18":[
        {
          "name":"怪兽入侵 经典回归",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M8S18/1.jpg`,
          "link":"#/news/3848682366408520067",
          "link_m":"#/news/3848682366408520067",
        },
      ],
      "17_S18":[
        {
          "name":"星神",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M17S18/1.jpg`,
          "link":"https://jcc.qq.com/act/a20260409season/index.html",
          "link_m":"https://jcc.qq.com/act/a20260409season/index.html",
        },
      ],
      "4_S18":[
        {
          "name":"天选福星",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M4S17/1.jpg`,
          "link":"https://jcc.qq.com/act/a20260122luckstar/index.html",
          "link_m":"https://jcc.qq.com/act/a20260122luckstar/index.html",
        },
      ],
      "16_S18":[
        {
          "name":"英雄联盟传奇",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M16S17/1.jpg`,
          "link":"https://jcc.qq.com/act/a20251120legend/",
          "link_m":"https://jcc.qq.com/act/a20251120legend/",
        },
      ],
      "10_S16":[
        {
          "name":"金铲铲观赛口令码兑换积分",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M10S16/2.jpg`,
          "link":"https://jcc.qq.com/act/a20250930competition/index.html",
          "link_m":"https://jcc.qq.com/act/a20250930competition/index.html",
        },
        {
          "name":"巨星登场 强音回归",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M10S16/1.jpg`,
          "link":"https://jcc.qq.com/#/news/6378650671149989150",
          "link_m":"https://jcc.qq.com/m/m202206/#/news/6378650671149989150",
        },
      ],
      "15_S16":[
        {
          "name":"金铲铲4周年",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M15S16/2.jpg`,
          "link":"https://jcc.qq.com/act/a20250818aniver/",
          "link_m":"https://jcc.qq.com/act/a20250818aniver/",
        },
        {
          "name":"迎战天下无双",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M15S16/1.jpg`,
          "link":"https://jcc.qq.com/act/a20250722convention/index.html",
          "link_m":"https://jcc.qq.com/act/a20250722convention/index.html",
        }
      ],
      "7_S15":[
        {
          "name":"巨龙之巢",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M7S15/1.jpg`,
          "link":"https://jcc.qq.com/#/news/10450931635532856759",
          "link_m":"https://jcc.qq.com/#/news/10450931635532856759",
        }
      ],
      "14_S15":[
        {
          "name":"赛博城市",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M14S15/1.jpg`,
          "link":"https://jcc.qq.com/act/a20250327city/",
          "link_m":"https://jcc.qq.com/act/a20250327city/",
        }
      ],
      "4_S14":[
        {
          "name":"福星天降",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M4S14/1.jpg`,
          "link":"https://jcc.qq.com/act/a20250109luckystar/index.html",
          "link_m":"https://jcc.qq.com/act/a20250109luckystar/index.html",
        }
      ],
      "13_S14":[
        {
          "name":"一同见证终章对决",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M13S14/2.jpg`,
          "link":"https://jcc.qq.com/watcharcane2/index.html",
          "link_m":"https://jcc.qq.com/watcharcane2/index.html",
        },
        {
          "name":"开局！重写双城之战",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M13S14/1.jpg`,
          "link":"https://jcc.qq.com/act/a20241122arcane2/index.html",
          "link_m":"https://jcc.qq.com/act/a20241122arcane2/index.html",
        },
      ],
      "9_S13":[
        {
          "name":"《双城之战》第二季 现已正式开播",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/7.jpg`,
          "link":"https://jcc.qq.com/watcharcane2/index.html",
          "link_m":"https://jcc.qq.com/watcharcane2/index.html",
        },
        {
          "name":"符文大陆传奇返场",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M9S13/1.jpg`,
          "link":"https://jcc.qq.com/#/news/7631771228625394449",
          "link_m":"https://jcc.qq.com/#/news/7631771228625394449",
        },
        {
          "name":"金铲铲之战高校邀请赛",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/6.jpg`,
          "link":"https://jcc.qq.com/act/a20240919campusmatch/index.html",
          "link_m":"https://jcc.qq.com/act/a20240919campusmatch/index.html",
        },
        {
          "name":"双城之战首支预告",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/2.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/i4100cb8vi1.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/i4100cb8vi1.html",
        },
        {
          "name":"《英雄联盟: 双城之战》第2季 ",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/3.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
      ],
      "12_S13":[
        {
          "name":"金铲铲之战高校邀请赛",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/6.jpg`,
          "link":"https://jcc.qq.com/act/a20240919campusmatch/index.html",
          "link_m":"https://jcc.qq.com/act/a20240919campusmatch/index.html",
        },
        {
          "name":"魔法乱斗",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/1.jpg`,
          "link":"https://jcc.qq.com/act/a20240725magiccombat/",
          "link_m":"https://jcc.qq.com/act/a20240725magiccombat/",
        },
        {
          "name":"双城之战首支预告",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/2.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/i4100cb8vi1.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/i4100cb8vi1.html",
        },
        {
          "name":"《英雄联盟: 双城之战》第2季 ",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M12S13/3.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
      ],
      "6_S12":[
        {
          "name":"双城之战首支预告",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M6S12/2.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/i4100cb8vi1.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/i4100cb8vi1.html",
        },
        {
          "name":"双城传说",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M6S12/5.jpg`,
          "link":"https://jcc.qq.com/cp/a20240516set6regain/indexpc.html",
          "link_m":"https://jcc.qq.com/cp/a20240516set6regain/index.html",
        },
        {
          "name":"《英雄联盟: 双城之战》第2季 ",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M6S12/1.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
      ],
      "11_S12":[
        {
          "name":"双城传说",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M11S12/5.jpg`,
          "link":"https://jcc.qq.com/cp/a20240516set6regain/indexpc.html",
          "link_m":"https://jcc.qq.com/cp/a20240516set6regain/index.html",
        },
        {
          "name":"3月28日 全新赛季画之灵上线",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M11S12/4.jpg`,
          "link":"https://jcc.qq.com/act/a20240316jccset/index.html",
          "link_m":"https://jcc.qq.com/act/a20240316jccset/index.html",
        },
        {
          "name":"《英雄联盟: 双城之战》第2季 ",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M11S12/1.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
      ],
      "4_S11":[
        {
          "name":"3月28日 全新赛季画之灵上线",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M4S11/4.jpg`,
          "link":"https://jcc.qq.com/act/a20240316jccset/index.html",
          "link_m":"https://jcc.qq.com/act/a20240316jccset/index.html",
        },
        {
          "name":"JOC4冠军",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M4S11/3.jpg`,
          "link":"https://jcc.qq.com/#/news/6645188763863970173",
          "link_m":"https://jcc.qq.com/m/m202206/#/news/6645188763863970173",
        },
        {
          "name":"天选福星 有龙则灵",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M4S11/2.jpg`,
          "link":"https://jcc.qq.com/act/a20240126chosenluckystar/index.html",
          "link_m":"https://jcc.qq.com/act/a20240126chosenluckystar/index.html",
        },
        {
          "name":"《英雄联盟: 双城之战》第2季 ",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M4S11/1.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
      ],
      "10_S11":[
        {
          "name":"赛事官网",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M10S11/4.jpg`,
          "link":"https://joc.qq.com/",
          "link_m":"https://joc.qq.com/m/tv/index.html",
        },
        {
          "name":"强音对决 版本前瞻",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M10S11/2.jpg`,
          "link":"https://jcc.qq.com/act/a20231103voiceduel/",
          "link_m":"https://jcc.qq.com/act/a20231103voiceduel/",
        },
        /*{
          "name":"粉丝嘉年华",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M10S11/3.jpg`,
          "link":"https://jcc.qq.com/#/news/15708233569160445790",
          "link_m":"https://jcc.qq.com/m/m202206/#/news/15708233569160445790",
        },*/
        {
          "name":"《英雄联盟: 双城之战》第2季",
          "target":"_blank",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}SeasonFeatures/M10S11/1.jpg`,
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
      ],
      "11_S12:2":[
        {
          "name":"双人作战 携手同行",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/Double/1.webp",
          "link":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
          "link_m":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
        },
      ],
      "9_S10":[
        {
          "name":"粉丝嘉年华",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S10/4.jpg",
          "link":"https://jcc.qq.com/#/news/15708233569160445790",
          "link_m":"https://jcc.qq.com/m/m202206/#/news/15708233569160445790",
        },
        {
          "name":"《英雄联盟: 双城之战》第2季",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S10/3.jpg",
          "link":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
          "link_m":"https://v.qq.com/x/cover/mzc00200ztsl4to/x00476t4t4d.html",
        },
        {
          "name":"强音对决 版本前瞻",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S10/2.jpg",
          "link":"https://jcc.qq.com/act/a20231103voiceduel/",
          "link_m":"https://jcc.qq.com/act/a20231103voiceduel/",
        },
        {
          "name":"小企鹅历险记",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S10/1.jpg",
          "link":"https://jcc.qq.com/#/news/15326447122678912127",
          "link_m":"https://jcc.qq.com/act/a20230907guide/index.html",
        },
      ],
      "9_S10:2":[
        {
          "name":"双人作战 携手同行",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/Double/1.webp",
          "link":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
          "link_m":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
        }
      ],
      "3_S9":[
        {
          "name":"好事成双",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M3S9/2.jpg",
          "link":"https://jcc.qq.com/act/a20230814happiness/",
          "link_m":"https://jcc.qq.com/act/a20230814happiness/",
        },
        {
          "name":"激战星海",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M3S9/1.jpg",
          "link":"https://jcc.qq.com/act/a20230717starwars/index.html",
          "link_m":"https://jcc.qq.com/act/a20230717starwars/index.html",
        },
      ],
      "9_S9":[
        {
          "name":"好事成双周年庆",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S9/3.jpg",
          "link":"https://jcc.qq.com/act/a20230904anniversarys/",
          "link_m":"https://jcc.qq.com/act/a20230904anniversarys/",
        },
        {
          "name":"符文大陆传奇",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S9/1.jpg",
          "link":"https://jcc.qq.com/act/a20230517runeterra/index.html",
          "link_m":"https://jcc.qq.com/act/a20230517runeterra/index.html",
        },
        {
          "name":"一键秒玩不掉分",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/M9S9/2.jpg",
          "link":"https://m.yyb.qq.com/cloud-game-center-refactor/mid-game/game/?_wwv=516&_wv=4097&provider=wetest&pkgname=com.tencent.jkchess&entranceid=580001&moduleid=80&source=19&midgame_source=19",
          "link_m":"https://m.yyb.qq.com/cloud-game-center-refactor/mid-game/game/?_wwv=516&_wv=4097&provider=wetest&pkgname=com.tencent.jkchess&entranceid=580001&moduleid=80&source=19&midgame_source=19"
        },
      ],
      "8_S8":[
        {
          "name":"铲铲市危机",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/MonsterInvasion/2.jpg",
          "link":"https://jcc.qq.com/act/a20230224monster/",
          "link_m":"https://jcc.qq.com/act/a20230224monster/",
        },
      ],
      "4_S100001":[
        {
          "name":"天选福星 DDD福到了",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/LuckyStar/1.jpg",
          "link":"https://jcc.qq.com/act/a20221223newyear/indexm.html",
          "link_m":"https://jcc.qq.com/act/a20221223newyear/indexm.html",
        }
      ],
      "8":[
        {
          "name":"怪兽入侵:铲铲市危机",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/MonsterInvasion/2.jpg",
          "link":"https://jcc.qq.com/act/a20230224monster/",
          "link_m":"https://jcc.qq.com/act/a20230224monster/",
        },
        {
          "name":"怪兽入侵",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/MonsterInvasion/1.jpg",
          "link":"https://jcc.qq.com/act/a20221117version/index.html?exchangeType=1&autoRefreshCookie=1",
          "link_m":"https://jcc.qq.com/act/a20221117version/index.html?exchangeType=1&autoRefreshCookie=1",
        }
      ],
      "7_5":[
        {
          "name":"隐秘之海",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/HiddenSea/1.jpg",
          "link":"https://jcc.qq.com/act/a20220829version/index.html",
          "link_m":"https://jcc.qq.com/act/a20220829version/index.html",
        },
        {
          "name":"高校杯",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/HiddenSea/2.jpg",
          "link":"https://jcc.qq.com/act/a20220920collegecup/",
          "link_m":"https://jcc.qq.com/act/a20220920collegecup/",
        }
      ],
      "7_5:2":[
        {
          "name":"双人作战 携手同行",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/Double/1.webp",
          "link":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
          "link_m":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
        }
      ],
      "7":[
        {
          "name":"巨龙之巢 隐秘之海",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/dragonNest/4.jpg",
          "link":"https://jcc.qq.com/act/a20220829version/index.html",
          "link_m":"https://jcc.qq.com/act/a20220829version/index.html",
        },
        {
          "name":"巨龙之巢 探索未知",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/dragonNest/1.jpg",
          "link":"https://jcc.qq.com/#/news/3764599005614817645",
          "link_m":"https://jcc.qq.com/#/news/3764599005614817645",
        }
      ],
      "7:2":[
        {
          "name":"双人作战 携手同行",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/Double/1.webp",
          "link":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
          "link_m":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
        }
      ],
      "6":[
        {
          "name":"高校杯邀请赛-排行榜",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/NeonNight/1.jpg",
          "link":"https://jcc.qq.com/act/a20220309rank/index-l.html",
          "link_m":"https://jcc.qq.com/act/a20220309rank/index-l.html",
        }, {
          "name":"高校杯邀请赛-报名",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/NeonNight/2.jpg",
          "link":"https://jcc.qq.com/act/a20220316battle/index.html",
          "link_m":"https://jcc.qq.com/act/a20220316battle/index.html",
        }, {
          "name":"全新羁绊抢先看",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/NeonNight/3.jpg",
          "link":"#/news/14812422866452732996",
          "link_m":"#/news/14812422866452732996",
        }, {
          "name":"双城传说·霓虹之夜",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/NeonNight/4.jpg",
          "link":"https://jcc.qq.com/cp/a20220224newtopic/index-m.html",
          "link_m":"https://jcc.qq.com/cp/a20220224newtopic/index-m.html",
        }
      ],
      "6:2":[
        {
          "name":"双人作战 携手同行",
          "target":"_blank",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/Double/1.webp",
          "link":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
          "link_m":"https://jcc.qq.com/act/a20220329doublecombat/index.html",
        }
      ],
      "1_S1":[
        {
          "name":"时空裂痕 上分攻略",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/SeasonFeatures/RIFT/1.webp",
          "link":"#/news/12412060164014111469",
          "link_m":"#/news/12412060164014111469",
        }
      ]
    },
    // 玩法特色 banner
    play_characteristics:{
      "8_S18":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M8S18/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M8S18/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M8S18/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M8S18/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M8S18/5.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"6",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M8S18/6.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "17_S18":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M17S18/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M17S18/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M17S18/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M17S18/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M17S18/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "4_S18":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S17/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S17/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S17/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S17/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S17/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "16_S18":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M16S17/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M16S17/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M16S17/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M16S17/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M16S17/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "10_S16":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S16/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S16/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S16/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S16/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S16/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "15_S16":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M15S16/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M15S16/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M15S16/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M15S16/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M15S16/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "7_S15":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M7S15/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M7S15/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M7S15/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M7S15/4.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "14_S15":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M14S15/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M14S15/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M14S15/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M14S15/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M14S15/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "4_S14":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S14/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S14/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S14/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S14/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S14/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "13_S14":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M13S14/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M13S14/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M13S14/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M13S14/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M13S14/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "9_S13":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M9S13/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M9S13/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M9S13/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M9S13/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M9S13/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "12_S13":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M12S13/6.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M12S13/7.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M12S13/8.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M12S13/9.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M12S13/10.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "6_S12":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M6S12/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M6S12/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M6S12/3.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "11_S12":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M11S12/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M11S12/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M11S12/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M11S12/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M11S12/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "4_S11":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S11/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S11/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S11/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S11/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M4S11/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "10_S11":[
        {
          "name":"1",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S11/1.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S11/2.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S11/3.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S11/4.jpg`,
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":`https://game.gtimg.cn/images/jk/${cdn_dir}PlayCharacteristics/M10S11/5.jpg`,
          "link":"",
          "link_m":""
        },
      ],
      "9_S10":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S10/1.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S10/2.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S10/3.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S10/4.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S10/5.jpg",
          "link":"",
          "link_m":""
        },
      ],
      "3_S9":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M3S9/1.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M3S9/2.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M3S9/3.jpg",
          "link":"",
          "link_m":""
        },
      ],
      "9_S9":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S9/1.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S9/2.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S9/3.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S9/4.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/M9S9/5.jpg",
          "link":"",
          "link_m":""
        },
      ],
      "8_S8":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/m8s8/1.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/m8s8/2.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/m8s8/3.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/m8s8/4.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/m8s8/5.jpg",
          "link":"",
          "link_m":""
        },
      ],
      "4_S100001":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/LuckyStar/1.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/LuckyStar/2.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/LuckyStar/3.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/LuckyStar/4.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/LuckyStar/5.jpg",
          "link":"",
          "link_m":""
        },
      ],
      "8_S7":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/MonsterInvasion/1.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/MonsterInvasion/2.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/MonsterInvasion/3.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"4",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/MonsterInvasion/4.jpg",
          "link":"",
          "link_m":""
        },
        {
          "name":"5",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/MonsterInvasion/5.jpg",
          "link":"",
          "link_m":""
        },
      ],
      "7_S6":[
        {
          "name":"1",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/HiddenSea/1.jpg",
          "link":"",
          "link_m":""
        },{
          "name":"2",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/HiddenSea/2.jpg",
          "link":"",
          "link_m":""
        },{
          "name":"3",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/HiddenSea/3.jpg",
          "link":"",
          "link_m":""
        },{
          "name":"4",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/HiddenSea/4.jpg",
          "link":"",
          "link_m":""
        },{
          "name":"5",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/HiddenSea/5.jpg",
          "link":"",
          "link_m":""
        }
      ],
      "6_S5":[
        {
          "name":"正版授权",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/1.webp",
          "link":"",
          "link_m":""
        },{
          "name":"双人双排",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/2.webp",
          "link":"",
          "link_m":""
        },{
          "name":"神兵天降",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/3.webp",
          "link":"",
          "link_m":""
        },{
          "name":"互选商店",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/4.webp",
          "link":"",
          "link_m":""
        },{
          "name":"忠城符文",
          "target":"_parent",
          "img":"https://game.gtimg.cn/images/jk/PlayCharacteristics/5.webp",
          "link":"",
          "link_m":""
        }
      ]
    },
    age_appropriate_tips:"<p>1）本游戏是一款多人对战的策略类游戏，适用于年满12周岁及以上的用户，建议未成年人在家长监护下使用游戏产品。</p>" +
      "<p>2）本游戏无世界观、无剧情，游戏中角色均为虚构，不会与现实生活相混淆。游戏画面为卡通风格，有丰富的音效来烘托游戏氛围。游戏玩法基于一定难度的思维判断，需要玩家通过排兵布阵进行对战，鼓励玩家通过思考和训练达成目标。游戏中有基于语音和文字的陌生人社交系统。</p>" +
      "<p>3）本游戏中有用户实名认证系统，认证为未成年人的用户将接受以下管理：游戏中部分玩法和道具需要付费。未满12周岁的用户无法进行游戏充值；12周岁（含）以上未满16周岁的用户，单次充值上限50元人民币，每月充值上限200元人民币；16周岁（含）以上未成年用户，单次充值上限100元人民币，每月充值上限400元人民币。未成年用户仅可在周五、周六、周日和法定节假日的20时至21时进行游戏。</p>" +
      "<p>4）游戏中需要玩家合理分配资源，提升英雄级别，排列英雄阵型来提高阵容的强度以获得对战的胜利，有助于锻炼玩家的逻辑思维能力。游戏中含有社交系统，如好友、组队玩法等，鼓励玩家间的交流和配合，有助于提升玩家的沟通能力和团队协作能力。</p>",
  }
  var freeze = Object.freeze(Object.defineProperty({
    __proto__: null,
    __desc: "\u5b58\u7ba1\u7981\u6b62\u4fee\u6539\u7684\u6570\u636e",

  }, Symbol.toStringTag, {value: "Module"}));
  var basicConfig = {
    baseUrlManager: baseUrlManager,
    baseData: baseData,
    dataManager: freeze
  }
  // console.log("%c%s", "color:green;", "\u91d1\u94f2\u94f2\u4e4b\u6218\u5b98\u7f51\u57fa\u7840\u914d\u7f6e\u5e93\uff0c\u95ee\u9898\u53cd\u9988\uff1a\u0077\u0075\u0078\u0075\u0067\u0065\u006e\u0067");
  console.log("%c%s", "color:green;", "\u63a5\u6536\u53d8\u91cf\uff1a basicConfig",basicConfig);
  return basicConfig
});


