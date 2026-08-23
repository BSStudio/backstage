SELECT ur.uid, r.name AS role
FROM users_roles ur
JOIN role r ON r.rid = ur.rid
ORDER BY ur.uid, r.name;
