#!/bin/bash
# 批量生成 12 月 1-8 日的模型
# 每次生成一天，等待完成后再生成下一天

cd /home/djj/code/today-3d
TRIPO_API_KEY="tsk_Gj3eSx3hfuzf7q2vfwolTF_TYOj27bf29Gityq8gvvQ"
API_URL="https://today-3d.shuaiqijianhao.workers.dev"
mkdir -p /tmp/tripo_models

# 处理单个日期
process_date() {
  local DATE=$1
  echo ""
  echo "============================================================"
  echo "[$(date '+%H:%M:%S')] 开始处理 $DATE"
  echo "============================================================"

  # 1. 检查数据库状态
  DB_STATUS=$(npx wrangler d1 execute today-3d-db --remote --command \
    "SELECT status, tripo_task_id FROM daily_models WHERE date='$DATE'" 2>/dev/null | \
    grep -oP '"status":"[^"]+' | cut -d'"' -f4)

  if [[ "$DB_STATUS" == "completed" ]]; then
    echo "   ✓ 已完成，跳过"
    return 0
  fi

  # 2. 如果没有记录，调用 generate API
  TASK_ID=$(npx wrangler d1 execute today-3d-db --remote --command \
    "SELECT tripo_task_id FROM daily_models WHERE date='$DATE'" 2>/dev/null | \
    grep -oP '"tripo_task_id":"[^"]+' | cut -d'"' -f4)

  if [[ -z "$TASK_ID" || "$TASK_ID" == "null" ]]; then
    echo "   调用 generate API..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/generate/$DATE" \
      -H "Authorization: Bearer $TRIPO_API_KEY" \
      --max-time 60)

    if echo "$RESPONSE" | grep -q '"error"'; then
      echo "   错误: $RESPONSE"
      return 1
    fi

    # 获取新的 task_id
    TASK_ID=$(npx wrangler d1 execute today-3d-db --remote --command \
      "SELECT tripo_task_id FROM daily_models WHERE date='$DATE'" 2>/dev/null | \
      grep -oP '"tripo_task_id":"[^"]+' | cut -d'"' -f4)

    if [[ -z "$TASK_ID" ]]; then
      echo "   无法获取 task_id"
      return 1
    fi
  fi

  echo "   Task ID: ${TASK_ID:0:16}..."

  # 3. 等待 Tripo 完成
  echo "   等待 Tripo 完成..."
  for i in $(seq 1 30); do
    sleep 10
    STATUS_JSON=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/$TASK_ID" \
      -H "Authorization: Bearer $TRIPO_API_KEY")
    STATUS=$(echo "$STATUS_JSON" | grep -oP '"status":"[^"]+' | head -1 | cut -d'"' -f4)
    PROGRESS=$(echo "$STATUS_JSON" | grep -oP '"progress":[0-9]+' | head -1 | cut -d':' -f2)

    printf "   [%02d/30] Status: %-10s Progress: %s%%\r" "$i" "$STATUS" "${PROGRESS:-0}"

    if [[ "$STATUS" == "success" ]]; then
      echo ""
      break
    fi

    if [[ "$STATUS" == "failed" ]]; then
      echo ""
      echo "   Tripo 任务失败！"
      return 1
    fi
  done

  if [[ "$STATUS" != "success" ]]; then
    echo ""
    echo "   超时"
    return 1
  fi

  # 4. 下载模型
  MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"pbr_model":"[^"]+' | head -1 | cut -d'"' -f4)
  if [[ -z "$MODEL_URL" ]]; then
    MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"model":"[^"]+' | head -1 | cut -d'"' -f4)
  fi

  echo "   下载模型..."
  FILEPATH="/tmp/tripo_models/model_${DATE}.glb"
  curl -s -o "$FILEPATH" "$MODEL_URL"
  SIZE=$(ls -lh "$FILEPATH" 2>/dev/null | awk '{print $5}')
  echo "   下载完成: $SIZE"

  # 5. 上传到 R2
  R2_KEY="models/${DATE}.glb"
  echo "   上传到 R2..."
  npx wrangler r2 object put "today-3d-models/${R2_KEY}" \
    --file "$FILEPATH" \
    --content-type "model/gltf-binary" \
    --remote 2>&1 | grep -E "Creating|Successfully" || echo "   (上传完成)"

  # 6. 更新数据库
  echo "   更新数据库..."
  npx wrangler d1 execute today-3d-db --remote --command \
    "UPDATE daily_models SET model_url='$R2_KEY', status='completed' WHERE date='$DATE'" 2>/dev/null

  # 清理
  rm -f "$FILEPATH"

  echo "   ✓ $DATE 完成!"
  return 0
}

# 主循环
echo "============================================================"
echo "开始批量生成 12 月模型 (12-01 到 12-08)"
echo "============================================================"

for day in 01 02 03 04 05 06 07 08; do
  DATE="2025-12-$day"
  process_date "$DATE"

  # 如果成功完成，等待 30 秒再生成下一个（避免 Tripo 限流）
  if [[ $? -eq 0 && "$day" != "08" ]]; then
    echo ""
    echo "等待 30 秒后处理下一个..."
    sleep 30
  fi
done

echo ""
echo "============================================================"
echo "批量生成完成!"
echo "============================================================"

# 显示最终状态
echo ""
echo "最终状态:"
npx wrangler d1 execute today-3d-db --remote --command \
  "SELECT date, title, status FROM daily_models WHERE date >= '2025-12-01' ORDER BY date" 2>/dev/null | \
  grep -E '"date"|"title"|"status"'
