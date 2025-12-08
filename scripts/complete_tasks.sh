#!/bin/bash
# 批量完成 Tripo 任务

TRIPO_API_KEY="tsk_Gj3eSx3hfuzf7q2vfwolTF_TYOj27bf29Gityq8gvvQ"
R2_BUCKET="today-3d-models"
DB_NAME="today-3d-db"
WORK_DIR="/home/djj/code/today-3d"

cd "$WORK_DIR"

echo "============================================================"
echo "Tripo 任务批量完成脚本"
echo "============================================================"

# 获取待处理任务
echo ""
echo "获取待处理任务..."
TASKS=$(npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT date, tripo_task_id FROM daily_models WHERE status IN ('generating', 'failed') ORDER BY date" 2>/dev/null | \
  grep -oP '"date":"[^"]+"|"tripo_task_id":"[^"]+"')

# 解析任务
declare -a DATES
declare -a TASK_IDS

while IFS= read -r line; do
  if [[ $line == *"date"* ]]; then
    DATE=$(echo $line | grep -oP '(?<="date":")[^"]+')
    DATES+=("$DATE")
  elif [[ $line == *"tripo_task_id"* ]]; then
    TASK_ID=$(echo $line | grep -oP '(?<="tripo_task_id":")[^"]+')
    TASK_IDS+=("$TASK_ID")
  fi
done <<< "$TASKS"

echo "找到 ${#DATES[@]} 个待处理任务:"
for i in "${!DATES[@]}"; do
  echo "  ${DATES[$i]}: ${TASK_IDS[$i]}"
done

echo ""
echo "------------------------------------------------------------"

mkdir -p /tmp/tripo_models

for i in "${!DATES[@]}"; do
  DATE="${DATES[$i]}"
  TASK_ID="${TASK_IDS[$i]}"

  echo ""
  echo "[$DATE] 处理任务 ${TASK_ID:0:8}..."

  # 检查 Tripo 状态
  STATUS_JSON=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/$TASK_ID" \
    -H "Authorization: Bearer $TRIPO_API_KEY")

  STATUS=$(echo "$STATUS_JSON" | grep -oP '(?<="status":")[^"]+' | head -1)
  PROGRESS=$(echo "$STATUS_JSON" | grep -oP '(?<="progress":)[0-9]+' | head -1)

  echo "  Tripo status: $STATUS, progress: ${PROGRESS:-N/A}%"

  if [[ "$STATUS" == "running" || "$STATUS" == "queued" ]]; then
    echo "  跳过 - 任务仍在进行中"
    continue
  fi

  if [[ "$STATUS" == "failed" ]]; then
    echo "  跳过 - Tripo 任务失败"
    continue
  fi

  if [[ "$STATUS" != "success" ]]; then
    echo "  跳过 - 未知状态: $STATUS"
    continue
  fi

  # 获取模型 URL (优先 pbr_model)
  MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '(?<="pbr_model":")[^"]+' | head -1)
  if [[ -z "$MODEL_URL" ]]; then
    MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '(?<="model":")[^"]+' | head -1)
  fi

  if [[ -z "$MODEL_URL" ]]; then
    echo "  跳过 - 没有模型 URL"
    continue
  fi

  # 下载模型
  FILEPATH="/tmp/tripo_models/model_${DATE}.glb"
  echo "  下载模型..."
  curl -s -o "$FILEPATH" "$MODEL_URL"
  SIZE=$(du -h "$FILEPATH" | cut -f1)
  echo "  下载完成: $SIZE"

  # 上传到 R2
  R2_KEY="models/${DATE}.glb"
  echo "  上传到 R2: $R2_KEY"
  npx wrangler r2 object put "${R2_BUCKET}/${R2_KEY}" \
    --file "$FILEPATH" \
    --content-type "model/gltf-binary" \
    --remote 2>/dev/null

  if [[ $? -ne 0 ]]; then
    echo "  上传失败，跳过"
    continue
  fi
  echo "  上传完成!"

  # 更新数据库
  echo "  更新数据库..."
  npx wrangler d1 execute "$DB_NAME" --remote --command \
    "UPDATE daily_models SET model_url='$R2_KEY', status='completed' WHERE date='$DATE'" 2>/dev/null

  echo "  [完成] $DATE"

  # 清理
  rm -f "$FILEPATH"
done

echo ""
echo "============================================================"
echo "批量处理完成!"
echo "============================================================"

# 显示最终状态
echo ""
echo "最终状态:"
npx wrangler d1 execute "$DB_NAME" --remote --command \
  "SELECT date, title, status FROM daily_models ORDER BY date" 2>/dev/null | grep -E '"date"|"title"|"status"'
