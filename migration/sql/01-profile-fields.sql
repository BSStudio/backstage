-- Schema probe. Run this first: everything downstream keys off `name`, and a
-- wrong guess about a field name silently blanks that column for every member
-- instead of failing.
SELECT fid, name, title, type, category, weight
FROM profile_fields
ORDER BY category, weight, fid;
