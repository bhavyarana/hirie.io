'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserRecord, AuthError, NetworkError } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

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

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.me(),
    staleTime: 0,
    gcTime: 0,
    // Let react-query retry on NetworkError, but not on AuthError
    retry: (failureCount, err) => {
      if (err instanceof AuthError) return false;   // real auth failure → no retry
      if (err instanceof NetworkError) return failureCount < 2; // network → retry twice more
      return false;
    },
    retryDelay: (attempt) => 500 * (attempt + 1),
  });

  // Show a non-intrusive toast on network errors so the user knows
  // something is wrong — without logging them out.
  useEffect(() => {
    if (error && error instanceof NetworkError) {
      toast.warning('Connection issue — some data may be unavailable. Retrying…', {
        id: 'network-error',   // deduplicate: only show once even if re-triggered
        duration: 5000,
      });
    }
  }, [error]);

  return (
    <UserContext.Provider value={{
      user: data?.user ?? null,
      role: data?.user?.role ?? '',
      // Still show as "loading" during network retries so the UI doesn't flash
      loading: isLoading || (!!error && error instanceof NetworkError),
      refetch,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
