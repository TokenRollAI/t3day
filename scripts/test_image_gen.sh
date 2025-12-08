#!/bin/bash
# 测试 Tripo 图片生成 API (nano banana)

cd /home/djj/code/today-3d

# 从 .dev.vars 读取 API Key
if [ -f .dev.vars ]; then
  export $(grep -v '^#' .dev.vars | xargs)
fi

if [ -z "$TRIPO_API_KEY" ]; then
  echo "❌ TRIPO_API_KEY 未设置"
  exit 1
fi

PROMPT="A vintage desk fan melting onto a wooden table surface, drooping plastic blades, soft warping plastic texture, pastel colors, claymation style, minimal background, soft studio lighting, cute but sad atmosphere, 3d render"

echo "=== Step 1: 创建图片生成任务 ==="
echo "Prompt: $PROMPT"
echo ""

RESPONSE=$(curl -s -X POST 'https://api.tripo3d.ai/v2/openapi/task' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TRIPO_API_KEY}" \
  -d "{
    \"type\": \"generate_image\",
    \"model_version\": \"gemini_2.5_flash_image_preview\",
    \"prompt\": \"$PROMPT\"
  }")

echo "响应:"
echo "$RESPONSE" | jq .

TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id')

if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
  echo "❌ 创建任务失败"
  exit 1
fi

echo ""
echo "✓ 任务创建成功: $TASK_ID"
echo ""

echo "=== Step 2: 轮询任务状态 ==="
for i in {1..30}; do
  echo "[$i] 检查状态..."

  STATUS_RESPONSE=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/${TASK_ID}" \
    -H "Authorization: Bearer ${TRIPO_API_KEY}")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')
  PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress // "N/A"')

  echo "    状态: $STATUS, 进度: $PROGRESS%"

  if [ "$STATUS" == "success" ]; then
    echo ""
    echo "✓ 图片生成成功!"
    echo ""
    echo "完整响应:"
    echo "$STATUS_RESPONSE" | jq .

    IMAGE_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.output.image // .data.output.rendered_image // empty')
    if [ -n "$IMAGE_URL" ]; then
      echo ""
      echo "图片 URL: $IMAGE_URL"
      echo ""
      echo "=== 保存任务信息 ==="
      echo "{\"taskId\": \"$TASK_ID\", \"imageUrl\": \"$IMAGE_URL\"}" > /tmp/tripo_image_task.json
      echo "已保存到 /tmp/tripo_image_task.json"
    else
      echo ""
      echo "⚠️ 未找到图片 URL，完整 output:"
      echo "$STATUS_RESPONSE" | jq '.data.output'
    fi
    exit 0
  fi

  if [ "$STATUS" == "failed" ]; then
    echo ""
    echo "❌ 图片生成失败"
    echo "$STATUS_RESPONSE" | jq .
    exit 1
  fi

  sleep 3
done

echo "❌ 超时"
exit 1
