import { useEffect, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSecurityPolicy } from '../../data/api';
import { sanitizeSecurityPolicy, type SecurityPolicy } from '../../data/authStore';
import type { Screen } from '../../data/rbac';
import { Aviso, BOTAO_PRIMARIO, CabecalhoSecao, Carregando, Cartao, Dado } from './ui';

/**
 * Segurança: a política da clínica, só leitura. A edição continua em Usuários
 * → Segurança, onde já existe e onde fica a regra de que só o usuário Sistema
 * altera; duplicar o formulário aqui seria ter dois lugares para a mesma
 * regra, e um deles errado mais cedo ou mais tarde.
 */
export function SecaoSeguranca({ onNavigate }: { onNavigate?: (tela: Screen) => void }) {
  const { tenantId, can } = useAuth();
  const [politica, setPolitica] = useState<SecurityPolicy | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    fetchSecurityPolicy(tenantId)
      .then((p) => setPolitica(sanitizeSecurityPolicy(p)))
      .catch(() => setErro('Não foi possível carregar a política de segurança.'));
  }, [tenantId]);

  const regraDeSenha = (p: SecurityPolicy) => [
    p.requireUppercase && 'maiúscula', p.requireLowercase && 'minúscula',
    p.requireNumber && 'número', p.requireSpecialChar && 'caractere especial',
  ].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        titulo="Segurança"
        descricao="Regras de senha, bloqueio e inatividade que valem para todos os usuários da clínica."
        acao={onNavigate && can('users', 'view') ? (
          <button type="button" onClick={() => onNavigate('users')} className={BOTAO_PRIMARIO}>Editar em Usuários</button>
        ) : undefined}
      />

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!politica && !erro && <Carregando />}

      {politica && (
        <>
          <Cartao titulo="Senha">
            <dl className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <Dado rotulo="Senha forte">{politica.requireStrongPassword ? `Exigida: ${regraDeSenha(politica) || 'só o tamanho'}` : 'Não exigida'}</Dado>
              <Dado rotulo="Tamanho mínimo">{politica.minPasswordLength} caracteres</Dado>
              <Dado rotulo="Validade">{politica.passwordExpiryDays ? `Troca a cada ${politica.passwordExpiryDays} dias` : 'Não expira'}</Dado>
              <Dado rotulo="Dados pessoais na senha"><Sim valor={politica.disallowPersonalData} sim="Proibidos" nao="Permitidos" /></Dado>
              <Dado rotulo="Troca no primeiro acesso"><Sim valor={politica.forcePasswordChangeOnFirstAccess} sim="Obrigatória" nao="Opcional" /></Dado>
              <Dado rotulo="Senha temporária do administrador">Vale {politica.adminResetPasswordTtlHours} h</Dado>
            </dl>
          </Cartao>

          <Cartao titulo="Acesso">
            <dl className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <Dado rotulo="Bloqueio">{politica.maxFailedAttempts} tentativas erradas bloqueiam por {politica.lockoutMinutes} min</Dado>
              <Dado rotulo="Inatividade">Sai sozinho após {politica.idleTimeoutMinutes} min sem uso</Dado>
              <Dado rotulo="Verificação em duas etapas">Ainda não disponível</Dado>
            </dl>
          </Cartao>

          <p className="text-sm text-gray-600">
            Só o usuário Sistema da clínica altera a política. Toda alteração fica registrada no histórico de acessos.
          </p>
        </>
      )}
    </div>
  );
}

function Sim({ valor, sim, nao }: { valor: boolean; sim: string; nao: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {valor ? <Check className="h-4 w-4 text-green-700" aria-hidden="true" /> : <Minus className="h-4 w-4 text-gray-500" aria-hidden="true" />}
      {valor ? sim : nao}
    </span>
  );
}
