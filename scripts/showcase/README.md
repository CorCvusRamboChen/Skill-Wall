# 精选校友示例（showcase）

技能墙上带「精选校友 · 非本人入驻」的名片是这里生成的：墨大 / VCA 出身、有官方个人
网站的公众人物。他们不是用户，没人能以他们的身份登录；点名片直接去对方的网站。

## 流程

```bash
node crawl_alumni.mjs     # Wikidata：在墨大/VCA 读过书 且 登记了官方网站的人 → alumni_all.json
node crawl_wiki.mjs       # 英文维基百科的校友分类，补 Wikidata 漏掉的人     → wiki_people.json
node verify_sites.mjs     # 合并，逐个请求网站（死链、被抢注的域名在这一步筛掉）→ candidates.json
node facts.mjs "姓名" …   # 读维基百科原文里关于学历的句子，写名片文案时对照
# 人工：编辑 selection.json（选谁、中文文案、标签）
node build_showcase.mjs   # 生成封面字体块 tiles/*.png 和 seed-showcase.sql
```

## 选人规则

- 学历必须在来源里有原话（维基百科正文，或学校自己的页面），不凭印象。
- 网站必须实际打得开，且是本人的站。社交账号、任职单位页面、数据库页面都不算。
- 记录里的「官方网站」会过期：2026-09-30 这一轮就筛出两个已被抢注成赌博站的域名。
  **每次重新生成前都要重跑 verify_sites.mjs。**
- 不放：已故者、成人内容、有公共争议的人物、政界人物。
- 封面是我们自己生成的字体块（人名 + 域名），不截对方网站的图。

## 上线 / 撤下

```bash
# 封面图进上传卷，再灌数据（幂等）
tar -C scripts/showcase/tiles -cf - . | ssh rambo@100.64.116.93 'cd ~/skill-wall && docker compose exec -T api tar -xf - -C /data/uploads'
ssh rambo@100.64.116.93 'cd ~/skill-wall && docker compose exec -T db psql -U skillwall -d skillwall -f -' < db/seed-showcase.sql

# 全部撤下
ssh rambo@100.64.116.93 "cd ~/skill-wall && docker compose exec -T db psql -U skillwall -d skillwall -c \"delete from users where realm = 'showcase'\""
```

本人要求更正或移除时，从 selection.json 里删掉那一条，重新生成并重灌即可。
