import { useEffect, useRef, useState } from 'react';
import {
  captureVideoFrame,
  compressImageFile,
  type ProcessedImage,
} from '../../lib/image-utils';

interface CameraCaptureProps {
  taskTitle: string;
  onCapture: (image: ProcessedImage) => void;
  onClose: () => void;
}

export function CameraCapture({ taskTitle, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<ProcessedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);

  // Inicia a câmera ao montar
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      setIsStarting(true);
      setError(null);

      // Verifica suporte no navegador
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setUsingFallback(true);
        setIsStarting(false);
        setError('Câmera ao vivo não suportada neste navegador. Use o modo de envio direto.');
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
          audio: false,
        });

        currentStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('[CameraCapture] Falha ao abrir câmera:', err);
        setUsingFallback(true);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Permissão de câmera negada. Você pode autorizar no navegador ou anexar a foto abaixo.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('Nenhuma câmera encontrada. Utilize o seletor de arquivos.');
        } else {
          setError('Não foi possível iniciar a câmera ao vivo. Use o modo de anexo.');
        }
      } finally {
        setIsStarting(false);
      }
    }

    void startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Para o stream quando fecha
  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    try {
      const processed = await captureVideoFrame(videoRef.current);
      setCapturedImage(processed);
      stopStream();
    } catch (err: any) {
      setError(err.message || 'Erro ao capturar foto');
    }
  };

  const handleRetake = async () => {
    setCapturedImage(null);
    setError(null);
    setIsStarting(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setUsingFallback(true);
    } finally {
      setIsStarting(false);
    }
  };

  const handleConfirm = () => {
    if (capturedImage) {
      stopStream();
      onCapture(capturedImage);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingFile(true);
    setError(null);
    try {
      const processed = await compressImageFile(file);
      setCapturedImage(processed);
      stopStream();
    } catch (err: any) {
      setError(err.message || 'Falha ao processar a foto selecionada.');
    } finally {
      setProcessingFile(false);
    }
  };

  return (
    <div className="camera-modal-overlay">
      <div className="camera-modal-container">
        {/* Barra Superior */}
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <span>Evidência da Tarefa</span>
            <strong>{taskTitle}</strong>
          </div>
          <button
            type="button"
            className="camera-modal-close"
            onClick={() => {
              stopStream();
              onClose();
            }}
          >
            ✕
          </button>
        </div>

        {/* Área Central: Câmera ou Preview */}
        <div className="camera-viewport">
          {capturedImage ? (
            <div className="camera-preview-wrap">
              <img
                src={capturedImage.dataUrl}
                alt="Preview da foto"
                className="camera-preview-img"
              />
              <div className="camera-preview-badge">
                {(capturedImage.sizeBytes / 1024).toFixed(0)} KB (Otimizada)
              </div>
            </div>
          ) : usingFallback ? (
            <div className="camera-fallback-card">
              <div className="camera-fallback-icon">📷</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: 4 }}>
                Tirar ou Anexar Foto
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                {error || 'Clique abaixo para abrir a câmera do seu celular.'}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ padding: '0.9rem', fontSize: '1rem' }}
                disabled={processingFile}
                onClick={() => fileInputRef.current?.click()}
              >
                {processingFile ? 'Otimizando imagem...' : '📸 Abrir Câmera / Galeria'}
              </button>
            </div>
          ) : (
            <div className="camera-video-wrap">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video-element"
              />
              <div className="camera-guide-box" />
              <div className="camera-hint-text">
                Enquadre o local/objeto da tarefa e dispare
              </div>
            </div>
          )}

          {isStarting && !usingFallback && (
            <div className="camera-loading-overlay">
              <div className="spinner" />
              <span>Iniciando câmera...</span>
            </div>
          )}
        </div>

        {/* Barra de Controles Inferior */}
        <div className="camera-modal-controls">
          {capturedImage ? (
            <div className="row" style={{ width: '100%', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1, padding: '0.85rem' }}
                onClick={handleRetake}
              >
                🔄 Tirar de Novo
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1.5, padding: '0.85rem', fontWeight: 700 }}
                onClick={handleConfirm}
              >
                ✓ Usar Esta Foto
              </button>
            </div>
          ) : !usingFallback ? (
            <div className="camera-shutter-bar">
              <button
                type="button"
                className="camera-switch-fallback"
                onClick={() => {
                  stopStream();
                  setUsingFallback(true);
                }}
                title="Usar seletor de arquivos"
              >
                📁 Galeria
              </button>

              <button
                type="button"
                className="camera-shutter-btn"
                onClick={handleCapture}
                disabled={isStarting}
                aria-label="Capturar Foto"
              >
                <div className="camera-shutter-inner" />
              </button>

              <div style={{ width: 48 }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
