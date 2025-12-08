#!/bin/bash
# 批量生成 12 月模型
# 每 10 分钟生成一天，避免 Tripo 限流

cd /home/djj/code/today-3d

TRIPO_API_KEY="tsk_Gj3eSx3hfuzf7q2vfwolTF_TYOj27bf29Gityq8gvvQ"
API_URL="https://today-3d.shuaiqijianhao.workers.dev"
mkdir -p /tmp/tripo_models

# 生成指定日期
generate_date() {
  local DATE=$1
  echo ""
  echo "============================================================"
  echo "[$(date)] 开始生成 $DATE"
  echo "============================================================"

  # 1. 调用 generate API
  echo "1. 调用 generate API..."
  RESPONSE=$(curl -s -X POST "$API_URL/api/generate/$DATE" \
    -H "Authorization: Bearer $TRIPO_API_KEY")

  # 检查是否返回错误
  if echo "$RESPONSE" | grep -q '"error"'; then
    echo "   错误: $RESPONSE"

    # 如果是 429 错误，等待后重试
    if echo "$RESPONSE" | grep -q '429'; then
      echo "   Tripo 限流，等待 5 分钟后重试..."
      sleep 300
      RESPONSE=$(curl -s -X POST "$API_URL/api/generate/$DATE" \
        -H "Authorization: Bearer $TRIPO_API_KEY")
    fi
  fi

  # 提取 task_id
  TASK_ID=$(echo "$RESPONSE" | grep -oP '"tripo_task_id":"[^"]+' | cut -d'"' -f4)

  if [[ -z "$TASK_ID" ]]; then
    # 可能是已完成，检查状态
    if echo "$RESPONSE" | grep -q '"status":"completed"'; then
      echo "   已完成！"
      return 0
    fi
    echo "   无法获取 task_id: $RESPONSE"
    return 1
  fi

  echo "   Task ID: $TASK_ID"

  # 2. 等待 Tripo 完成 (最多等待 10 分钟)
  echo "2. 等待 Tripo 完成..."
  for i in $(seq 1 20); do
    sleep 30
    STATUS_JSON=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/$TASK_ID" \
      -H "Authorization: Bearer $TRIPO_API_KEY")
    STATUS=$(echo "$STATUS_JSON" | grep -oP '"status":"[^"]+' | head -1 | cut -d'"' -f4)
    PROGRESS=$(echo "$STATUS_JSON" | grep -oP '"progress":[0-9]+' | head -1 | cut -d':' -f2)

    echo "   [$i/20] Status: $STATUS, Progress: ${PROGRESS:-N/A}%"

    if [[ "$STATUS" == "success" ]]; then
      break
    fi

    if [[ "$STATUS" == "failed" ]]; then
      echo "   Tripo 任务失败！"
      return 1
    fi
  done

  if [[ "$STATUS" != "success" ]]; then
    echo "   超时，任务仍在进行中"
    return 1
  fi

  # 3. 下载模型
  echo "3. 下载模型..."
  MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"pbr_model":"[^"]+' | head -1 | cut -d'"' -f4)
  if [[ -z "$MODEL_URL" ]]; then
    MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"model":"[^"]+' | head -1 | cut -d'"' -f4)
  fi

  FILEPATH="/tmp/tripo_models/model_${DATE}.glb"
  curl -s -o "$FILEPATH" "$MODEL_URL"
  SIZE=$(ls -lh "$FILEPATH" | awk '{print $5}')
  echo "   下载完成: $SIZE"

  # 4. 上传到 R2
  echo "4. 上传到 R2..."
  R2_KEY="models/${DATE}.glb"
  npx wrangler r2 object put "today-3d-models/${R2_KEY}" \
    --file "$FILEPATH" \
    --content-type "model/gltf-binary" \
    --remote 2>&1 | grep -E "Creating|complete|Successfully"

  # 5. 更新数据库
  echo "5. 更新数据库..."
  npx wrangler d1 execute today-3d-db --remote --command \
    "UPDATE daily_models SET model_url='$R2_KEY', status='completed' WHERE date='$DATE'" 2>/dev/null

  # 清理
  rm -f "$FILEPATH"

  echo "   [完成] $DATE"
  return 0
}

# 主循环：生成 12 月 1-8 日
DATES="2025-12-01 2025-12-02 2025-12-03 2025-12-04 2025-12-05 2025-12-06 2025-12-07 2025-12-08"

echo "开始批量生成 12 月模型..."
echo "日期列表: $DATES"
echo ""

for DATE in $DATES; do
  generate_date "$DATE"

  # 等待 10 分钟再生成下一个（避免 Tripo 限流）
  echo ""
  echo "等待 10 分钟后生成下一个..."
  sleep 600
done

echo ""
echo "============================================================"
echo "批量生成完成！"
echo "============================================================"

# 显示最终状态
echo ""
echo "最终状态:"
npx wrangler d1 execute today-3d-db --remote --command \
  "SELECT date, title, status FROM daily_models WHERE date >= '2025-12-01' ORDER BY date" 2>/dev/null
