-- "Backlog Arkiv": pause an item until a future date so it stops cluttering
-- Backlog (e.g. measurements taken for a build that starts next spring),
-- then it reappears automatically once the date passes. See useItems.js
-- pauseItem/resumeItem/reactivatePausedItems and BacklogView.jsx.
alter table items add column paused_until date;
