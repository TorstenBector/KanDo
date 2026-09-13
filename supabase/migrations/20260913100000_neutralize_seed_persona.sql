-- "AnneMor" was our internal dev persona name while speccing the admin
-- flow, not a real detail — shouldn't linger in example data anyone could
-- see. Renaming, not deleting the test company: the +admin test account is
-- still linked to it for ongoing testing.
update companies
set admin_name = 'Testadmin'
where name = 'Testbolag AB' and admin_name = 'AnneMor Testsson';
