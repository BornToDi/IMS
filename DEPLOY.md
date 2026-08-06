# Deploy Guide

## Oracle Linux server

This is the recommended single-server layout:

- Nginx: public ports 80/443
- Next.js: `127.0.0.1:3000`
- Express and Socket.IO: `127.0.0.1:5000`
- SQLite and uploads: `/var/lib/trackfield`
- systemd: automatic startup and restart

The repository templates are in `deploy/oracle-linux`.

### 1. Install the server packages

Oracle Linux 8/9:

```bash
sudo dnf module reset nodejs -y
sudo dnf module enable nodejs:22 -y
sudo dnf install -y nodejs nginx git openssl
node --version
```

Use Node 22 LTS. Do not use Node 20 because it is end-of-life.

### 2. Create the service user and directories

```bash
sudo useradd --system --create-home --shell /bin/bash trackfield
sudo mkdir -p /opt/trackfield /var/lib/trackfield/uploads /etc/trackfield
sudo chown -R trackfield:trackfield /opt/trackfield /var/lib/trackfield
sudo chmod 750 /etc/trackfield
```

Clone the repository:

```bash
sudo -u trackfield git clone https://github.com/BornToDi/IMS.git /opt/trackfield
cd /opt/trackfield
sudo -u trackfield npm ci
```

Keep uploaded files outside the Git checkout:

```bash
sudo -u trackfield ln -sfn /var/lib/trackfield/uploads /opt/trackfield/apps/api/uploads
```

### 3. Configure production environment

```bash
sudo cp deploy/oracle-linux/api.env.example /etc/trackfield/api.env
sudo cp deploy/oracle-linux/web.env.example /etc/trackfield/web.env
sudo chmod 640 /etc/trackfield/api.env /etc/trackfield/web.env
sudo chown root:trackfield /etc/trackfield/api.env /etc/trackfield/web.env
```

Edit `/etc/trackfield/api.env`. Replace `YOUR_DOMAIN` and generate two different secrets:

```bash
openssl rand -hex 64
```

An IP-only HTTP check can confirm that the page responds, but authenticated sessions require the final HTTPS domain because production refresh cookies are secure.

### 4. Migrate and build

```bash
sudo -u trackfield bash -c 'set -a; source /etc/trackfield/api.env; set +a; cd /opt/trackfield; npm run migrate:server'
cd /opt/trackfield
sudo -u trackfield bash -c 'set -a; source /etc/trackfield/web.env; set +a; cd /opt/trackfield; npm run build:server'
```

`prisma migrate deploy` applies committed migrations without resetting production data.

### 5. Install systemd services

```bash
sudo cp deploy/oracle-linux/trackfield-api.service /etc/systemd/system/
sudo cp deploy/oracle-linux/trackfield-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trackfield-api trackfield-web
sudo systemctl status trackfield-api trackfield-web
```

Logs:

```bash
sudo journalctl -u trackfield-api -u trackfield-web -f
```

### 6. Configure Nginx

Copy the template and replace `YOUR_DOMAIN`:

```bash
sudo cp deploy/oracle-linux/nginx.conf /etc/nginx/conf.d/trackfield.conf
sudo vi /etc/nginx/conf.d/trackfield.conf
sudo setsebool -P httpd_can_network_connect 1
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Open the OS firewall:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

Also allow inbound TCP 80 and 443 in the Oracle Cloud subnet security list or Network Security Group. Do not expose ports 3000 or 5000 publicly.

### 7. HTTPS and verification

Point the domain DNS A record to the server, install a trusted TLS certificate, then verify:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
curl -I https://YOUR_DOMAIN
curl https://YOUR_DOMAIN/api/health
```

Test login, file upload, notifications, and Company Chat. WebSocket support is included in the Nginx template.

### Updating later

```bash
cd /opt/trackfield
sudo -u trackfield git pull --ff-only
sudo -u trackfield npm ci
sudo -u trackfield bash -c 'set -a; source /etc/trackfield/api.env; set +a; cd /opt/trackfield; npm run migrate:server'
sudo -u trackfield bash -c 'set -a; source /etc/trackfield/web.env; set +a; cd /opt/trackfield; npm run build:server'
sudo cp deploy/oracle-linux/trackfield-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart trackfield-api trackfield-web
```

Always load `/etc/trackfield/api.env` for manual migration commands. Running Prisma
without it can migrate a checkout-local SQLite file instead of the production database.

Back up `/var/lib/trackfield/prod.db` and `/var/lib/trackfield/uploads` before each update. SQLite is suitable for one application server and moderate traffic; use PostgreSQL before horizontal scaling or heavy concurrent writes.
