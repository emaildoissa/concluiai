import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { analyzeEvidence } from '../../src/lib/api';
import type { AnalyzeResult } from '../../src/lib/types';

type Phase = 'ready' | 'captured' | 'uploading' | 'analyzing' | 'done';

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function friendlyError(e: unknown): string {
  const msg = (e as Error)?.message ?? '';
  if (/network request failed|failed to fetch|couldn't connect|timeout/i.test(msg)) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (/sessão|session|jwt|expired/i.test(msg)) {
    return 'Sua sessão expirou. Saia e faça login novamente.';
  }
  if (/upload|storage|bucket/i.test(msg)) {
    return 'Falha ao enviar a foto. Tente novamente.';
  }
  return msg || 'Falha ao enviar. Tente novamente.';
}

export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, session } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [verdict, setVerdict] = useState<AnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gpsCaptured, setGpsCaptured] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== 'analyzing') {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  async function capture() {
    if (!cameraRef.current) return;
    setErrorMsg(null);
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    setPhotoUri(photo.uri);
    setPhase('captured');
  }

  async function getGps() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy ?? null,
      };
    } catch {
      return null;
    }
  }

  async function submit() {
    if (!photoUri || !profile || !session) return;
    setPhase('uploading');
    setErrorMsg(null);

    try {
      const gps = await getGps();
      setGpsCaptured(!!gps);

      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToUint8Array(base64);
      const path = `${profile.company_id}/${profile.unit_id}/${id}/ev-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('evidences')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;

      const { data: evidence, error: insertError } = await supabase
        .from('evidences')
        .insert({
          task_instance_id: id,
          operator_id: profile.id,
          photo_url: path,
          latitude: gps?.latitude ?? null,
          longitude: gps?.longitude ?? null,
          accuracy_m: gps?.accuracy_m ?? null,
          review_status: 'pending',
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      await supabase
        .from('task_instances')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);

      setPhase('analyzing');

      let result: AnalyzeResult | null = null;
      try {
        result = await analyzeEvidence(evidence.id);
      } catch (e) {
        console.warn('[camera] análise indisponível (evidência já registrada):', e);
      }

      setVerdict(result);
      setPhase('done');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(friendlyError(e));
      setPhase('captured');
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Precisamos da sua câmera para fotografar a evidência da tarefa.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Permitir câmera</Text>
        </Pressable>
      </View>
    );
  }

  // ---------- Resultado da IA ----------
  if (phase === 'done' && verdict) {
    const approved = verdict.approved;
    return (
      <View style={[styles.center, { backgroundColor: approved ? '#f0fdf4' : '#fef2f2' }]}>
        <Text style={[styles.verdictTitle, { color: approved ? '#16a34a' : '#dc2626' }]}>
          {approved ? 'Foto aprovada!' : 'Foto recusada'}
        </Text>
        <Text style={styles.verdictReason}>{verdict.reason}</Text>
        <Text style={styles.verdictConfidence}>
          Confiança da IA: {Math.round((verdict.confidence ?? 0) * 100)}%
        </Text>
        {!gpsCaptured ? (
          <Text style={styles.gpsWarning}>
            Atenção: a localização (GPS) não foi capturada nesta foto.
          </Text>
        ) : null}
        {!approved ? (
          <Pressable
            style={({ pressed }) => [styles.button, styles.buttonRetake, pressed && styles.buttonPressed]}
            onPress={() => {
              setVerdict(null);
              setPhotoUri(null);
              setPhase('ready');
            }}
          >
            <Text style={[styles.buttonText, styles.buttonRetakeText]}>Tirar de novo</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  // ---------- Enviada com sucesso (análise pendente/indisponível) ----------
  if (phase === 'done' && !verdict) {
    return (
      <View style={[styles.center, { backgroundColor: '#f0fdf4' }]}>
        <Text style={[styles.verdictTitle, { color: '#16a34a' }]}>Foto enviada!</Text>
        <Text style={styles.verdictReason}>
          A evidência foi registrada. A conferência da IA será processada em instantes — veja o
          resultado no Histórico.
        </Text>
        {!gpsCaptured ? (
          <Text style={styles.gpsWarning}>
            Atenção: a localização (GPS) não foi capturada nesta foto.
          </Text>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  // ---------- Enviando / analisando ----------
  if (phase === 'uploading' || phase === 'analyzing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.progressText}>
          {phase === 'uploading' ? 'Enviando foto...' : `IA analisando a foto... ${elapsed}s`}
        </Text>
      </View>
    );
  }

  // ---------- Preview da captura ----------
  if (phase === 'captured' && photoUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        <View style={[styles.actionsRow, { paddingBottom: 20 + insets.bottom }]}>
          <Pressable
            style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && styles.buttonPressed]}
            onPress={() => {
              setPhotoUri(null);
              setPhase('ready');
            }}
          >
            <Text style={[styles.buttonText, styles.buttonGhostText]}>Refazer</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={submit}
          >
            <Text style={styles.buttonText}>Enviar foto</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---------- Câmera ao vivo ----------
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onMountError={() => setErrorMsg('Não foi possível abrir a câmera deste aparelho.')}
      />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.closeText}>Cancelar</Text>
        </Pressable>
      </View>
      {errorMsg ? (
        <View style={styles.errorBanner}>
          <Text style={styles.error}>{errorMsg}</Text>
        </View>
      ) : null}
      <View style={[styles.captureArea, { bottom: 40 + insets.bottom }]}>
        <Text style={styles.hint}>Enquadre o objeto da tarefa e tire a foto</Text>
        <Pressable style={styles.captureButton} onPress={capture}>
          <View style={styles.captureInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  preview: {
    flex: 1,
    width: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 52,
    zIndex: 10,
  },
  closeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  hint: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
  captureArea: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    backgroundColor: '#0f172a',
  },
  button: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#94a3b8',
    flex: 1,
  },
  buttonGhostText: {
    color: '#f8fafc',
  },
  buttonRetake: {
    backgroundColor: '#dc2626',
    marginBottom: 12,
  },
  buttonRetakeText: {
    color: '#ffffff',
  },
  permissionText: {
    color: '#334155',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  verdictTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  verdictReason: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 24,
  },
  verdictConfidence: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  gpsWarning: {
    fontSize: 13,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  progressText: {
    marginTop: 16,
    fontSize: 15,
    color: '#0f172a',
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
  },
});
