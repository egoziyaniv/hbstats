import { checkSql, ensureParser } from '@/lib/chat-sql/guard';

beforeAll(() => ensureParser());

const ok = (sql: string) => expect(checkSql(sql)).toEqual({ ok: true });
const bad = (sql: string, reason: RegExp) => {
  const r = checkSql(sql);
  expect(r.ok).toBe(false);
  if ('reason' in r) expect(r.reason).toMatch(reason);
};

describe('checkSql', () => {
  it('allows reads over the chat schema', () => {
    ok('select club_key, count(*) from chat.team_games where season_year = 2020 group by 1 order by 2 desc limit 5');
    ok(`with g as (select club_key, team_game_no, goals_for >= 5 as big from chat.team_games),
        runs as (select *, team_game_no - row_number() over (partition by club_key, big order by team_game_no) as grp from g where big)
        select club_key, count(*) from runs group by club_key, grp having count(*) >= 3`);
    ok("select player, sum(minutes) from chat.player_appearances where player ilike '%ברדה%' group by 1");
    ok('select extract(year from date)::int y, round(avg(goals_for), 2) from chat.team_games group by 1');
    ok('select * from chat.goals g join lateral (select count(*) n from chat.goals x where x.player_key = g.player_key) y on true limit 3');
    ok('select (select max(position) from chat.standings) m');
    ok('select * from generate_series(1, 3) s');
  });

  it('rejects writes, DDL and multiple statements', () => {
    bad("insert into chat.club_map values ('a','b','c')", /only SELECT/);
    bad('drop table chat.goals', /only SELECT/);
    bad('select 1; select 2', /exactly one/);
    bad('with x as (delete from chat.club_map returning *) select * from x', /only reading/);
    bad('select * into t from chat.goals', /SELECT INTO/);
    bad('select * from chat.goals for update', /locking/);
  });

  it('rejects anything outside the chat schema', () => {
    bad('select * from users', /only chat\.\*/);
    bad('select * from public.users', /only chat\.\*/);
    bad('select email from chat.goals, public.users', /only chat\.\*/);
    bad('select (select count(*) from sessions)', /only chat\.\*/);
    bad('select * from pg_catalog.pg_authid', /only chat\.\*/);
  });

  it('rejects dangerous functions and casts', () => {
    bad('select pg_sleep(10)', /pg_sleep/);
    bad("select pg_read_file('/etc/passwd')", /pg_read_file/);
    bad("select set_config('x', 'y', false)", /set_config/);
    bad("select current_setting('data_directory')", /current_setting/);
    bad("select dblink('host=x', 'select 1')", /dblink/);
    bad("select 'pg_authid'::regclass", /regclass/);
    bad('select public.anything()', /public\.anything/);
  });

  it('allows $n parameters only when asked', () => {
    bad('select * from chat.goals where player_key = $1', /parameters/);
    expect(checkSql('select * from chat.goals where player_key = $1', { allowParams: true })).toEqual({ ok: true });
  });

  it('reports syntax errors', () => {
    bad('select from where', /syntax error/);
  });
});
