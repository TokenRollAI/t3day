#!/bin/bash
cd /home/djj/code/today-3d
mkdir -p downloaded_models
TRIPO_API_KEY="tsk_Gj3eSx3hfuzf7q2vfwolTF_TYOj27bf29Gityq8gvvQ"

download_model() {
  local DATE=$1
  local TASK_ID=$2

  echo "[$DATE] 获取模型 URL..."

  STATUS_JSON=$(curl -s "https://api.tripo3d.ai/v2/openapi/task/$TASK_ID" \
    -H "Authorization: Bearer $TRIPO_API_KEY")

  STATUS=$(echo "$STATUS_JSON" | grep -oP '"status":"[^"]+' | head -1 | cut -d'"' -f4)

  if [ "$STATUS" != "success" ]; then
    echo "  状态: $STATUS (跳过)"
    return
  fi

  MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"pbr_model":"[^"]+' | head -1 | cut -d'"' -f4)
  if [ -z "$MODEL_URL" ]; then
    MODEL_URL=$(echo "$STATUS_JSON" | grep -oP '"model":"[^"]+' | head -1 | cut -d'"' -f4)
  fi

  if [ -z "$MODEL_URL" ]; then
    echo "  没有模型 URL"
    return
  fi

  echo "  下载中..."
  curl -s -o "downloaded_models/${DATE}.glb" "$MODEL_URL"
  SIZE=$(ls -lh "downloaded_models/${DATE}.glb" 2>/dev/null | awk '{print $5}')
  echo "  ✓ 完成: ${DATE}.glb ($SIZE)"
}

# 下载所有模型
download_model "2025-12-02" "9c9ba540-c7cb-43b9-8faa-1f8a0376083b"
download_model "2025-12-03" "bbd37201-17bd-47b3-a0b9-6d5359b2221c"
download_model "2025-12-04" "e0ad481d-2db0-4751-83be-9f0e128fc6cc"
download_model "2025-12-05" "7d1909fc-3831-4713-a154-1c6d87b447a6"
download_model "2025-12-06" "0ef338f0-ac02-4017-953e-5c11fb7f1003"
download_model "2025-12-07" "e111c763-c71c-4b65-9c89-127df15b3f7f"
download_model "2025-12-08" "5ed63881-e113-48b5-ab34-0abd4b96ad39"

echo ""
echo "下载完成！模型保存在: /home/djj/code/today-3d/downloaded_models/"
ls -la downloaded_models/
