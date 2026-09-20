/**
 * 默认站点配置 - 内容由此驱动，可在 admin.html 中可视化编辑
 * 所有图片/视频字段支持两种值：
 *   1. 相对路径字符串（如 "assets/images/hero.svg"） - 引用本地文件
 *   2. 形如 "idb://xxxx" 的字符串 - 引用上传到 IndexedDB 的二进制资源
 */
window.DEFAULT_CONFIG = {
  meta: {
    version: 1,
    lastUpdated: "2026-09-18"
  },
  site: {
    title: "田娜",
    subtitle: "AIGC作品集",
    heroImage: "assets/images/hero-avatar.svg",
    heroTagline: "AIGC Portfolio"
  },
  profile: {
    avatar: "assets/images/profile-avatar.svg",
    name: "田娜",
    basicInfo: [
      { label: "出生", value: "1996.9.24 / 女" },
      { label: "地区", value: "西安市雁塔区丈八街道" },
      { label: "邮箱", value: "1181474949@qq.com" },
      { label: "社交", value: "T774699N" },
      { label: "电话", value: "17629086359" }
    ],
    tags: ["西安", "汉族", "天蝎座"],
    status: "自由热烈 / 永远真诚",
    sports: "羽毛球 / 散步",
    hobbies: "听音乐 / 热爱生活",
    bio: "AIGC 创作者，专注短剧分镜、角色设计与影视化叙事，融合民国谍战、城市文旅与商业广告的视觉表达。"
  },
  sections: [
    {
      id: "real-drama",
      number: "01",
      title: "真人短剧",
      subtitle: "Work collection",
      items: [
        {
          type: "image-grid",
          id: "storyboard-01",
          title: "分镜展示",
          columns: 2,
          images: [
            { src: "assets/images/storyboard-01.svg", caption: "晏农在会议室主持会议，眼神锐利坚定，手边放着碎象棋和地图。" },
            { src: "assets/images/storyboard-02.svg", caption: "小油菜被纱布塞口勒住，惊恐圆睁的双眼大特写。" },
            { src: "assets/images/storyboard-03.svg", caption: "梁容宽将保安团证件拍在书桌上，神情带着威胁。" },
            { src: "assets/images/storyboard-04.svg", caption: "柳志春的指尖抵住白铜小盒，过木纹发出低沉摩擦声。" }
          ]
        },
        {
          type: "character-cards",
          id: "characters-01",
          title: "角色设计",
          cards: [
            { name: "小油菜（当归）", desc: "30岁，女。神秘莫测，秘密交通员，关键线索持有者。", avatar: "assets/images/char-01.svg" },
            { name: "晏农", desc: "男，45岁。沉稳锐利，追查特密案件的核心主导者。", avatar: "assets/images/char-02.svg" },
            { name: "失踪者", desc: "男，30岁。失踪者，卷入1931黄金劫案，情绪张力强。", avatar: "assets/images/char-03.svg" },
            { name: "柳志春", desc: "男，35岁，秘密交通员之一，小油菜的丈夫。", avatar: "assets/images/char-04.svg" }
          ]
        },
        {
          type: "script-block",
          id: "script-01",
          title: "分镜脚本",
          projectName: "《特密之谜》先导片",
          genre: "红色悬疑短剧",
          synopsis: "讲述一九三一年顾顺章叛变，为开展地下营救工作，中央苏区选派七名经验丰富的交通员负责秘密押运一批金条去上海。可这批金条却在最后一段交接路程中不翼而飞。几经周折之后，这桩十八年前的黄金大劫案，终于水落石出的故事。"
        },
        {
          type: "video-gallery",
          id: "videos-01",
          title: "影片展示",
          videos: [
            { src: "", poster: "assets/images/video-poster-01.svg", title: "完整影片", duration: "0:08" }
          ]
        }
      ]
    },
    {
      id: "anime-drama",
      number: "02",
      title: "动漫短剧",
      subtitle: "Work collection",
      items: [
        {
          type: "image-grid",
          id: "storyboard-02",
          title: "分镜展示",
          columns: 2,
          images: [
            { src: "assets/images/anime-01.svg", caption: "动漫短剧分镜 01" },
            { src: "assets/images/anime-02.svg", caption: "动漫短剧分镜 02" },
            { src: "assets/images/anime-03.svg", caption: "动漫短剧分镜 03" },
            { src: "assets/images/anime-04.svg", caption: "动漫短剧分镜 04" }
          ]
        },
        {
          type: "character-cards",
          id: "characters-02",
          title: "角色设计",
          cards: [
            { name: "主角 A", desc: "动漫短剧主角设定，待补充角色介绍。", avatar: "assets/images/anime-char-01.svg" },
            { name: "主角 B", desc: "动漫短剧配角设定，待补充角色介绍。", avatar: "assets/images/anime-char-02.svg" }
          ]
        }
      ]
    },
    {
      id: "city-tourism",
      number: "03",
      title: "城市文旅",
      subtitle: "Work collection",
      items: [
        {
          type: "image-grid",
          id: "tourism-grid",
          title: "项目展示",
          columns: 2,
          images: [
            { src: "assets/images/city-01.svg", caption: "城市文旅项目 01" },
            { src: "assets/images/city-02.svg", caption: "城市文旅项目 02" },
            { src: "assets/images/city-03.svg", caption: "城市文旅项目 03" },
            { src: "assets/images/city-04.svg", caption: "城市文旅项目 04" }
          ]
        }
      ]
    },
    {
      id: "commercial",
      number: "04",
      title: "商业广告",
      subtitle: "Work collection",
      items: [
        {
          type: "image-grid",
          id: "commercial-grid",
          title: "广告作品",
          columns: 2,
          images: [
            { src: "assets/images/ad-01.svg", caption: "商业广告作品 01" },
            { src: "assets/images/ad-02.svg", caption: "商业广告作品 02" }
          ]
        },
        {
          type: "video-gallery",
          id: "commercial-videos",
          title: "广告片花",
          videos: [
            { src: "", poster: "assets/images/ad-video-01.svg", title: "广告片 01", duration: "0:15" }
          ]
        }
      ]
    }
  ],
  footer: {
    links: [
      { text: "条款与支持团队", url: "#" },
      { text: "隐私政策", url: "#" },
      { text: "设计就用 Canva 可画", url: "https://www.canva.com/" }
    ],
    copyright: "© 2026 田娜 AIGC 作品集"
  }
};
