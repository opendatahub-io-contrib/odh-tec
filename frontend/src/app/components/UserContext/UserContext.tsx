import React, { createContext, useContext, useState } from 'react';

interface UserContextType {
  userName: string;
  setUserName: (name: string) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userName, setUserName] = useState<string>('DefaultUser'); // Replace with logic to fetch the username

  return (
    <UserContext.Provider value={{ userName, setUserName }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};