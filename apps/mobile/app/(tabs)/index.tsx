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
import { colors, radius, shadow, spacing, typography } from '../../src/lib/theme';
import { SHIFT_LABEL } from '../../src/lib/labels';
import type { TodayGroup, TodayTask } from '../../src/lib/types';

const SECTIONS: { key: TodayGroup; title: string; color: string }[] = [
  { key: 'late', title: 'Atrasadas', color: colors.danger },
  { key: 'pending', title: 'Pendentes', color: colors.warning },
  { key: 'completed', title: 'Finalizadas', color: colors.success },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

interface ChecklistGroup {
  name: string;
  shift: string | null;
  tasks: TodayTask[];
  late: number;
  pending: number;
  completed: number;
}

export default function TodayScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [groups, setGroups] = useState<ChecklistGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!profile?.unit_id) {
      setGroups([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);

    const { data, error: queryError } = await supabase
      .from('task_instances')
      .select(
        'id, scheduled_date, due_at, status, checklist_items(id, title, description, is_critical, requires_photo, requires_gps, due_time, checklist:checklists(name, shift))',
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

    const mapped: TodayTask[] = (data ?? []).map((row: any) => {
      const status = row.status as TodayTask['status'];
      let group: TodayGroup;
      if (status === 'completed') group = 'completed';
      else if (status === 'rejected') group = 'pending';
      else {
        const due = new Date(row.due_at);
        const dueWall = due.getUTCHours() * 60 + due.getUTCMinutes();
        const localNow = new Date();
        const nowWall = localNow.getHours() * 60 + localNow.getMinutes();
        group = nowWall > dueWall ? 'late' : 'pending';
      }

      const checklist = Array.isArray(row.checklist_items?.checklist)
        ? row.checklist_items.checklist[0]
        : row.checklist_items?.checklist;

      return {
        instance_id: row.id,
        title: row.checklist_items?.title ?? 'Tarefa',
        description: row.checklist_items?.description ?? null,
        is_critical: row.checklist_items?.is_critical ?? false,
        due_at: row.due_at,
        status,
        group,
        checklist_name: checklist?.name ?? 'Checklist',
        checklist_shift: checklist?.shift ?? null,
      };
    });

    const map = new Map<string, ChecklistGroup>();
    for (const t of mapped) {
      let g = map.get(t.checklist_name);
      if (!g) {
        g = { name: t.checklist_name, shift: t.checklist_shift, tasks: [], late: 0, pending: 0, completed: 0 };
        map.set(t.checklist_name, g);
      }
      g.tasks.push(t);
      if (t.group === 'late') g.late += 1;
      else if (t.group === 'pending') g.pending += 1;
      else g.completed += 1;
    }

    const sorted = [...map.values()].sort((a, b) =>
      (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()),
    );

    setGroups(sorted);
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

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTasks(); }} tintColor={colors.primary} />
      }
    >
      {groups.map((group) => {
        const isOpen = expanded.has(group.name);
        return (
          <View key={group.name} style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.checklistCard, pressed && styles.cardPressed]}
              onPress={() => toggle(group.name)}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>{group.name}</Text>
                  <Text style={styles.cardSubtitle}>
                    {group.shift ? `${SHIFT_LABEL[group.shift] ?? group.shift} · ` : ''}
                    {group.tasks.length} {group.tasks.length === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
                <Text style={styles.chevron}>{isOpen ? '▾' : '▸'}</Text>
              </View>
              <View style={styles.badges}>
                {group.late > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
                    <Text style={[styles.badgeText, { color: colors.onDanger }]}>
                      {group.late} atrasada{group.late > 1 ? 's' : ''}
                    </Text>
                  </View>
                ) : null}
                {group.pending > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.badgeText, { color: colors.onWarning }]}>
                      {group.pending} pendente{group.pending > 1 ? 's' : ''}
                    </Text>
                  </View>
                ) : null}
                {group.completed > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.badgeText, { color: colors.onSuccess }]}>
                      {group.completed} finalizada{group.completed > 1 ? 's' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>

            {isOpen ? (
              <View style={styles.expanded}>
                {SECTIONS.map((section) => {
                  const items = group.tasks.filter((t) => t.group === section.key);
                  if (items.length === 0) return null;
                  return (
                    <View key={section.key} style={styles.innerSection}>
                      <Text style={styles.innerSectionTitle}>
                        {section.title} ({items.length})
                      </Text>
                      {items.map((task) => (
                        <Pressable
                          key={task.instance_id}
                          style={({ pressed }) => [
                            styles.taskCard,
                            { borderLeftColor: section.color },
                            pressed && styles.cardPressed,
                          ]}
                          onPress={() => router.push(`/task/${task.instance_id}`)}
                        >
                          <View style={styles.taskCardRow}>
                            <Text style={styles.taskTitle}>{task.title}</Text>
                            <View style={styles.timePill}>
                              <Text style={styles.taskTime}>{formatTime(task.due_at)}</Text>
                            </View>
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
              </View>
            ) : null}
          </View>
        );
      })}

      {groups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.empty}>
            {profile?.unit_id
              ? 'Nenhuma tarefa para hoje.'
              : 'Perfil do operador não encontrado. Contate o administrador.'}
          </Text>
        </View>
      ) : null}
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
  section: {
    marginBottom: spacing.lg,
  },
  checklistCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
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
  cardTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  chevron: {
    fontSize: 18,
    color: colors.textMuted,
  },
  cardSubtitle: {
    fontSize: typography.small,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: typography.tiny + 1,
    fontWeight: '600',
  },
  expanded: {
    marginTop: spacing.sm,
  },
  innerSection: {
    paddingHorizontal: 4,
  },
  innerSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    ...shadow.card,
  },
  taskCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskTitle: {
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
  taskTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  criticalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  criticalBadgeText: {
    color: colors.onDanger,
    fontSize: 10,
    fontWeight: '700',
  },
  rejectedText: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 6,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    ...shadow.card,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.xxl,
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
