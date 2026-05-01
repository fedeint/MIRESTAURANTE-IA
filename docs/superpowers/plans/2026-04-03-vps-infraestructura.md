# Infraestructura VPS — Plan de Implementación

> **For agentic workers:** Execute tasks sequentially via SSH. Each task is a set of commands on the VPS.

**Goal:** Configurar VPS Servarica con mail server (6 buzones), file storage privado, Twenty CRM, backups, y hardening de seguridad.

**Architecture:** VPS Ubuntu 24.04 (38.49.208.40) como servidor de correo + storage + CRM. Sin acceso público a archivos — todo via API con token. CRM en Docker.

**Tech Stack:** Postfix, Dovecot, OpenDKIM, Nginx, Node.js, Docker, Twenty CRM, Let's Encrypt, UFW, Fail2ban

---

## Task 1: Hardening del servidor

**Ejecutar via SSH en root@38.49.208.40**

- [ ] **Step 1: Actualizar sistema**
```bash
apt update && apt upgrade -y
```

- [ ] **Step 2: Instalar paquetes base**
```bash
apt install -y ufw fail2ban curl wget git nano htop unzip certbot python3-certbot-nginx
```

- [ ] **Step 3: Configurar firewall UFW**
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 25/tcp
ufw allow 465/tcp
ufw allow 587/tcp
ufw allow 993/tcp
ufw --force enable
ufw status
```

- [ ] **Step 4: Configurar Fail2ban**
```bash
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = 22
maxretry = 5

[postfix]
enabled = true
port = smtp,465,submission
maxretry = 10

[dovecot]
enabled = true
port = pop3,pop3s,imap,imaps
maxretry = 10

[nginx-http-auth]
enabled = true
maxretry = 20
bantime = 900
EOF

systemctl enable fail2ban
systemctl restart fail2ban
```

- [ ] **Step 5: Crear usuario deployer**
```bash
adduser --disabled-password --gecos "" deployer
usermod -aG sudo deployer
mkdir -p /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
```

- [ ] **Step 6: Configurar hostname**
```bash
hostnamectl set-hostname mail.mirestconia.com
echo "38.49.208.40 mail.mirestconia.com mail" >> /etc/hosts
```

---

## Task 2: Mail Server (Postfix + Dovecot + DKIM)

- [ ] **Step 1: Instalar mail packages**
```bash
DEBIAN_FRONTEND=noninteractive apt install -y postfix dovecot-core dovecot-imapd opendkim opendkim-tools spamassassin
```

- [ ] **Step 2: Configurar Postfix**
```bash
cat > /etc/postfix/main.cf << 'EOF'
smtpd_banner = $myhostname ESMTP
biff = no
append_dot_mydomain = no
readme_directory = no

# TLS parameters
smtpd_tls_cert_file=/etc/letsencrypt/live/mail.mirestconia.com/fullchain.pem
smtpd_tls_key_file=/etc/letsencrypt/live/mail.mirestconia.com/privkey.pem
smtpd_tls_security_level=may
smtp_tls_security_level=may

smtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination
myhostname = mail.mirestconia.com
mydomain = mirestconia.com
myorigin = $mydomain
mydestination = $myhostname, $mydomain, localhost
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
mailbox_size_limit = 0
recipient_delimiter = +
inet_interfaces = all
inet_protocols = all

# Virtual mailboxes
virtual_mailbox_domains = mirestconia.com
virtual_mailbox_base = /var/mail/vhosts
virtual_mailbox_maps = hash:/etc/postfix/vmailbox
virtual_minimum_uid = 1000
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000

# SASL auth
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes

# DKIM
milter_protocol = 6
milter_default_action = accept
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
EOF
```

- [ ] **Step 3: Crear mailboxes**
```bash
groupadd -g 5000 vmail
useradd -g vmail -u 5000 vmail -d /var/mail/vhosts -s /usr/sbin/nologin
mkdir -p /var/mail/vhosts/mirestconia.com

cat > /etc/postfix/vmailbox << 'EOF'
no-reply@mirestconia.com    mirestconia.com/no-reply/
hola@mirestconia.com        mirestconia.com/hola/
ventas@mirestconia.com      mirestconia.com/ventas/
demo@mirestconia.com        mirestconia.com/demo/
soporte@mirestconia.com     mirestconia.com/soporte/
legal@mirestconia.com       mirestconia.com/legal/
EOF

postmap /etc/postfix/vmailbox
chown -R vmail:vmail /var/mail/vhosts
```

- [ ] **Step 4: Configurar Postfix submission (puerto 587)**
```bash
cat >> /etc/postfix/master.cf << 'EOF'
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=yes
  -o smtpd_reject_unlisted_recipient=no
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
EOF
```

- [ ] **Step 5: Configurar Dovecot**
```bash
cat > /etc/dovecot/conf.d/10-auth.conf << 'EOF'
disable_plaintext_auth = yes
auth_mechanisms = plain login
!include auth-passwdfile.conf.ext
EOF

