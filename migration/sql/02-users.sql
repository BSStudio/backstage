-- `init` is the address the account registered with. It often survives a later
-- mail change and is worth a second match key.
SELECT uid, name, mail, init, status, created, access, login
FROM users
WHERE uid > 0
ORDER BY uid;
