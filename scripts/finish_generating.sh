#!/bin/bash
cd /home/djj/code/today-3d
TRIPO_API_KEY="tsk_Gj3eSx3hfuzf7q2vfwolTF_TYOj27bf29Gityq8gvvQ"
mkdir -p /tmp/tripo_models

complete_task() {
  local DATE=$1
  local TASK_ID=$2
  echo "[$DATE] 处理任务 $TASK_ID..."

  # 等待任务完成
  while true; do
    STATUS_JSON=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/$TASK_ID" \
      -H "Authorization: Bearer $TRIPO_API_KEY")
    STATUS=$(echo "$STATUS_JSON" | grep -oP '"status":"[^"]+' | head -1 | cut -d'"' -f4)
    PROGRESS=$(echo "$STATUS_JSON" | grep -oP '"progress":[0-9]+' | head -1 | cut -d':' -f2)

    echo "  状态: $STATUS, 进度: ${PROGRESS:-0}%"

    if [[ "$STATUS" == "success" ]]; then
      break
    elif [[ "$STATUS" == "failed" ]]; then
      echo "  任务失败!"
      return 1
    fi
    sleep 15
  done

  # 获取模型 URL
  MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"pbr_model":"[^"]+' | head -1 | cut -d'"' -f4)
  if [[ -z "$MODEL_URL" ]]; then
    MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"model":"[^"]+' | head -1 | cut -d'"' -f4)
  fi

  # 下载
  echo "  下载模型..."
  FILEPATH="/tmp/tripo_models/model_${DATE}.glb"
  curl -s -o "$FILEPATH" "$MODEL_URL"
  SIZE=$(ls -lh "$FILEPATH" 2>/dev/null | awk '{print $5}')
  echo "  下载完成: $SIZE"

  # 上传到 R2
  R2_KEY="models/${DATE}.glb"
  echo "  上传到 R2..."
  npx wrangler r2 object put "today-3d-models/${R2_KEY}" \
    --file "$FILEPATH" \
    --content-type "model/gltf-binary" \
    --remote 2>&1 | grep -E "Creating|Successfully" || echo "  上传完成"

  # 更新数据库
  echo "  更新数据库..."
  npx wrangler d1 execute today-3d-db --remote --command \
    "UPDATE daily_models SET model_url='$R2_KEY', status='completed' WHERE date='$DATE'" 2>/dev/null

  rm -f "$FILEPATH"
  echo "  ✓ $DATE 完成!"
  return 0
}

echo "============================================================"
echo "完成 generating 状态的任务"
echo "============================================================"

# 从数据库获取所有 generating 状态的任务
TASKS=$(npx wrangler d1 execute today-3d-db --remote --command \
  "SELECT date, tripo_task_id FROM daily_models WHERE status='generating'" 2>/dev/null)

# 解析并处理每个任务
echo "$TASKS" | grep -oP '"date":"[^"]+"|"tripo_task_id":"[^"]+"' | paste - - | while read line; do
  DATE=$(echo "$line" | grep -oP '"date":"[^"]+' | cut -d'"' -f4)
  TASK_ID=$(echo "$line" | grep -oP '"tripo_task_id":"[^"]+' | cut -d'"' -f4)
  if [[ -n "$DATE" && -n "$TASK_ID" ]]; then
    complete_task "$DATE" "$TASK_ID"
  fi
done

echo ""
echo "============================================================"
echo "所有任务处理完成!"
echo "============================================================"

# 显示最终状态
echo ""
echo "最终状态:"
npx wrangler d1 execute today-3d-db --remote --command \
  "SELECT date, title, status FROM daily_models WHERE date >= '2025-12-01' ORDER BY date" 2>/dev/null | \
  grep -E '"date"|"title"|"status"'
