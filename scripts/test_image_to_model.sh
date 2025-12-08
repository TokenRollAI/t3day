#!/bin/bash
# 测试 Tripo 图片转模型 API

cd /home/djj/code/today-3d

# 从 .dev.vars 读取 API Key
if [ -f .dev.vars ]; then
  export $(grep -v '^#' .dev.vars | xargs)
fi

if [ -z "$TRIPO_API_KEY" ]; then
  echo "❌ TRIPO_API_KEY 未设置"
  exit 1
fi

# 使用刚才生成的图片 URL
IMAGE_URL="https://tripo-data.rg1.data.tripo3d.com/tripo-studio/20251208/3932c4d6-8d96-48c0-b2f5-af5ff799a31b/image.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly90cmlwby1kYXRhLnJnMS5kYXRhLnRyaXBvM2QuY29tL3RyaXBvLXN0dWRpby8yMDI1MTIwOC8zOTMyYzRkNi04ZDk2LTQ4YzAtYjJmNS1hZjVmZjc5OWEzMWIvaW1hZ2UucG5nIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzY1MjM4NDAwfX19XX0_&Signature=B44MfViURqB0o2k7fBgW6stD1TfKQ~VytRyS-ozOpTjGmNrOxZCp0tflLJnhIB-C2NSQ-40vEo~Yuv7MiT89EJ3tr36ytz4UqRCZrYchPmoHEher4JkATeJxoeutXXn0vIFaaY3zr-HuVdDc7AAOJ36SToNl2h8e9g2cKFwgKrpsuGPbeWWZNdMBWsDnBfTIYOZQlGmmZ24U1~1O5JSdwruy~x7GUKzjjtAN6jsOP-5xl-diTUb3qPyRQLgbDbIaoVgV1y6PwIwPJlUw97FbeMjf1195xPADC1I7DYbPOMA5V0jHG16fAF-jQn0HWqHL6uoSk~gRVHNCDobCQ64-rg__&Key-Pair-Id=K1676C64NMVM2J"

echo "=== Step 1: 创建图片转模型任务 ==="
echo "Image URL: ${IMAGE_URL:0:100}..."
echo ""

# 构建 JSON payload，需要转义 URL
PAYLOAD=$(cat <<EOF
{
  "type": "image_to_model",
  "file": {
    "type": "png",
    "url": "$IMAGE_URL"
  },
  "model_version": "v3.0-20250812",
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "geometry_quality": "detailed",
  "orientation": "align_image",
  "face_limit": 9000,
  "enable_image_autofix": true
}
EOF
)

RESPONSE=$(curl -s -X POST 'https://api.tripo3d.ai/v2/openapi/task' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TRIPO_API_KEY}" \
  -d "$PAYLOAD")

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

echo "=== Step 2: 轮询任务状态 (模型生成较慢，约2-5分钟) ==="
for i in {1..60}; do
  echo "[$i] 检查状态..."

  STATUS_RESPONSE=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/${TASK_ID}" \
    -H "Authorization: Bearer ${TRIPO_API_KEY}")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')
  PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress // "N/A"')

  echo "    状态: $STATUS, 进度: $PROGRESS%"

  if [ "$STATUS" == "success" ]; then
    echo ""
    echo "✓ 模型生成成功!"
    echo ""
    echo "完整响应:"
    echo "$STATUS_RESPONSE" | jq .

    MODEL_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.output.pbr_model // .data.output.model // empty')
    if [ -n "$MODEL_URL" ]; then
      echo ""
      echo "模型 URL: ${MODEL_URL:0:100}..."
    fi
    exit 0
  fi

  if [ "$STATUS" == "failed" ]; then
    echo ""
    echo "❌ 模型生成失败"
    echo "$STATUS_RESPONSE" | jq .
    exit 1
  fi

  sleep 10
done

echo "❌ 超时 (10 分钟)"
echo "Task ID: $TASK_ID"
echo "可以稍后用以下命令检查状态:"
echo "curl -s 'https://api.tripo3d.ai/v2/openapi/task/${TASK_ID}' -H 'Authorization: Bearer \$TRIPO_API_KEY' | jq ."
exit 1
