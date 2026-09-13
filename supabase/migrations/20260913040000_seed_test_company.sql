-- One-off seed: a test company so the admin dashboard can be previewed
-- before AnneMor's real company exists. Safe to delete manually later —
-- not referenced by application code, just a row to look at.
insert into companies (name, office_email, admin_name)
values ('Testbolag AB', 'kontor@testbolag.se', 'AnneMor Testsson');
