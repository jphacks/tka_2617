-- apiはsecret key（service_role）でDBを読み書きする。新しいSupabase CLIで作ったDBは、
-- publicのテーブルにservice_roleの読み書きの権限を付けないので、apiが服を読めず503になる。
-- 権限はservice_roleにだけ付け、anon・authenticated（ブラウザから直接つなぐ役割）には付けない。
-- 前のCLIで作ったDBには、もう同じ権限が付いているので、流しても変わらない。
grant select, insert, update, delete on all tables in schema public to service_role;

-- これから足すテーブルにも、同じ権限を付ける
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
