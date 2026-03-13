'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi, UserRecord } from '@/lib/api';

interface UserContextValue {
  user: UserRecord | null;
  role: string;
  loading: boolean;
  refetch: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  role: 'recruiter',
  loading: true,
  refetch: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => usersApi.me(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <UserContext.Provider value={{
      user: data?.user ?? null,
      role: data?.user?.role ?? 'recruiter',
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
