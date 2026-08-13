-- Password: admin123 (mismo hash que se uso para sembrar la base real de
-- desarrollo; asi las credenciales de prueba son las mismas en todos lados).
INSERT INTO "User" (email, password, name, "roleId", plant, "createdAt", "updatedAt") VALUES ('admin@nissan.com', '$2b$12$TI.l3rk51wQxDJP5jVZqKOhdisbxdUHUhWAGYvvNMYVpA/AYjsCRe', 'Admin', 5, 'A1', NOW(), NOW());
