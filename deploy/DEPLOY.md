# 部署到 forum-app

技能墙跑在 forum-app（100.64.116.93）上，各校的墙把 `/skillwall/` 反代过来。
forum-storage 已经背着两套 Supabase，不要往那边放。

## 首次部署

```bash
# 1. 代码上机（forum-app 没装 git 的话就 scp 整个目录，排除 node_modules）
ssh rambo@100.64.116.93 'mkdir -p ~/skill-wall'
rsync -a --exclude node_modules --exclude .env ./ rambo@100.64.116.93:~/skill-wall/

# 2. 填 .env（REALMS 里的 secret 来自 forum-storage 两套栈的 .env 里的 JWT_SECRET）
ssh rambo@100.64.116.93
cd ~/skill-wall && cp .env.example .env && nano .env

# 3. 起容器。api 容器启动时自动跑 migrate
docker compose up -d --build
docker compose logs -f api        # 看到 "skill-wall api on :8787 — realms: ..." 即可
curl -s http://172.17.0.1:8787/health

# 4. 各校 nginx 加 location（见 nginx-skillwall.snippet.conf）
#    改的是墙仓库里的 deploy/nginx-forum-app.conf，走墙的正常部署流程；
#    线上那份 bind-mount 别用 mv，覆盖前先 sha256 比对（见墙的 memory: nginx-config-deploy）
docker exec forum-web nginx -t && docker exec forum-web nginx -s reload
curl -s https://unimelbwall.com/skillwall/health
```

## 更新

```bash
rsync -a --exclude node_modules --exclude .env ./ rambo@100.64.116.93:~/skill-wall/
ssh rambo@100.64.116.93 'cd ~/skill-wall && docker compose up -d --build api'
```

新增迁移就是往 `db/migrations/` 加一个编号更大的 `.sql`，容器重启时自动应用。

## 备份

每晚 04:20 由 crontab 跑 `scripts/backup.sh`（库 dump + 上传卷，各留 14 份，在 `~/skill-wall/backups/`），forum-app 上已装。手动：

```bash
ssh rambo@100.64.116.93 '~/skill-wall/scripts/backup.sh'
```

老办法（单次拉到本地）：

```bash
ssh rambo@100.64.116.93 'cd ~/skill-wall && docker compose exec -T db pg_dump -U skillwall skillwall' | gzip > skillwall-$(date +%F).sql.gz
```

## 将来搬到独立服务器

1. 新机器装 Docker，rsync 这个目录过去，`docker compose up -d`。
2. `pg_dump` 旧库、`psql` 灌进新库（或直接拷 `skillwall-pg` 卷）。
3. 各校 nginx 的 `proxy_pass` 改成新机器地址。前端代码不用改，API 地址一直是同源的 `/skillwall/`。
