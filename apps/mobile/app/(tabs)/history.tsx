import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { STATUS_LABEL, statusColor } from '../../src/lib/labels';

interface HistoryTask {
  id: string;
  scheduled_date: string;
  due_at: string;
  status: string;
  title: string;
  is_critical: boolean;
}

interface HistoryDay {
  date: string;
  tasks: HistoryTask[];
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.unit_id) {
      setDays([]);
      setLoading(false);
      return;
    }

    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);

    const { data, error: queryError } = await supabase
      .from('task_instances')
      .select(
        'id, scheduled_date, due_at, status, checklist_items(id, title, is_critical)',
      )
      .eq('unit_id', profile.unit_id)
      .gte('scheduled_date', fromStr)
      .lte('scheduled_date', toStr)
      .order('scheduled_date', { ascending: false })
      .order('due_at', { ascending: true });

    if (queryError) {
      console.error(queryError);
      setError('Não foi possível carregar o histórico. Verifique sua conexão.');
      setLoading(false);
      return;
    }

    const map = new Map<string, HistoryTask[]>();
    for (const row of (data ?? []) as any[]) {
      const date = row.scheduled_date;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push({
        id: row.id,
        scheduled_date: row.scheduled_date,
        due_at: row.due_at,
        status: row.status,
        title: row.checklist_items?.title ?? 'Tarefa',
        is_critical: row.checklist_items?.is_critical ?? false,
      });
    }

    setDays([...map.entries()].map(([date, tasks]) => ({ date, tasks })));
    setError(null);
    setLoading(false);
  }, [profile?.unit_id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && days.length === 0 ? (
        <Text style={styles.empty}>Sem tarefas nos últimos 7 dias.</Text>
      ) : null}

      {days.map((day) => (
        <View key={day.date} style={styles.daySection}>
          <Text style={styles.dayTitle}>{formatDay(day.date)}</Text>
          {day.tasks.map((task) => (
            <Pressable
              key={task.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/task/${task.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{task.title}</Text>
                <Text style={styles.cardTime}>{formatTime(task.due_at)}</Text>
              </View>
              <View style={styles.cardBottom}>
                <Text style={[styles.cardStatus, { color: statusColor(task.status) }]}>
                  {STATUS_LABEL[task.status] ?? task.status}
                </Text>
                {task.is_critical ? <Text style={styles.critical}>CRÍTICA</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  daySection: {
    marginBottom: 20,
  },
  dayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'capitalize',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
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
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  cardStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  critical: {
    marginLeft: 8,
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 40,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
});
