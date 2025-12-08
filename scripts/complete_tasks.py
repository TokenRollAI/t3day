#!/usr/bin/env python3
"""批量完成 Tripo 任务：检查状态、下载模型、上传到 R2"""

import os
import sys
import json
import time
import subprocess
import requests

TRIPO_API_KEY = "tsk_Gj3eSx3hfuzf7q2vfwolTF_TYOj27bf29Gityq8gvvQ"
TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi"
R2_BUCKET = "today-3d-models"
DB_NAME = "today-3d-db"

def get_task_status(task_id):
    """获取 Tripo 任务状态"""
    response = requests.get(
        f"{TRIPO_API_BASE}/task/{task_id}",
        headers={"Authorization": f"Bearer {TRIPO_API_KEY}"}
    )
    return response.json()["data"]

def download_model(url, filepath):
    """下载模型文件"""
    print(f"  Downloading to {filepath}...")
    response = requests.get(url, stream=True)
    with open(filepath, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"  Downloaded: {os.path.getsize(filepath) / 1024 / 1024:.1f} MB")

def upload_to_r2(filepath, r2_key):
    """上传到 R2"""
    print(f"  Uploading to R2: {r2_key}")
    result = subprocess.run([
        "npx", "wrangler", "r2", "object", "put",
        f"{R2_BUCKET}/{r2_key}",
        "--file", filepath,
        "--content-type", "model/gltf-binary",
        "--remote"
    ], capture_output=True, text=True, cwd="/home/djj/code/today-3d")
    if result.returncode != 0:
        print(f"  Upload failed: {result.stderr}")
        return False
    print(f"  Upload complete!")
    return True

def update_database(date, r2_key):
    """更新数据库"""
    print(f"  Updating database for {date}")
    sql = f"UPDATE daily_models SET model_url='{r2_key}', status='completed' WHERE date='{date}'"
    result = subprocess.run([
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--remote", "--command", sql
    ], capture_output=True, text=True, cwd="/home/djj/code/today-3d")
    if result.returncode != 0:
        print(f"  DB update failed: {result.stderr}")
        return False
    print(f"  Database updated!")
    return True

def get_pending_tasks():
    """获取所有 generating 状态的任务"""
    result = subprocess.run([
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--remote", "--command",
        "SELECT date, tripo_task_id FROM daily_models WHERE status IN ('generating', 'failed') ORDER BY date"
    ], capture_output=True, text=True, cwd="/home/djj/code/today-3d")

    # 解析输出
    output = result.stdout
    # 找到 JSON 部分
    start = output.find('[')
    if start == -1:
        return []
    json_str = output[start:]
    data = json.loads(json_str)
    return data[0]["results"]

def main():
    print("=" * 60)
    print("Tripo 任务批量完成脚本")
    print("=" * 60)

    # 获取待处理任务
    tasks = get_pending_tasks()
    print(f"\n找到 {len(tasks)} 个待处理任务:\n")

    for task in tasks:
        print(f"  {task['date']}: {task['tripo_task_id']}")

    print("\n" + "-" * 60)

    # 创建临时目录
    os.makedirs("/tmp/tripo_models", exist_ok=True)

    for task in tasks:
        date = task["date"]
        task_id = task["tripo_task_id"]

        print(f"\n[{date}] 处理任务 {task_id[:8]}...")

        # 检查 Tripo 状态
        status = get_task_status(task_id)
        print(f"  Tripo status: {status['status']}, progress: {status.get('progress', 'N/A')}%")

        if status["status"] == "running" or status["status"] == "queued":
            print(f"  跳过 - 任务仍在进行中")
            continue

        if status["status"] == "failed":
            print(f"  跳过 - Tripo 任务失败")
            continue

        if status["status"] != "success":
            print(f"  跳过 - 未知状态: {status['status']}")
            continue

        # 获取模型 URL
        model_url = status["output"].get("pbr_model") or status["output"].get("model")
        if not model_url:
            print(f"  跳过 - 没有模型 URL")
            continue

        # 下载模型
        filepath = f"/tmp/tripo_models/model_{date}.glb"
        try:
            download_model(model_url, filepath)
        except Exception as e:
            print(f"  下载失败: {e}")
            continue

        # 上传到 R2
        r2_key = f"models/{date}.glb"
        if not upload_to_r2(filepath, r2_key):
            continue

        # 更新数据库
        update_database(date, r2_key)

        # 清理临时文件
        os.remove(filepath)

        print(f"  [完成] {date}")

    print("\n" + "=" * 60)
    print("批量处理完成!")
    print("=" * 60)

if __name__ == "__main__":
    main()
