import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  addAccessLog,
  buildUserAvatar,
  getIpAddress,
  getRoleLabel,
  type Platform,
  type Role
} from '../data/authStore';
import { TELAS_DE_TODOS, getModuleForScreen, perfilAbreTela, type Screen } from '../data/rbac';
import {
  descartarToken,
  fetchPermissions,
  guardarToken,
  loginRequest,
  recordAccessLog,
  registrarPerdaDeSessao,
  type PermissionRow,
} from '../data/api';

interface AuthUser {
  id: string;
  tenantId: string;
  login: string;
  name: string;
  role: Role;
  roleLabel: string;
  avatar: string;
  platforms: Platform[];
}

interface AuthContextType {
  user: AuthUser | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }>;
  logout: (action?: string) => void;
  can: (module: string, action: 'view' | 'create' | 'edit' | 'delete') => boolean;
  /** A tela abre para este usuário? Junta a permissão do módulo e o filtro de telas do perfil. */
  podeAbrirTela: (screen: Screen) => boolean;
  recordAccess: (log: { action: string; module: string; platform: Platform; status: 'SUCESSO' | 'FALHA' | 'BLOQUEADO' }) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sessionKey = (tenantId: string) => `cuidai_session_${tenantId}`;


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, PermissionRow>>({});
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const storedTenant = localStorage.getItem('tenant');
    setTenantId(storedTenant);
    if (storedTenant) {
      const storedSession = localStorage.getItem(sessionKey(storedTenant));
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession) as AuthUser;
          setUser(parsed);
        } catch {
          localStorage.removeItem(sessionKey(storedTenant));
        }
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!tenantId || !user) return;
    fetchPermissions(tenantId, user.role)
      .then((data) => {
        const next = data.reduce<Record<string, PermissionRow>>((acc, perm) => {
          acc[perm.module] = perm;
          return acc;
        }, {});
        setPermissions(next);
      })
      .catch(() => setPermissions({}));
  }, [tenantId, user]);

  const recordAccess = (log: { action: string; module: string; platform: Platform; status: 'SUCESSO' | 'FALHA' | 'BLOQUEADO' }) => {
    if (!tenantId) return;
    recordAccessLog(tenantId, {
      user_id: user?.id,
      action: log.action,
      module: log.module,
      platform: log.platform,
      status: log.status,
      ip_address: getIpAddress()
    }).catch(() => {
      addAccessLog(tenantId, {
        user_id: user?.id,
        action: log.action,
        module: log.module,
        platform: log.platform,
        status: log.status,
        ip_address: getIpAddress()
      });
    });
  };

  // Qualquer 401 vindo da API significa que o token morreu (expirou, o usuario
  // foi desativado, o perfil mudou). Sem isto a interface continuaria exibindo
  // uma sessao que o servidor ja nao reconhece.
  useEffect(() => {
    registrarPerdaDeSessao(() => {
      setUser(null);
      setPermissions(null);
    });
  }, []);

  const handleLogout = (action: string) => {
    if (tenantId && user) {
      recordAccessLog(tenantId, {
        user_id: user.id,
        action,
        module: 'Sistema',
        platform: 'web',
        status: 'SUCESSO',
        ip_address: getIpAddress()
      }).catch(() => {
        addAccessLog(tenantId, {
          user_id: user.id,
          action,
          module: 'Sistema',
          platform: 'web',
          status: 'SUCESSO',
          ip_address: getIpAddress()
        });
      });
    }
    setUser(null);
    // O token some junto com a sessao. Deixa-lo para tras significaria que
    // qualquer aba aberta seguiria autenticada depois do logout.
    descartarToken();
    if (tenantId) {
      localStorage.removeItem(sessionKey(tenantId));
    }
  };

  const login = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }> => {
    const currentTenant = localStorage.getItem('tenant');
    setTenantId(currentTenant);
    if (!currentTenant) {
      return { success: false, error: 'Selecione a empresa para continuar.' };
    }
    try {
      const response = await loginRequest({
        tenant: currentTenant,
        username: String(username).trim().toLowerCase(),
        password
      });

      if (response.mustChangePassword) {
        return {
          success: false,
          requiresPasswordChange: true,
          error: 'Troca de senha obrigatória no primeiro acesso.'
        };
      }

      // Antes de qualquer outra coisa: sem o token guardado, as chamadas
      // seguintes (permissoes, logs) sairiam sem credencial e voltariam 401.
      guardarToken(response.token);

      const userData: AuthUser = {
        id: response.id,
        tenantId: response.tenantId,
        login: response.login,
        name: response.name,
        role: response.role as Role,
        roleLabel: getRoleLabel(response.role as Role),
        avatar: buildUserAvatar(response.name),
        platforms: response.platforms as Platform[]
      };

      setUser(userData);
      localStorage.setItem(sessionKey(currentTenant), JSON.stringify(userData));
      recordAccessLog(currentTenant, {
        user_id: response.id,
        action: 'Login',
        module: 'Sistema',
        platform: 'web',
        status: 'SUCESSO',
        ip_address: getIpAddress()
      }).catch(() => {
        addAccessLog(currentTenant, {
          user_id: response.id,
          action: 'Login',
          module: 'Sistema',
          platform: 'web',
          status: 'SUCESSO',
          ip_address: getIpAddress()
        });
      });

      const perms = await fetchPermissions(currentTenant, response.role);
      const next = perms.reduce<Record<string, PermissionRow>>((acc, perm) => {
        acc[perm.module] = perm;
        return acc;
      }, {});
      setPermissions(next);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.';
      return { success: false, error: message };
    }
  };

  const logout = (action = 'Logout') => handleLogout(action);

  const can = (module: string, action: 'view' | 'create' | 'edit' | 'delete') => {
    if (!user || !tenantId) return false;
    return Boolean(permissions?.[module]?.[action]);
  };

  const podeAbrirTela = (screen: Screen) =>
    perfilAbreTela(user?.role, screen) &&
    (TELAS_DE_TODOS.has(screen) || can(getModuleForScreen(screen), 'view'));

  useEffect(() => {
    if (!tenantId || !user) return;

    const resetTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        handleLogout('Logout por inatividade');
      }, 30 * 60 * 1000);
    };

    const events: Array<keyof WindowEventMap> = ['click', 'mousemove', 'keydown', 'scroll'];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [tenantId, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenantId,
        isAuthenticated: !!user,
        login,
        logout,
        can,
        podeAbrirTela,
        recordAccess,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
