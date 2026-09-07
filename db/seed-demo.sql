-- Demo content for the trial run: the 8 name cards and 5 recruit posts from the
-- design sketch. They live under realm = 'demo', which no wall issues tokens
-- for, so nobody can ever log in as them. Idempotent: re-running replaces them.
-- Remove everything with:  delete from users where realm = 'demo';
begin;

delete from users where realm = 'demo';

insert into users (id, realm, subject, school, display_name) values
  ('00000000-0000-4000-9000-000000000001', 'demo', 'demo-1', 'unimelb', '林一舟'),
  ('00000000-0000-4000-9000-000000000002', 'demo', 'demo-2', 'unimelb', 'Chloe Wen'),
  ('00000000-0000-4000-9000-000000000003', 'demo', 'demo-3', 'unimelb', '赵思远'),
  ('00000000-0000-4000-9000-000000000004', 'demo', 'demo-4', 'unimelb', 'Ethan Ma'),
  ('00000000-0000-4000-9000-000000000005', 'demo', 'demo-5', 'unimelb', '许晚晴'),
  ('00000000-0000-4000-9000-000000000006', 'demo', 'demo-6', 'unimelb', 'Kevin Zhou'),
  ('00000000-0000-4000-9000-000000000007', 'demo', 'demo-7', 'unimelb', '唐宁'),
  ('00000000-0000-4000-9000-000000000008', 'demo', 'demo-8', 'unimelb', 'Mia Liu');

insert into profiles (user_id, slug, program, pitch, tags, open_to_team, open_to_friends, template, site_url, links, content, published) values
  ('00000000-0000-4000-9000-000000000001', 'yizhou',   'Master of IT · 2 年级',                     '做过两个上线的小程序，最近在学 Rust。想找人一起做校园工具。',        '{React,Node,TypeScript}', true,  true,  'dev',     null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000002', 'chloewen', 'Bachelor of Design · 3 年级',               '品牌与包装方向，作品集刚重做一遍，欢迎来挑刺。',                  '{Figma,插画,UI}',         true,  true,  'gallery', null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000003', 'siyuan',   'BSc Data Science · 2 年级',                 'Kaggle 铜牌一枚。会画图会讲故事，缺一个前端搭档。',               '{Python,数据分析,SQL}',    true,  false, 'cv',      null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000004', 'ethanma',  'Master of Architecture · 1 年级',           'Rhino + Grasshopper 参数化，也接效果图。周末想找乐队。',           '{Rhino,建模,吉他}',        false, true,  'gallery', null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000005', 'wanqing',  'Bachelor of Arts (Media) · 3 年级',         '跑过三档校园播客，剪辑和采访都行。想做一档留学生访谈。',           '{剪辑,写作,公众号}',       true,  true,  'cv',      null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000006', 'kevinzhou','Master of Engineering (Software) · 2 年级', 'iOS 开发，做过一个上架的日语学习 app。Unihack 找队友。',           '{Swift,Flutter,产品}',     true,  false, 'dev',     null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000007', 'tangning', 'Bachelor of Commerce · 2 年级',             '想转产品。会写 PRD、画原型，缺一个能把它做出来的人。',             '{产品,Figma,写作}',        true,  true,  'cv',      null, '[]', '{}', true),
  ('00000000-0000-4000-9000-000000000008', 'mialiu',   'Bachelor of Music · 1 年级',                '声乐 + 编曲，接活动演出，也想找人一起做游戏配乐。',               '{声乐,吉他,剪辑}',         false, true,  'gallery', null, '[]', '{}', true);

insert into team_posts (id, owner_id, title, stage, commitment, description, tags) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-9000-000000000001', '墨大二手教材交换小程序', 'active',     '到 11 月底 · 每周 2 次线上',   '解决每学期教材贵、买了用一次的问题。已有原型和 30 个种子用户，缺后端和运营。', '{React,Node,产品}'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-9000-000000000006', 'Unihack 2026 组队',       'recruiting', '黑客松周末 · 10 月 18–19',    '去年进了决赛，今年想冲奖。方向偏 AI 工具，已经有两个开发，缺设计和一个会讲的人。', '{Swift,Figma,产品}'),
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-9000-000000000005', '留学生访谈播客《墨尔本夜话》', 'recruiting', '双周更 · 长期',            '每期请一位在墨尔本做有意思事情的中国学生。有设备有剪辑，缺一个搭档主持和一个做封面的。', '{剪辑,写作,插画}'),
  ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-9000-000000000004', '毕设：AR 校园导览',       'idea',       '2027 S1 · 可算学分',          '把 Parkville 校区做成可交互 AR 地图。建筑背景，想找 Unity 或 Swift 的人一起把它变成能装的 app。', '{Unity,Swift,建模}'),
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-9000-000000000003', '校园活动数据看板',         'active',     '到期末 · 松散',               '把墨大墙的活动数据拿来做可视化：哪些社团最活跃、哪天活动最多。数据已清好，缺前端做交互图。', '{Python,数据分析,React}');

insert into team_roles (post_id, position, name, needed, filled) values
  ('00000000-0000-4000-a000-000000000001', 0, '前端', 1, 1),
  ('00000000-0000-4000-a000-000000000001', 1, '后端', 1, 0),
  ('00000000-0000-4000-a000-000000000001', 2, '运营/推广', 2, 0),
  ('00000000-0000-4000-a000-000000000002', 0, '开发', 2, 2),
  ('00000000-0000-4000-a000-000000000002', 1, 'UI/UX', 1, 0),
  ('00000000-0000-4000-a000-000000000002', 2, 'Pitch / PM', 1, 0),
  ('00000000-0000-4000-a000-000000000003', 0, '联合主持', 1, 0),
  ('00000000-0000-4000-a000-000000000003', 1, '封面/视觉', 1, 0),
  ('00000000-0000-4000-a000-000000000004', 0, 'Unity / AR 开发', 1, 0),
  ('00000000-0000-4000-a000-000000000004', 1, '3D 建模', 2, 1),
  ('00000000-0000-4000-a000-000000000005', 0, '数据', 1, 1),
  ('00000000-0000-4000-a000-000000000005', 1, '前端 / D3', 1, 0);

commit;
