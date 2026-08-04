import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';

interface Material {
  id: string;
  title: string;
  description: string | null;
  content_url: string | null;
  content_type: string;
}

const TYPE_LABEL: Record<string, string> = {
  guide: 'Guia',
  video: 'Vídeo',
  course: 'Curso',
  checklist: 'Checklist',
};

export default function TrainingScreen() {
  const { profile } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.company_id) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('training_materials')
      .select('id, title, description, content_url, content_type')
      .eq('company_id', profile.company_id)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error(queryError);
      setError('Não foi possível carregar os materiais. Verifique sua conexão.');
      setLoading(false);
      return;
    }

    setMaterials(data ?? []);
    setError(null);
    setLoading(false);
  }, [profile?.company_id]);

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
      {!error && materials.length === 0 ? (
        <Text style={styles.empty}>Nenhum material de treinamento publicado.</Text>
      ) : null}

      {materials.map((m) => (
        <View key={m.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{m.title}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{TYPE_LABEL[m.content_type] ?? m.content_type}</Text>
            </View>
          </View>
          {m.description ? <Text style={styles.cardDescription}>{m.description}</Text> : null}
          {m.content_url ? (
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => Linking.openURL(m.content_url!)}
            >
              <Text style={styles.buttonText}>Abrir material</Text>
            </Pressable>
          ) : null}
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  typeBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeText: {
    color: '#3730a3',
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569',
  },
  button: {
    marginTop: 12,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
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