cat > /etc/dovecot/conf.d/auth-passwdfile.conf.ext << 'EOF'
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT /etc/dovecot/users
}
userdb {
  driver = static
  args = uid=vmail gid=vmail home=/var/mail/vhosts/%d/%n
}
EOF

cat > /etc/dovecot/conf.d/10-mail.conf << 'EOF'
mail_location = maildir:/var/mail/vhosts/%d/%n
mail_privileged_group = vmail
namespace inbox {
  inbox = yes
}
EOF

cat > /etc/dovecot/conf.d/10-master.conf << 'EOF'
service imap-login {
  inet_listener imap {
    port = 0
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
EOF

cat > /etc/dovecot/conf.d/10-ssl.conf << 'EOF'
ssl = required
ssl_cert = </etc/letsencrypt/live/mail.mirestconia.com/fullchain.pem
ssl_key = </etc/letsencrypt/live/mail.mirestconia.com/privkey.pem
ssl_min_protocol = TLSv1.2
EOF
```

- [ ] **Step 6: Crear contraseñas de buzones**
```bash
# Generar contraseñas
PASS_NOREPLY=$(openssl rand -base64 16)
PASS_HOLA=$(openssl rand -base64 16)
PASS_VENTAS=$(openssl rand -base64 16)
PASS_DEMO=$(openssl rand -base64 16)
PASS_SOPORTE=$(openssl rand -base64 16)
PASS_LEGAL=$(openssl rand -base64 16)

# Crear archivo de usuarios Dovecot
> /etc/dovecot/users
for box in "no-reply:$PASS_NOREPLY" "hola:$PASS_HOLA" "ventas:$PASS_VENTAS" "demo:$PASS_DEMO" "soporte:$PASS_SOPORTE" "legal:$PASS_LEGAL"; do
  user="${box%%:*}"
  pass="${box##*:}"
  hash=$(doveadm pw -s SHA512-CRYPT -p "$pass")
  echo "${user}@mirestconia.com:${hash}" >> /etc/dovecot/users
done

chmod 600 /etc/dovecot/users

# Imprimir contraseñas (guardar en .credentials/)
echo "=== CONTRASEÑAS DE BUZONES ==="
echo "no-reply@mirestconia.com: $PASS_NOREPLY"
echo "hola@mirestconia.com: $PASS_HOLA"
echo "ventas@mirestconia.com: $PASS_VENTAS"
echo "demo@mirestconia.com: $PASS_DEMO"
echo "soporte@mirestconia.com: $PASS_SOPORTE"
echo "legal@mirestconia.com: $PASS_LEGAL"
```

- [ ] **Step 7: Configurar DKIM**
```bash
mkdir -p /etc/opendkim/keys/mirestconia.com
opendkim-genkey -b 2048 -d mirestconia.com -D /etc/opendkim/keys/mirestconia.com -s dkim -v

cat > /etc/opendkim.conf << 'EOF'
Syslog yes
UMask 007
Socket inet:8891@localhost
Domain mirestconia.com
KeyFile /etc/opendkim/keys/mirestconia.com/dkim.private
Selector dkim
Canonicalization relaxed/simple
Mode sv
EOF

chown -R opendkim:opendkim /etc/opendkim
cat /etc/opendkim/keys/mirestconia.com/dkim.txt
# ↑ Output this — needed for DNS TXT record
```

- [ ] **Step 8: SSL con Let's Encrypt**
```bash
# Primero necesitamos nginx para el challenge
apt install -y nginx
certbot certonly --nginx -d mail.mirestconia.com -d torach.mirestconia.com --non-interactive --agree-tos -m leonidas.yauri@dignita.tech
```

- [ ] **Step 9: Iniciar servicios**
```bash
systemctl restart postfix dovecot opendkim
systemctl enable postfix dovecot opendkim
```

- [ ] **Step 10: Configurar DNS en Vercel**
Agregar los siguientes registros DNS via Vercel CLI:
```bash
# Desde la máquina local, no el VPS
vercel dns add mirestconia.com mail A 38.49.208.40
vercel dns add mirestconia.com @ MX "mail.mirestconia.com" --priority 10
vercel dns add mirestconia.com @ TXT "v=spf1 ip4:38.49.208.40 ~all"
vercel dns add mirestconia.com torach A 38.49.208.40
# DKIM record se agrega después con el output del Step 7
```

---

## Task 3: Storage API en el VPS

- [ ] **Step 1: Instalar Node.js en el VPS**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
```

- [ ] **Step 2: Crear estructura de storage**
```bash
mkdir -p /var/www/storage/mirestconia/shared
mkdir -p /var/www/storage/app
chown -R deployer:deployer /var/www/storage
```

- [ ] **Step 3: Crear Storage API (Express)**
```bash
cd /var/www/storage/app
npm init -y
npm install express multer helmet cors
```

Crear `/var/www/storage/app/server.js` — Express server que:
- Escucha en puerto 3500 (interno)
- Valida `X-Storage-Key` header
- `POST /files/:tenantId/:category` → upload
- `GET /files/:tenantId/:category/:filename` → download
- `DELETE /files/:tenantId/:category/:filename` → delete
- Crea directorios por tenant automáticamente
- Rate limit: 100 req/min

- [ ] **Step 4: Configurar Nginx como reverse proxy**
```bash
cat > /etc/nginx/sites-available/storage << 'EOF'
server {
    listen 443 ssl;
    server_name torach.mirestconia.com;

    ssl_certificate /etc/letsencrypt/live/torach.mirestconia.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/torach.mirestconia.com/privkey.pem;

    client_max_body_size 100M;

    location / {
        # Validate API key
        if ($http_x_storage_key = "") { return 403; }
        
        proxy_pass http://127.0.0.1:3500;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/storage /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

- [ ] **Step 5: Systemd service para storage API**
```bash
cat > /etc/systemd/system/storage-api.service << 'EOF'
[Unit]
Description=MiRestcon Storage API
After=network.target

[Service]
Type=simple
User=deployer
WorkingDirectory=/var/www/storage/app
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=STORAGE_API_KEY=(generada)
Environment=ENCRYPTION_KEY=(generada)
Environment=PORT=3500

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable storage-api
systemctl start storage-api
```

---

## Task 4: Integración storage con el sistema

- [ ] **Step 1: Crear services/vps-storage.js**
Nuevo servicio que reemplaza supabase-storage.js para uploads/downloads.

- [ ] **Step 2: Actualizar routes/solicitud.js**
Cambiar uploadFile de Supabase a VPS storage.

- [ ] **Step 3: Agregar proxy en server.js**
Ruta `/api/files/:tenantId/:path*` que proxy-ea al VPS con el token.

- [ ] **Step 4: Actualizar .env en Vercel**
```
STORAGE_API_URL=https://torach.mirestconia.com
STORAGE_API_KEY=(token secreto generado)
```

---

## Task 5: Twenty CRM (Docker)

- [ ] **Step 1: Instalar Docker**
```bash
apt install -y docker.io docker-compose-v2
systemctl enable docker
```

- [ ] **Step 2: Deploy Twenty CRM**
```bash
mkdir -p /opt/twenty
cd /opt/twenty
curl -o docker-compose.yml https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docker/docker-compose.yml
# Editar variables de entorno (SECRET, DB pass, etc.)
docker compose up -d
```

- [ ] **Step 3: Configurar Nginx proxy para CRM**
```bash
cat > /etc/nginx/sites-available/crm << 'EOF'
server {
    listen 443 ssl;
    server_name crm-internal.mirestconia.com;

    ssl_certificate /etc/letsencrypt/live/torach.mirestconia.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/torach.mirestconia.com/privkey.pem;

    # IP whitelist — solo tu IP
    # allow YOUR_IP;
    # deny all;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## Task 6: Backups automáticos

- [ ] **Step 1: Script de backup DB**
```bash
cat > /opt/backup-db.sh << 'SCRIPT'
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/var/www/storage/mirestconia/backups
mkdir -p $BACKUP_DIR

# Dump Supabase DB
PGPASSWORD="$SUPABASE_DB_PASS" pg_dump -h "$SUPABASE_HOST" -U postgres -d postgres | gzip | openssl enc -aes-256-cbc -pass env:ENCRYPTION_KEY > "$BACKUP_DIR/db-$DATE.sql.gz.enc"

# Remove backups older than 30 days
find $BACKUP_DIR -name "db-*.sql.gz.enc" -mtime +30 -delete

echo "[$(date)] Backup completed: db-$DATE.sql.gz.enc"
SCRIPT

chmod +x /opt/backup-db.sh
```

- [ ] **Step 2: Cron jobs**
```bash
crontab -e
# Agregar:
# Backup DB diario 3am
0 3 * * * /opt/backup-db.sh >> /var/log/backup.log 2>&1
# Backup archivos semanal domingos 2am
0 2 * * 0 tar czf /var/www/storage/mirestconia/backups/files-$(date +\%Y\%m\%d).tar.gz -C /var/www/storage/mirestconia . --exclude=backups >> /var/log/backup.log 2>&1
```

---

## Task 7: Verificación

- [ ] Enviar email de prueba desde no-reply@mirestconia.com
- [ ] Recibir email en ventas@mirestconia.com
- [ ] Upload archivo de prueba via storage API
- [ ] Download archivo via proxy en Vercel
- [ ] Acceder a Twenty CRM
- [ ] Verificar backup ejecuta correctamente
- [ ] Verificar fail2ban está activo
- [ ] Verificar firewall UFW correcto
