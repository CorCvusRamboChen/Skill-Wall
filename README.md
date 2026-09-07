# 技能墙 Skill Wall

大家把技能和作品集放出来、交朋友、招队友的地方。先在墨大墙里试运营，
跑通后独立成站。这个仓库是它的后端（JSON API + Postgres）和部署配置；
前端页面另起（`web/`），各校的墙则像接 SquadPool 一样原生渲染它的 API。

## 结构

```
api/            Hono + pg 的 JSON API（Node ≥ 20，ESM，无构建）
  auth.mjs      墙 SSO：收各校 Supabase 的 session JWT，按 iss 匹配 realm 验签
  routes/       me（我的名片）、profiles（找人）、posts（组队招募）
db/migrations/  SQL 迁移，按文件名顺序应用一次
scripts/        migrate.mjs（容器启动自动跑）、mint-dev-token.mjs（本地造 token）
deploy/         docker-compose 说明、nginx 反代片段、部署步骤
docs/           设计参考（demo.html 是产品形态的可点原型）
web/            独立站前端，待建
```

## 身份

不做账号系统。用户 = `(realm, subject)`，realm 是三套 Supabase 后端之一
（unimelb / monash / go8），subject 是那边的 `auth.uid()`。墙调 API 时带
`Authorization: Bearer <墙的 session JWT>`，Go8 六校共用一个项目所以再带
`X-Wall-School: anu` 之类说明是哪所。API 按 JWT 的 `iss` 找到 realm，用它的
JWT secret（或 JWKS）验签，首次见到就建一行 `users`。

**issuer 必须照 GoTrue 实际签的填**：两套自建栈都设了 `GOTRUE_JWT_ISSUER` 为裸主机
（`https://api.talkwalll.com` / `https://api.monashwall.com`，没有 `/auth/v1`），
对不上就是一片 401（`docker compose logs api` 里会打 `auth reject: unknown_issuer iss=…`）。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 连库探活 |
| GET | `/me` | 我的用户行 + 名片 |
| PUT | `/me/profile` | 建/改名片：displayName, program, pitch, tags[≤5], openToTeam, openToFriends, template(cv/gallery/dev), siteUrl, links[], content{}, published |
| DELETE | `/me/profile` | 撤下名片 |
| GET | `/profiles?tag=&school=&open=1&q=&limit=&offset=` | 找人 |
| GET | `/profiles/tags` | 标签云 |
| GET | `/profiles/:slug` | 一张名片（含 content） |
| GET | `/posts?stage=&tag=&q=` | 招募帖（默认不含 closed） |
| POST | `/posts` | 发帖：title, stage, commitment, description, tags, roles[{name, needed}] |
| GET | `/posts/:id` | 一帖 |
| PATCH | `/posts/:id` | 改帖 / 关帖（仅发起人） |
| POST | `/posts/:id/apply` | 申请：roleId, message |
| GET | `/posts/:id/applications` | 申请列表（仅发起人） |
| PATCH | `/posts/:id/applications/:appId` | status = accepted / rejected；accepted 占一个位子 |

没带 token 的请求可以读公开内容；带了坏 token 一律 401。

## 本地跑

```bash
npm install
cp .env.example .env            # 填 REALMS 和 DATABASE_URL
docker compose up -d db         # 或者任何一个 Postgres
npm run migrate
npm run dev
npm run dev:token               # 造一个 unimelb realm 的假 session
curl -H "Authorization: Bearer $(npm run -s dev:token)" http://localhost:8787/me
```

`npm test` 跑不依赖数据库的鉴权测试；`npm run check` 只做语法检查。

## 试运营样例数据

`db/seed-demo.sql` 是设计稿里那 8 张名片、5 条招募帖，挂在 `realm = 'demo'` 下（没有任何墙会签这个 realm 的 token，所以登不进去）。

```bash
docker compose exec -T db psql -U skillwall -d skillwall -f - < db/seed-demo.sql   # 幂等，重跑即替换
docker compose exec -T db psql -U skillwall -d skillwall -c "delete from users where realm = 'demo'"   # 一句清掉
```

## 部署

见 [deploy/DEPLOY.md](deploy/DEPLOY.md)。落点是 forum-app，各校 nginx 加一段
`location /skillwall/`。

## 接进墙

墙那边要做的：nav 加「技能墙」、一个原生视图（照 `src/views/gameSquad.js` 的写法）、
`src/services/skillWallApi.js` 用现有的 fetch + Bearer 封装这里的接口、租户 `features.skillWall` 开关。
