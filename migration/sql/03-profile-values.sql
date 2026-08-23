SELECT pv.uid, pf.name AS field, pv.value
FROM profile_values pv
JOIN profile_fields pf ON pf.fid = pv.fid
WHERE pv.value IS NOT NULL AND pv.value <> ''
ORDER BY pv.uid, pf.name;
