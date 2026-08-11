import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, shadow, spacing, typography } from '../../src/lib/theme';

interface Summary {
  total: number;
  completed: number;
  pending: number;
  late: number;
  rejected: number;
  criticalTotal: number;
  criticalDone: number;
  score: number;
}

export default function SummaryScreen() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.unit_id) {
      setSummary(null);
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data, error: queryError } = await supabase
      .from('task_instances')
      .select('id, status, checklist_items(is_critical)')
      .eq('unit_id', profile.unit_id)
      .eq('scheduled_date', today);

    if (queryError) {
      console.error(queryError);
      setError('Não foi possível carregar o resumo. Verifique sua conexão.');
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as any[];
    const isDone = (s: string) => s === 'completed';
    const summary: Summary = {
      total: rows.length,
      completed: rows.filter((r) => isDone(r.status)).length,
      pending: rows.filter((r) => r.status === 'pending' || r.status === 'in_progress').length,
      late: rows.filter((r) => r.status === 'late').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      criticalTotal: rows.filter((r) => r.checklist_items?.is_critical).length,
      criticalDone: rows.filter((r) => r.checklist_items?.is_critical && isDone(r.status)).length,
      score: 0,
    };
    summary.score = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

    setSummary(summary);
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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  const s = summary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Execução de hoje</Text>
        <Text style={styles.scoreValue}>{s?.score ?? 0}%</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${s?.score ?? 0}%` }]} />
        </View>
        <Text style={styles.scoreSub}>
          {s?.completed ?? 0} de {s?.total ?? 0} tarefas concluídas
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={[styles.statCard, { borderLeftColor: colors.success }]}>
          <Text style={styles.statValue}>{s?.completed ?? 0}</Text>
          <Text style={styles.statLabel}>Finalizadas</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: colors.warning }]}>
          <Text style={styles.statValue}>{s?.pending ?? 0}</Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: colors.danger }]}>
          <Text style={styles.statValue}>{s?.late ?? 0}</Text>
          <Text style={styles.statLabel}>Atrasadas</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#7c3aed' }]}>
          <Text style={styles.statValue}>{s?.rejected ?? 0}</Text>
          <Text style={styles.statLabel}>Recusadas</Text>
        </View>
      </View>

      <View style={styles.criticalCard}>
        <Text style={styles.criticalTitle}>Tarefas críticas</Text>
        <Text style={styles.criticalValue}>
          {s?.criticalDone ?? 0} de {s?.criticalTotal ?? 0} concluídas
        </Text>
        <Text style={styles.criticalHint}>
          Críticas são itens vitais (ex.: conferência de gás). Fique de olho no prazo.
        </Text>
      </View>
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
  scoreCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  scoreLabel: {
    color: colors.textSubtle,
    fontSize: 14,
  },
  scoreValue: {
    color: colors.primary,
    fontSize: typography.display,
    fontWeight: '800',
    marginTop: 4,
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceAltBorder,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  scoreSub: {
    color: colors.textSubtle,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderLeftWidth: 4,
    ...shadow.card,
  },
  statValue: {
    fontSize: typography.value,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  criticalCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  criticalTitle: {
    color: colors.onDanger,
    fontWeight: '700',
  },
  criticalValue: {
    color: colors.onDanger,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  criticalHint: {
    color: colors.onDanger,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    padding: spacing.xxl,
  },
});
