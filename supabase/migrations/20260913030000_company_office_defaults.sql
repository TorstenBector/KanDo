-- Office email + payroll-admin name are company-wide, not per-driver — every
-- driver at the same company reports to the same office. AnneMor sets these
-- once; solo drivers with no company (driver_settings.company_id is null)
-- keep their own copies on driver_settings as before.

alter table companies
  add column office_email text,
  add column admin_name text;
