import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { STATUS_LABEL, statusColor } from '../../src/lib/labels';
import { colors, radius, shadow, spacing, typography } from '../../src/lib/theme';
import { formatDayPtBR } from '../../src/lib/format';

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
  return formatDayPtBR(date);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
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
        <ActivityIndicator size="large" color={colors.primary} />
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
                <View style={styles.timePill}>
                  <Text style={styles.cardTime}>{formatTime(task.due_at)}</Text>
                </View>
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
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  daySection: {
    marginBottom: spacing.xl,
  },
  dayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
    ...shadow.card,
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
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  timePill: {
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
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
    marginLeft: spacing.sm,
    color: colors.onDanger,
    fontSize: 11,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 40,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
