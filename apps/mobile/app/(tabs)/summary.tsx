import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';

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
        <ActivityIndicator size="large" />
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
        <View style={[styles.statCard, { borderLeftColor: '#16a34a' }]}>
          <Text style={styles.statValue}>{s?.completed ?? 0}</Text>
          <Text style={styles.statLabel}>Finalizadas</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#d97706' }]}>
          <Text style={styles.statValue}>{s?.pending ?? 0}</Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#dc2626' }]}>
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
  scoreCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  scoreLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  scoreValue: {
    color: '#f59e0b',
    fontSize: 44,
    fontWeight: '800',
    marginTop: 4,
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#f59e0b',
  },
  scoreSub: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  criticalCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  criticalTitle: {
    color: '#b91c1c',
    fontWeight: '700',
  },
  criticalValue: {
    color: '#7f1d1d',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  criticalHint: {
    color: '#991b1b',
    fontSize: 13,
    marginTop: 8,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
});
