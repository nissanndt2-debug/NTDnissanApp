-- Usuarios de prueba, uno por rol. Contrasena para todos: admin123
-- (mismo hash bcrypt que insert_admin.sql genero para 'admin123')
INSERT INTO "Provider" (name, code) VALUES ('Transportes Demo', 'DEMO')
ON CONFLICT (name) DO NOTHING;

INSERT INTO "User" (email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt")
VALUES
  ('wws@nissan.com', '$2b$12$TI.l3rk51wQxDJP5jVZqKOhdisbxdUHUhWAGYvvNMYVpA/AYjsCRe', 'Demo WWS', 1, NULL, 'A1', NOW(), NOW()),
  ('scm@nissan.com', '$2b$12$TI.l3rk51wQxDJP5jVZqKOhdisbxdUHUhWAGYvvNMYVpA/AYjsCRe', 'Demo SCM', 2, NULL, 'A1', NOW(), NOW()),
  ('body@nissan.com', '$2b$12$TI.l3rk51wQxDJP5jVZqKOhdisbxdUHUhWAGYvvNMYVpA/AYjsCRe', 'Demo Body', 3, NULL, 'A1', NOW(), NOW()),
  ('carrier@nissan.com', '$2b$12$TI.l3rk51wQxDJP5jVZqKOhdisbxdUHUhWAGYvvNMYVpA/AYjsCRe', 'Demo Carrier',
   4, (SELECT id FROM "Provider" WHERE name = 'Transportes Demo'), 'A1', NOW(), NOW()),
  ('wty@nissan.com', '$2b$12$TI.l3rk51wQxDJP5jVZqKOhdisbxdUHUhWAGYvvNMYVpA/AYjsCRe', 'Demo WTY', 6, NULL, 'A1', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;
