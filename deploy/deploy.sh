#!/bin/bash
# 阿里云服务器一键更新脚本
# 用法：bash deploy.sh   （需要服务器上已 docker login ghcr.io）
set -e
cd "$(dirname "$0")"

echo "==> 拉取最新镜像..."
docker compose -f docker-compose.prod.yml pull app

echo "==> 滚动重启（数据在 /data 卷中，不会丢失）..."
docker compose -f docker-compose.prod.yml up -d

echo "==> 清理旧镜像..."
docker image prune -f

echo "==> 当前状态："
docker compose -f docker-compose.prod.yml ps
echo ""
echo "更新完成。健康检查："
sleep 5
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost/docs || echo "服务可能还在启动中，稍等片刻再访问"
