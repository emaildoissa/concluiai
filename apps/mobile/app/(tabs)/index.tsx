import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import type { TodayGroup, TodayTask } from '../../src/lib/types';

const SECTIONS: { key: TodayGroup; title: string; color: string }[] = [
  { key: 'late', title: 'Atrasadas', color: '#dc2626' },
  { key: 'pending', title: 'Pendentes', color: '#d97706' },
  { key: 'completed', title: 'Finalizadas', color: '#16a34a' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function TodayScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!profile?.unit_id) {
      setTasks([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);

    const { data, error: queryError } = await supabase
      .from('task_instances')
      .select(
        'id, scheduled_date, due_at, status, checklist_items(id, title, description, is_critical, requires_photo, requires_gps, due_time)',
      )
      .eq('unit_id', profile.unit_id)
      .eq('scheduled_date', today)
      .order('due_at', { ascending: true });

    if (queryError) {
      console.error(queryError);
      setError('Não foi possível carregar as tarefas. Verifique sua conexão.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const now = Date.now();
    const mapped: TodayTask[] = (data ?? []).map((row: any) => {
      const status = row.status as TodayTask['status'];
      let group: TodayGroup;
      if (status === 'completed') group = 'completed';
      else if (status === 'rejected') group = 'pending';
      else group = new Date(row.due_at).getTime() < now ? 'late' : 'pending';

      return {
        instance_id: row.id,
        title: row.checklist_items?.title ?? 'Tarefa',
        description: row.checklist_items?.description ?? null,
        is_critical: row.checklist_items?.is_critical ?? false,
        due_at: row.due_at,
        status,
        group,
      };
    });

    setTasks(mapped);
    setError(null);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.unit_id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTasks();
    }, [loadTasks]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
          onPress={() => {
            setError(null);
            setLoading(true);
            loadTasks();
          }}
        >
          <Text style={styles.retryText}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTasks(); }} />}
    >
      {SECTIONS.map((section) => {
        const items = tasks.filter((t) => t.group === section.key);
        if (items.length === 0) return null;

        return (
          <View key={section.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.dot, { backgroundColor: section.color }]} />
              <Text style={styles.sectionTitle}>
                {section.title} ({items.length})
              </Text>
            </View>

            {items.map((task) => (
              <Pressable
                key={task.instance_id}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(`/task/${task.instance_id}`)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{task.title}</Text>
                  <Text style={styles.cardTime}>{formatTime(task.due_at)}</Text>
                </View>
                {task.is_critical ? (
                  <View style={styles.criticalBadge}>
                    <Text style={styles.criticalBadgeText}>CRÍTICA</Text>
                  </View>
                ) : null}
                {task.status === 'rejected' ? (
                  <Text style={styles.rejectedText}>Recusada pela IA — refaça</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        );
      })}

      {tasks.length === 0 ? (
        <Text style={styles.empty}>
          {profile?.unit_id
            ? 'Nenhuma tarefa para hoje.'
            : 'Perfil do operador não encontrado. Contate o administrador.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  cardTime: {
    fontSize: 13,
    color: '#64748b',
  },
  criticalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 8,
  },
  criticalBadgeText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  rejectedText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 6,
  },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 40,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryPressed: {
    opacity: 0.85,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
