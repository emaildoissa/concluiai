import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [unitName, setUnitName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.unit_id) return;
      const { data } = await supabase
        .from('units')
        .select('name')
        .eq('id', profile.unit_id)
        .maybeSingle();
      if (!cancelled && data) setUnitName(data.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.unit_id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{profile?.full_name ?? 'Operador'}</Text>
      <Text style={styles.detail}>{profile?.email ?? session?.user?.email}</Text>
      <Text style={styles.detail}>
        {profile?.role === 'admin'
          ? 'Administrador'
          : profile?.role === 'manager'
            ? 'Gerente'
            : 'Operador'}
      </Text>
      <Text style={styles.detail}>Unidade: {unitName ?? profile?.unit_id ?? '—'}</Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleSignOut}
      >
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 24,
    gap: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  detail: {
    fontSize: 14,
    color: '#475569',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
