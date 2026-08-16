/**
 * Utilitários para captura de frames de vídeo e compressão leve de fotos no navegador.
 * Evita estouro de memória (OOM) no Android e garante uploads rápidos (< 400 KB).
 */

export interface ProcessedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Captura o frame atual de um elemento HTMLVideoElement diretamente para Blob JPEG comprimido.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  maxWidth = 1280,
  quality = 0.8
): Promise<ProcessedImage> {
  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;

  let targetWidth = videoWidth;
  let targetHeight = videoHeight;

  if (targetWidth > maxWidth) {
    const ratio = maxWidth / targetWidth;
    targetWidth = maxWidth;
    targetHeight = Math.round(videoHeight * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível inicializar o contexto 2D do Canvas.');
  }

  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Falha ao processar o frame da câmera.'));
          return;
        }
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          blob,
          dataUrl,
          width: targetWidth,
          height: targetHeight,
          sizeBytes: blob.size,
        });
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Redimensiona e comprime um arquivo de imagem selecionado pelo usuário (Fallback),
 * evitando travamentos de memória com fotos gigantescas de câmeras modernas (50MP+).
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1280,
  quality = 0.8
): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível obter o contexto do Canvas.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao comprimir imagem.'));
            return;
          }
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({
            blob,
            dataUrl,
            width,
            height,
            sizeBytes: blob.size,
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Erro ao carregar a imagem para compressão.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Converte um Blob para Uint8Array para upload direto no Supabase Storage.
 */
export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
