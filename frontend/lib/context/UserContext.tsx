'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserRecord } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

interface UserContextValue {
  user: UserRecord | null;
  role: string;
  loading: boolean;
  refetch: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  role: '',
  loading: true,
  refetch: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // When the Supabase auth session changes (sign-in / sign-out),
  // immediately clear ALL cached data and re-fetch the current user.
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Wipe every cached query so the next user gets a fresh state
        queryClient.clear();
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Invalidate /me so it re-fetches for the newly signed-in user
        queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.me(),
    // No staleTime — always fetch fresh auth data. 
    // gcTime controls how long to keep in memory when unused.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  return (
    <UserContext.Provider value={{
      user: data?.user ?? null,
      role: data?.user?.role ?? '',
      loading: isLoading,
      refetch,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
