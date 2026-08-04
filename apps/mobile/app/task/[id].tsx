import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import type { EvidenceRow, TaskInstanceRow } from '../../src/lib/types';

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Finalizada',
  late: 'Atrasada',
  rejected: 'Recusada pela IA',
  skipped: 'Pulada',
};

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskInstanceRow | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: taskData, error } = await supabase
      .from('task_instances')
      .select(
        'id, scheduled_date, due_at, status, completed_at, checklist_items(id, title, description, is_critical, requires_photo, requires_gps, due_time)',
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setTask(taskData as unknown as TaskInstanceRow);

    const { data: evData } = await supabase
      .from('evidences')
      .select('id, task_instance_id, photo_url, review_status, ai_reason, ai_confidence, captured_at')
      .eq('task_instance_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setEvidence((evData as unknown as EvidenceRow) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Text>Tarefa não encontrada.</Text>
      </View>
    );
  }

  const item = task.checklist_items;
  const canRedo = task.status === 'rejected' || task.status === 'pending' || task.status === 'late' || task.status === 'in_progress';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{item.title}</Text>
      {item.is_critical ? (
        <View style={styles.criticalBadge}>
          <Text style={styles.criticalBadgeText}>TAREFA CRÍTICA</Text>
        </View>
      ) : null}

      {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Status</Text>
        <Text style={styles.infoValue}>{STATUS_LABEL[task.status] ?? task.status}</Text>

        <Text style={styles.infoLabel}>Prazo</Text>
        <Text style={styles.infoValue}>{formatDue(task.due_at)}</Text>

        <Text style={styles.infoLabel}>Exige foto</Text>
        <Text style={styles.infoValue}>{item.requires_photo ? 'Sim' : 'Não'}</Text>
      </View>

      {evidence?.review_status === 'rejected' ? (
        <View style={styles.rejectedCard}>
          <Text style={styles.rejectedTitle}>Motivo da recusa (IA)</Text>
          <Text style={styles.rejectedReason}>{evidence.ai_reason ?? 'Foto fora do padrão.'}</Text>
        </View>
      ) : null}

      {evidence?.review_status === 'approved' ? (
        <View style={styles.approvedCard}>
          <Text style={styles.approvedTitle}>Foto aprovada ✓</Text>
          <Text style={styles.approvedReason}>
            {evidence.ai_reason ?? 'Evidência dentro do padrão.'}
          </Text>
          {evidence.ai_confidence != null ? (
            <Text style={styles.approvedConfidence}>
              Confiança da IA: {Math.round(evidence.ai_confidence * 100)}%
            </Text>
          ) : null}
        </View>
      ) : null}

      {canRedo ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push(`/camera/${task.id}`)}
        >
          <Text style={styles.buttonText}>
            {task.status === 'rejected' ? 'Tirar foto novamente' : 'Tirar foto'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  criticalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  criticalBadgeText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    marginTop: 12,
    fontSize: 14,
    color: '#334155',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#0f172a',
    marginTop: 2,
  },
  rejectedCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  rejectedTitle: {
    color: '#b91c1c',
    fontWeight: '700',
    marginBottom: 4,
  },
  rejectedReason: {
    color: '#7f1d1d',
    fontSize: 14,
  },
  approvedCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  approvedTitle: {
    color: '#15803d',
    fontWeight: '700',
    marginBottom: 4,
  },
  approvedReason: {
    color: '#14532d',
    fontSize: 14,
  },
  approvedConfidence: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
});
