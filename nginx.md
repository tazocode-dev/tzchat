# TZChat Nginx 운영 기준본
#
# 이 파일은 운영 서버의 아래 파일에 설치하는 저장소 기준본이다.
#   /etc/nginx/sites-available/tzchat.conf
#
# 주의:
# - tzchatback/nginx/nginx는 오래된 설정이므로 복사하거나 활성화하지 않는다.
# - 실제 배포본은 이 파일 하나만 기준으로 관리한다.
# - 아래 운영 명령은 모두 주석이며 Nginx 설정 블록과 분리되어 있다.
# - 인증서, 활성화 링크, 중복 virtual host를 확인하기 전에는 reload하지 않는다.
#
# -----------------------------------------------------------------------------
# 1. 배포 전 확인 및 인증서 준비(운영 서버에서 수동 실행)
# -----------------------------------------------------------------------------
#
# DNS가 이 서버의 공개 IP를 가리키는지 먼저 확인한다.
#   dig +short A tzchat.tazocode.com
#   dig +short AAAA tzchat.tazocode.com
#
# 현재 활성 설정에서 같은 server_name을 선언한 파일을 모두 확인한다.
# HTTP와 HTTPS를 담당하는 이 tzchat.conf 안의 2개 선언만 남아야 하며,
# sites-enabled의 다른 파일이나 conf.d에 같은 이름이 있으면 해당 설정을 검토 후 비활성화한다.
#   sudo grep -Rns "server_name[[:space:]].*tzchat\.tazocode\.com" /etc/nginx/sites-enabled /etc/nginx/conf.d
#   sudo nginx -T 2>&1 | grep -n -B 4 -A 14 "server_name tzchat.tazocode.com"
#   sudo nginx -T 2>&1 | grep -n "default_server"
#   ls -l /etc/nginx/sites-enabled/
#
# 인증서 파일 자체가 tzchat.tazocode.com SAN을 포함하는지 확인한다.
#   sudo openssl x509 -in /etc/letsencrypt/live/tzchat.tazocode.com/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
#
# 인증서가 없거나 SAN이 잘못된 경우 DNS와 80/tcp 접근을 확인한 후 올바른 이름으로 발급한다.
# 현재 Nginx 설정이 먼저 nginx -t를 통과해야 하며, 인증서가 아예 없는 최초 발급이면
# 80 포트의 tzchat.tazocode.com HTTP vhost만 임시 활성화한 상태에서 발급한 뒤 이 전체 기준본을 설치한다.
#   sudo certbot certonly --nginx --cert-name tzchat.tazocode.com -d tzchat.tazocode.com
#
# Certbot이 기존의 잘못된 동일 이름 인증서를 재사용할 때만 SAN을 재확인한 뒤 재발급한다.
#   sudo certbot certonly --nginx --cert-name tzchat.tazocode.com -d tzchat.tazocode.com --force-renewal
#
# 저장소 기준본을 설치하고 sites-enabled에 정확한 링크 하나만 활성화한다.
# 기존 링크가 있으면 먼저 readlink 결과가 아래 sites-available 파일인지 확인한다.
#   sudo install -m 0644 /home/tazofarm/project/tzchat/nginx.md /etc/nginx/sites-available/tzchat.conf
#   readlink -f /etc/nginx/sites-enabled/tzchat.conf
#   sudo ln -s /etc/nginx/sites-available/tzchat.conf /etc/nginx/sites-enabled/tzchat.conf
#
# 같은 server_name을 가진 다른 활성 파일과 TZChat을 가로채는 잘못된 기본 vhost를 정리한 뒤 적용한다.
# 비활성화 대상은 위 grep과 nginx -T 결과로 정확한 링크를 확인하여 개별 unlink한다.
#   sudo nginx -t
#   sudo systemctl reload nginx
#
# reload 후 실제 SNI로 제공되는 인증서도 SAN과 만료일을 다시 확인한다.
#   openssl s_client -connect tzchat.tazocode.com:443 -servername tzchat.tazocode.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
#
# -----------------------------------------------------------------------------
# 2. 배포 후 외부 검증(운영 서버 또는 외부 PC에서 수동 실행)
# -----------------------------------------------------------------------------
#
# 웹 루트: HTTP 200, text/html, 본문의 <title>TZChat</title>을 확인한다.
#   curl --fail --show-error --silent --dump-header - https://tzchat.tazocode.com/ --output /tmp/tzchat-index.html
#   grep -F "<title>TZChat</title>" /tmp/tzchat-index.html
#
# API: HTTP 200, application/json, JSON의 ok 값이 true인지 확인한다.
# TAZOCODE HTML이나 SPA index.html이 나오면 /api/ 프록시 또는 vhost 선택이 잘못된 것이다.
#   curl --fail --show-error --silent --dump-header - https://tzchat.tazocode.com/api/health
#
# Socket.IO polling: HTTP 200이며 본문이 Engine.IO open packet인 0{ 로 시작하는지 확인한다.
# HTML이 나오면 /socket.io/ 프록시 또는 vhost 선택이 잘못된 것이다.
#   curl --fail --show-error --silent --dump-header - "https://tzchat.tazocode.com/socket.io/?EIO=4&transport=polling"
#
# 인증서 호스트 이름 검증까지 포함한 간단한 최종 확인이다. -k/--insecure는 사용하지 않는다.
#   curl --fail --show-error --silent --output /dev/null --write-out "web=%{http_code} type=%{content_type}\n" https://tzchat.tazocode.com/
#   curl --fail --show-error --silent --output /dev/null --write-out "api=%{http_code} type=%{content_type}\n" https://tzchat.tazocode.com/api/health
#   curl --fail --show-error --silent --output /dev/null --write-out "socket=%{http_code} type=%{content_type}\n" "https://tzchat.tazocode.com/socket.io/?EIO=4&transport=polling"

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name tzchat.tazocode.com;

    ssl_certificate /etc/letsencrypt/live/tzchat.tazocode.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tzchat.tazocode.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /home/tazofarm/project/tzchat/tzchatapp/dist;
    index index.html;

    client_max_body_size 20m;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:11018;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Origin $http_origin;

        add_header Cache-Control "no-store";
    }

    location ^~ /socket.io/ {
        proxy_pass http://127.0.0.1:11018;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 60s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Origin $http_origin;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /uploads/ {
        alias /home/tazofarm/project/tzchat/tzchatback/uploads/;
        autoindex off;
        limit_except GET HEAD {
            deny all;
        }
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location = /firebase-messaging-sw.js {
        try_files $uri =404;
        add_header Cache-Control "no-store";
    }

    location = /index.html {
        try_files $uri =404;
        add_header Cache-Control "no-cache";
        add_header Content-Security-Policy "default-src 'self' capacitor:; connect-src 'self' https: wss: capacitor: data: blob:; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; font-src 'self' https: data:; style-src 'self' 'unsafe-inline' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; frame-src 'self' https: data:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self';" always;
    }

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name tzchat.tazocode.com;

    return 301 https://$host$request_uri;
}
