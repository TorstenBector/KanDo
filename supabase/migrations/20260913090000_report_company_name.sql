-- Adds company_name to the public report RPC so the PDF/print view can
-- show the actual company instead of the hardcoded "KP Näslunds
-- Gallringstjänst" left over from the original Lovable single-tenant app
-- (that name was baked into every PDF regardless of which company the
-- driver actually belonged to — a real bug once the app went multi-tenant,
-- not just stale example data).
drop function if exists get_report_by_token(uuid);

create function get_report_by_token(token uuid)
returns table (
  driver_name text,
  company_name text,
  year_month text,
  submitted_at timestamptz,
  date date,
  check_in text,
  check_out text,
  break_minutes integer,
  trakt text,
  deviation text
) as $$
  select ds.driver_name, c.name as company_name, mr.year_month, mr.submitted_at,
         te.date, te.check_in, te.check_out, te.break_minutes, te.trakt, te.deviation
  from month_reports mr
  join driver_settings ds on ds.user_id = mr.user_id
  left join companies c on c.id = mr.company_id
  join time_entries te on te.user_id = mr.user_id
    and to_char(te.date, 'YYYY-MM') = mr.year_month
  where mr.share_token = token and mr.status = 'submitted'
  order by te.date;
$$ language sql security definer stable;

grant execute on function get_report_by_token(uuid) to anon;
