# 精选校友示例（showcase）

技能墙上带「精选校友」标的名片是这里生成的：墨大 / VCA 出身、有官方个人网站的公众
人物。他们不是用户，没人能以他们的身份登录；点名片直接去对方的网站。名片上写所学
专业和哪一届，封面是对方网站首页的截图。

## 流程

```bash
node crawl_alumni.mjs     # Wikidata：在墨大/VCA 读过书 且 登记了官方网站的人 → alumni_all.json
node crawl_wiki.mjs       # 英文维基百科的校友分类，补 Wikidata 漏掉的人     → wiki_people.json
node verify_sites.mjs     # 合并，逐个请求网站（死链、被抢注的域名在这一步筛掉）→ candidates.json
node facts.mjs "姓名" …   # 读维基百科原文里关于学历的句子，写名片文案时对照
# 人工：编辑 selection.json（选谁、中文文案、标签、edu 所学专业、cohort 哪一届）
node capture_sites.mjs    # 每个网站首页截一张图 → shots/<slug>.jpg、shots/report.json
# 人工：把 shots/ 里的图逐张看一遍（见下）
node build_showcase.mjs   # → covers/（要传到服务器的封面）、db/seed-showcase.sql、manifest.json
```

`alumni_all.json` 之类的爬取结果、`shots/`、`covers/` 都不进仓库：随时可以重新生成，
而且仓库是公开的，别人网站的截图没必要在这里再存一份。

## 选人规则

- 学历必须在来源里有原话（维基百科正文、本人网站的简历页、学校自己的页面），不凭印象。
  年份查不到就写查不到（`cohort: "毕业年份未公开"`），没毕业的写「就读」不写「届」。
  年份不是从维基百科读来的，把出处记在 `yearSource`。
- 网站必须实际打得开，且是本人的站。社交账号、任职单位页面、数据库页面都不算。
- 记录里的「官方网站」会过期：2026-09-30 这一轮就筛出两个已被抢注成赌博站的域名。
  **每次重新生成前都要重跑 verify_sites.mjs。**
- 不放：已故者、成人内容、有公共争议的人物、政界人物。

## 封面截图

- 只取首页一页，取一次；浏览器的 UA 带着我们的名字和网址。对方 robots.txt 把 `/`
  对所有人关掉的，不截，那张名片用字体块（人名 + 域名）。
- **截完必须人工逐张看**：还在加载的空白页、挡住内容的弹窗、轮播切到一半的重影
  （加 `SETTLE_MS=7000` 重截那一张）、不适合放在校园站上的画面。不能用的，在
  selection.json 里给那个人加 `"cover": "tile"`。
- 封面文件名跟着图片内容走（上传目录按「永不变」缓存），重截之后地址会变，
  所以重截必须重新 build、重新上传、重新灌数据，三步一起。
- 这是别人的作品。对方要求撤下时当天撤：删掉 selection.json 里那一条（或改成
  `"cover": "tile"` 只撤图），重新生成并重灌。

## 上线 / 撤下

```bash
# 封面图进上传卷，再灌数据（幂等）
tar -C scripts/showcase/covers -cf - . | ssh rambo@100.64.116.93 'cd ~/skill-wall && docker compose exec -T api tar -xf - -C /data/uploads'
ssh rambo@100.64.116.93 'cd ~/skill-wall && docker compose exec -T db psql -U skillwall -d skillwall -v ON_ERROR_STOP=1 -f -' < db/seed-showcase.sql

# 全部撤下
ssh rambo@100.64.116.93 "cd ~/skill-wall && docker compose exec -T db psql -U skillwall -d skillwall -c \"delete from users where realm = 'showcase'\""
```

灌数据只换数据库里的行；上传卷里旧的封面文件不会自己消失，换过封面之后按
`manifest.json` 里不再出现的文件名手动删。
