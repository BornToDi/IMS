# Deploy Guide

## Oracle Linux server

This is the recommended single-server layout:

- Nginx: public ports 80/443
- Next.js: `127.0.0.1:3000`
- Express and Socket.IO: `127.0.0.1:5000`
- SQLite and uploads: `/var/lib/netfield`
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
sudo useradd --system --create-home --shell /bin/bash netfield
sudo mkdir -p /opt/netfield /var/lib/netfield/uploads /etc/netfield
sudo chown -R netfield:netfield /opt/netfield /var/lib/netfield
sudo chmod 750 /etc/netfield
```

Clone the repository:

```bash
sudo -u netfield git clone https://github.com/BornToDi/IMS.git /opt/netfield
cd /opt/netfield
sudo -u netfield npm ci
```

Keep uploaded files outside the Git checkout:

```bash
sudo -u netfield ln -sfn /var/lib/netfield/uploads /opt/netfield/apps/api/uploads
```

### 3. Configure production environment

```bash
sudo cp deploy/oracle-linux/api.env.example /etc/netfield/api.env
sudo cp deploy/oracle-linux/web.env.example /etc/netfield/web.env
sudo chmod 640 /etc/netfield/api.env /etc/netfield/web.env
sudo chown root:netfield /etc/netfield/api.env /etc/netfield/web.env
```

Edit `/etc/netfield/api.env`. Replace `YOUR_DOMAIN` and generate two different secrets:

```bash
openssl rand -hex 64
```

An IP-only HTTP check can confirm that the page responds, but authenticated sessions require the final HTTPS domain because production refresh cookies are secure.

### 4. Migrate and build

```bash
sudo -u netfield bash -c 'set -a; source /etc/netfield/api.env; set +a; cd /opt/netfield; npm run migrate:server'
cd /opt/netfield
sudo -u netfield npm run build:server
```

`prisma migrate deploy` applies committed migrations without resetting production data.

### 5. Install systemd services

```bash
sudo cp deploy/oracle-linux/netfield-api.service /etc/systemd/system/
sudo cp deploy/oracle-linux/netfield-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now netfield-api netfield-web
sudo systemctl status netfield-api netfield-web
```

Logs:

```bash
sudo journalctl -u netfield-api -u netfield-web -f
```

### 6. Configure Nginx

Copy the template and replace `YOUR_DOMAIN`:

```bash
sudo cp deploy/oracle-linux/nginx.conf /etc/nginx/conf.d/netfield.conf
sudo vi /etc/nginx/conf.d/netfield.conf
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
cd /opt/netfield
sudo -u netfield git pull --ff-only
sudo -u netfield npm ci
sudo -u netfield bash -c 'set -a; source /etc/netfield/api.env; set +a; cd /opt/netfield; npm run migrate:server'
sudo -u netfield npm run build:server
sudo systemctl restart netfield-api netfield-web
```

Back up `/var/lib/netfield/prod.db` and `/var/lib/netfield/uploads` before each update. SQLite is suitable for one application server and moderate traffic; use PostgreSQL before horizontal scaling or heavy concurrent writes.
