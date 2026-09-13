-- What a company calls the people reporting time — not every business is a
-- forestry contractor with "förare" (drivers); a swim school running the
-- old app would want "Instruktör" instead. Company-wide, like office_email.
alter table companies add column role_label text not null default 'Förare';
alter table companies add column role_label_plural text not null default 'Förare';
