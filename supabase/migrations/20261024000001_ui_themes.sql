-- Look themes (F16・ADR-045): the theme a member picked for their own screens (森・海・雪・…), and
-- whether the seasonal ones (ハロウィン・クリスマス・お正月) take over during their season.
-- Additive only; the code before this ignores both.

alter table public.profiles
  add column ui_theme text,
  add column season_themes boolean not null default true;

-- 「見た目のテーマ」. null is 標準 (the paper look that follows the rank). The theme ids live in the
-- code (lib/theme/themes.ts); the database only checks shape, and the code reads an unknown id as 標準.
create function public.set_ui_theme(p_user_id uuid, p_theme text, p_season_themes boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_theme is not null and p_theme !~ '^[a-z]{1,20}$' then
    raise exception 'invalid_theme' using errcode = 'P0001';
  end if;
  update public.profiles
  set ui_theme = p_theme, season_themes = coalesce(p_season_themes, true)
  where id = p_user_id and deactivated_at is null;
  if not found then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.set_ui_theme(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_ui_theme(uuid, text, boolean) to service_role;
