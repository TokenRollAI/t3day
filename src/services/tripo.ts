import type { TripoTaskResponse, TripoTaskStatus } from '../types';

const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';

/**
 * 创建图片生成任务 (Advanced Generate Image)
 * 使用 nano banana (gemini_2.5_flash_image_preview) 模型
 */
export async function createImageTask(
  apiKey: string,
  prompt: string
): Promise<string> {
  const response = await fetch(`${TRIPO_API_BASE}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      type: 'generate_image',
      model_version: 'gemini_2.5_flash_image_preview',
      prompt: prompt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tripo Image API error: ${response.status} - ${error}`);
  }

  const data: TripoTaskResponse = await response.json();
  return data.data.task_id;
}

/**
 * 创建图片转模型任务 (Image to Model)
 */
export async function createImageToModelTask(
  apiKey: string,
  imageUrl: string
): Promise<string> {
  const response = await fetch(`${TRIPO_API_BASE}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      type: 'image_to_model',
      file: {
        type: 'png',
        url: imageUrl,
      },
      model_version: 'v3.0-20250812',
      texture: true,
      pbr: true,
      texture_quality: 'detailed',
      geometry_quality: 'detailed',
      orientation: 'align_image',
      face_limit: 9000,
      enable_image_autofix: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tripo Model API error: ${response.status} - ${error}`);
  }

  const data: TripoTaskResponse = await response.json();
  return data.data.task_id;
}

/**
 * 创建 Tripo 3D 模型生成任务 (两步流程)
 * 1. 使用 nano banana 生成图片
 * 2. 使用图片生成 3D 模型
 */
export async function createTripoTask(
  apiKey: string,
  prompt: string
): Promise<{ imageTaskId: string; modelTaskId?: string }> {
  // Step 1: 创建图片生成任务
  console.log('Step 1: Creating image generation task...');
  const imageTaskId = await createImageTask(apiKey, prompt);
  console.log(`Image task created: ${imageTaskId}`);

  return { imageTaskId };
}

/**
 * 继续从图片任务创建模型任务
 */
export async function continueWithModelTask(
  apiKey: string,
  imageUrl: string
): Promise<string> {
  console.log('Step 2: Creating image-to-model task...');
  const modelTaskId = await createImageToModelTask(apiKey, imageUrl);
  console.log(`Model task created: ${modelTaskId}`);
  return modelTaskId;
}

/**
 * 查询任务状态
 */
export async function getTaskStatus(
  apiKey: string,
  taskId: string
): Promise<TripoTaskStatus['data']> {
  const response = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Tripo API error: ${response.status}`);
  }

  const data: TripoTaskStatus = await response.json();
  return data.data;
}

/**
 * 等待图片生成完成并返回图片 URL
 */
export async function waitForImage(
  apiKey: string,
  taskId: string,
  maxAttempts = 20,
  intervalMs = 5000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTaskStatus(apiKey, taskId);

    console.log(`Image task status: ${status.status}, progress: ${status.progress ?? 'N/A'}%`);

    if (status.status === 'success') {
      // 图片任务完成后，output 中有 generated_image 字段
      const imageUrl = (status.output as any)?.generated_image;
      if (imageUrl) {
        return imageUrl;
      }
      throw new Error('Image generation completed but no image URL found');
    }

    if (status.status === 'failed') {
      throw new Error('Image generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Image generation timeout');
}

/**
 * 等待模型生成完成并返回模型 URL
 */
export async function waitForModel(
  apiKey: string,
  taskId: string,
  maxAttempts = 40,
  intervalMs = 30000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTaskStatus(apiKey, taskId);

    console.log(`Model task status: ${status.status}, progress: ${status.progress ?? 'N/A'}%`);

    if (status.status === 'success') {
      const modelUrl = status.output?.pbr_model || status.output?.model;
      if (modelUrl) {
        return modelUrl;
      }
    }

    if (status.status === 'failed') {
      throw new Error('Model generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Model generation timeout');
}

/**
 * 完整的两步生成流程
 * 返回 { imageTaskId, modelTaskId } 用于后续恢复
 */
export async function createFullTripoTask(
  apiKey: string,
  prompt: string
): Promise<{ imageTaskId: string; imageUrl?: string; modelTaskId?: string }> {
  // Step 1: 创建并等待图片生成
  const imageTaskId = await createImageTask(apiKey, prompt);
  console.log(`Image task created: ${imageTaskId}`);

  // 等待图片完成
  const imageUrl = await waitForImage(apiKey, imageTaskId);
  console.log(`Image generated: ${imageUrl}`);

  // Step 2: 创建模型生成任务
  const modelTaskId = await createImageToModelTask(apiKey, imageUrl);
  console.log(`Model task created: ${modelTaskId}`);

  return { imageTaskId, imageUrl, modelTaskId };
}

/**
 * 下载 GLB 模型文件
 */
export async function downloadModel(modelUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.status}`);
  }
  return response.arrayBuffer();
}
